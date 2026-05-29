'use strict';
require('dotenv').config();

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { fetchSmartSuiteData } = require('./refresh-data');

// ── SmartSuite constants (shared with refresh-data.js) ────────────────────
const SS_ACCOUNT_ID  = 's71hvw05';
const SS_BASE_URL    = 'https://app.smartsuite.com/api/v1';
const SS_PROJECTS_ID = '68216a706900e8eaf75a05a7';
const SS_BUDGET_APP  = '69bb89ebf6a195c2c73a3b3e';

// Fields needed by product-line dashboards (lean subset of 173-field schema)
const DASHBOARD_FIELDS = [
  'title', 'status', 's4687ad08c',              // name, status, product type
  'sfa6ec0fec', 's8227b8fc4', 's7e23170f2',     // pipeline/award/wip dates
  's695a5c195', 's17kv07k', 'secceac461',       // out-of-wip / close dates
  'scc0298307',                                  // Estimated Construction End Date
  'sacaa33d0f', 's5efff6ee9', 's828d7f9ef',     // owners, sage job ID, SB company
  'sz83pw9x',                                    // Link to Baseline Budget Items (for join)
];

// Budget fields needed to compute per-project revenue summary
const BUDGET_FIELDS = [
  's2ba7b261b',   // Project (linked) — for grouping
  'sb54d9092a',   // Revenue Track (pO6Hh=Track1, UhSZv=Track2)
  's40ca9cdee',   // Cash Flow Lookup → "Operating Cash-Income" / "Operating Cash-COGS"
  'sc507e6b54',   // Estimated Budget — earliest stage manual estimate
  'sed808550d',   // Baseline Budget formula (G702 → manual s818f40f1d → blank)
  'sa1a3abded',   // Change Orders formula (G702 → manual s432af3d33 → blank)
  's531f1d6ab',   // Adjusted Budget = Baseline + Change Orders
  's160aa943b',   // Completed to Date formula (G702 → G703 → manual → blank)
  's0f7c08530',   // Actual Amount formula (same as above, but different fallback field)
  's6506ec407',   // Balance to Finish = Adjusted − Completed to Date
  's3636482e0',   // % Complete = Complete to Date / Adjusted
  's32eed8560',   // Account description (display label)
  's363b6d973',   // Linked G-702(s) — presence indicates billing has started
];

// Product Type record IDs
const DISPOSITION_TYPE_IDS  = [
  '6a0629f81c9e28015cf0e856',  // Turnkey Disposition Services (CM & Brokerage)
  '6a0655d2d3d9287b9a07591b',  // Turnkey Disposition Services (Brokerage Only)
];
const CONSTRUCTION_TYPE_IDS = [
  '6a0629f81c9e28015cf0e85b',  // Construction (formerly "3rd party GC-Precon & Construct")
];

// Status value → pipeline stage mapping (from live SmartSuite status field options)
const CONSTRUCTION_STATUS_MAP = {
  'ready_for_review':                          { stage: 'S1', label: 'New Opportunity'    },
  'complete':                                  { stage: 'S1', label: 'Nurture'             },
  '21c0705b-0c3b-45cd-9e93-07672fac949d':     { stage: 'S1', label: 'Warm (6-12 mo)'     },
  'fb5677b7-3e68-4705-86af-abb8745a43f7':     { stage: 'S2', label: 'Hot (0-6 mo)'       },
  'backlog':                                   { stage: 'S2', label: 'Active Pipeline'     },
  'zOlNR':                                     { stage: 'S3', label: 'Active in WIP'      },
  'Swowl':                                     { stage: 'S4', label: 'Closeout & Warranty' },
  'Dio3d':                                     { stage: 'CLOSED', label: 'Closed'         },
  // Excluded — omit from dashboard counts
  '3ae0dcac-d82c-4171-95cd-3f40eed714d7':     { stage: 'EXCLUDE', label: 'Declined'      },
  '41590c12-77e8-494b-878e-2dbb27012ca4':     { stage: 'EXCLUDE', label: 'Job Lost'       },
};

const app     = express();
const PORT    = process.env.PORT || 3000;
const API_KEY = process.env.SMARTSUITE_API_KEY;

if (!API_KEY) {
  console.error('Error: SMARTSUITE_API_KEY is not set. Add it to .env or your environment.');
  process.exit(1);
}

// ── In-memory cache (portfolio planner) ───────────────────────────────────
let cache        = null;
let cacheTime    = null;
let fetchPromise = null;
const CACHE_TTL  = 30 * 60 * 1000; // 30 minutes

// ── Dashboard projects cache ────────────────────────────────────────────────
let dashCache     = null;
let dashCacheTime = null;
let dashPromise   = null;
const DASH_TTL    = 5 * 60 * 1000; // 5 minutes (matches frontend auto-refresh)

async function fetchDashboardProjects() {
  const headers = {
    'Authorization': `Token ${API_KEY}`,
    'ACCOUNT-ID':    SS_ACCOUNT_ID,
    'Content-Type':  'application/json',
  };

  const all = [];
  let offset = 0;
  while (true) {
    const res = await fetch(`${SS_BASE_URL}/applications/${SS_PROJECTS_ID}/records/list/`, {
      method:  'POST',
      headers,
      body: JSON.stringify({ limit: 500, offset, fields: DASHBOARD_FIELDS }),
    });
    if (!res.ok) throw new Error(`SmartSuite ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const items = data.items || [];
    all.push(...items);
    offset += items.length;
    if (!data.has_more || items.length === 0) break;
  }
  return all;
}

async function getDashboardProjects(force) {
  const now   = Date.now();
  const fresh = dashCache && dashCacheTime && (now - dashCacheTime) < DASH_TTL;

  if (dashCache && !force && fresh) {
    return { items: dashCache, lastUpdated: new Date(dashCacheTime).toISOString(), stale: false };
  }
  if (dashCache && !force && !fresh) {
    // Stale — serve immediately and refresh in background
    if (!dashPromise) {
      dashPromise = fetchDashboardProjects().then(items => {
        dashCache     = items;
        dashCacheTime = Date.now();
        dashPromise   = null;
        console.log(`Dashboard cache refreshed — ${items.length} raw project records`);
      }).catch(err => {
        dashPromise = null;
        console.error('Dashboard refresh failed:', err.message);
      });
    }
    return { items: dashCache, lastUpdated: new Date(dashCacheTime).toISOString(), stale: true };
  }

  // No cache or forced — must wait
  if (!dashPromise) {
    dashPromise = fetchDashboardProjects().then(items => {
      dashCache     = items;
      dashCacheTime = Date.now();
      dashPromise   = null;
      return items;
    }).catch(err => {
      dashPromise = null;
      throw err;
    });
  }
  await dashPromise;
  return { items: dashCache, lastUpdated: new Date(dashCacheTime).toISOString(), stale: false };
}

// ── Budget helpers ─────────────────────────────────────────────────────────

// Fetch all budget rows with the lean BUDGET_FIELDS subset
async function fetchAllBudgetRows() {
  const headers = {
    'Authorization': `Token ${API_KEY}`,
    'ACCOUNT-ID':    SS_ACCOUNT_ID,
    'Content-Type':  'application/json',
  };
  const all = [];
  let offset = 0;
  while (true) {
    const res = await fetch(`${SS_BASE_URL}/applications/${SS_BUDGET_APP}/records/list/`, {
      method: 'POST', headers,
      body: JSON.stringify({ limit: 500, offset, fields: BUDGET_FIELDS }),
    });
    if (!res.ok) throw new Error(`Budget API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const items = data.items || [];
    all.push(...items);
    offset += items.length;
    if (!data.has_more || items.length === 0) break;
  }
  return all;
}

// Given budget rows for ONE project, compute a revenue summary.
// The three-state model:
//   'estimate'  → only sc507e6b54 (Estimated Budget) is filled in
//   'baseline'  → sed808550d / s531f1d6ab are populated (contract signed, no G702 yet)
//   'billing'   → s0f7c08530 / s160aa943b are populated (G702 pay apps flowing)
function summariseBudget(rows) {
  const num = v => (v != null && v !== '' && !isNaN(parseFloat(v))) ? parseFloat(v) : null;
  const best = (row, ...fields) => {
    for (const f of fields) { const v = num(row[f]); if (v !== null) return v; }
    return null;
  };

  const revenueRows = rows.filter(r => (r.s40ca9cdee?.[0]?.[0] || '') === 'Operating Cash-Income');
  const cogsRows    = rows.filter(r => (r.s40ca9cdee?.[0]?.[0] || '') === 'Operating Cash-COGS');

  // Contract value per row: Adjusted > Baseline formula > Estimated
  const sumContract = (rowSet) => rowSet.reduce((s, r) =>
    s + (best(r, 's531f1d6ab', 'sed808550d', 'sc507e6b54') || 0), 0) || null;

  // Billed/Actuals per row: Actual Amount formula > Completed to Date formula
  const sumActuals = (rowSet) => {
    let total = 0, hasData = false;
    for (const r of rowSet) {
      const v = best(r, 's0f7c08530', 's160aa943b');
      if (v !== null) { total += v; hasData = true; }
    }
    return hasData ? total : null;
  };

  // BTF per row: Balance to Finish formula (s6506ec407) — only populated when Adjusted is set
  const sumBTF = (rowSet) => {
    let total = 0, hasData = false;
    for (const r of rowSet) {
      const v = num(r.s6506ec407);
      if (v !== null) { total += v; hasData = true; }
    }
    return hasData ? total : null;
  };

  const contractRevenue = sumContract(revenueRows);
  const contractCost    = sumContract(cogsRows);
  const billedRevenue   = sumActuals(revenueRows);
  const billedCost      = sumActuals(cogsRows);
  const btfRevenue      = sumBTF(revenueRows);

  // GP
  const contractGP = (contractRevenue != null && contractCost != null)
    ? contractRevenue - contractCost : null;
  const billedGP   = (billedRevenue != null && billedCost != null)
    ? billedRevenue - billedCost
    : billedRevenue != null ? billedRevenue * 0.09 : null;
  const gpRate     = contractRevenue ? (contractGP ?? 0) / contractRevenue : null;

  // BTF derived if formula not available
  const btf = btfRevenue ?? (contractRevenue != null
    ? contractRevenue - (billedRevenue || 0) : null);

  const pctComplete = (contractRevenue && billedRevenue != null)
    ? billedRevenue / contractRevenue : 0;

  // Determine data state
  const hasG702     = rows.some(r => (r.s363b6d973 || []).length > 0);
  const hasBaseline = rows.some(r => num(r.sed808550d) || num(r.s531f1d6ab));
  const hasEstimate = rows.some(r => num(r.sc507e6b54));
  const budgetState = hasG702 ? 'billing' : hasBaseline ? 'baseline' : hasEstimate ? 'estimate' : 'empty';

  return {
    contractRevenue, contractCost, contractGP, gpRate,
    billedRevenue, billedCost, billedGP,
    btf, pctComplete, budgetState, hasBudget: rows.length > 0,
  };
}

// ── Construction data cache (projects + budget) ────────────────────────────
let constCache     = null;
let constCacheTime = null;
let constPromise   = null;
const CONST_TTL    = 5 * 60 * 1000;

async function buildConstructionData() {
  // Fetch projects and all budget rows in parallel
  const [allProjects, allBudgetRows] = await Promise.all([
    fetchDashboardProjects(),
    fetchAllBudgetRows(),
  ]);

  // Filter to Construction type
  const projects = allProjects.filter(p => {
    const pt = Array.isArray(p.s4687ad08c) ? p.s4687ad08c : (p.s4687ad08c ? [p.s4687ad08c] : []);
    return CONSTRUCTION_TYPE_IDS.some(id => pt.includes(id));
  });

  const projIds = new Set(projects.map(p => p.id));

  // Group budget rows by project ID (rows may link to one project)
  const budgetByProject = {};
  for (const row of allBudgetRows) {
    const ids = Array.isArray(row.s2ba7b261b) ? row.s2ba7b261b : (row.s2ba7b261b ? [row.s2ba7b261b] : []);
    for (const pid of ids) {
      if (projIds.has(pid)) {
        (budgetByProject[pid] = budgetByProject[pid] || []).push(row);
      }
    }
  }

  // Annotate each project with stage mapping + budget summary
  const annotated = projects.map(p => {
    const statusVal = p.status?.value || '';
    const stageInfo = CONSTRUCTION_STATUS_MAP[statusVal] || { stage: 'S1', label: statusVal || 'Unknown' };
    const budgetRows = budgetByProject[p.id] || [];
    return {
      id:         p.id,
      title:      p.title || p.s937f1d342 || '—',
      statusValue: statusVal,
      stage:      stageInfo.stage,
      stageLabel: stageInfo.label,
      dates: {
        pipeline:   p.sfa6ec0fec?.date   || null,
        awarded:    p.s8227b8fc4?.date    || null,
        wip:        p.s7e23170f2?.date    || null,
        outOfWip:   p.s695a5c195?.date    || null,
        estClose:   p.secceac461?.date    || null,
        actClose:   p.s17kv07k?.date      || null,
        estConstEnd: p.scc0298307?.date   || null,
      },
      budget: summariseBudget(budgetRows),
    };
  }).filter(p => p.stage !== 'EXCLUDE');

  console.log(`Construction data built — ${annotated.length} projects, ${allBudgetRows.length} budget rows total`);
  return annotated;
}

async function getConstructionData(force) {
  const now   = Date.now();
  const fresh = constCache && constCacheTime && (now - constCacheTime) < CONST_TTL;

  if (constCache && !force && fresh) {
    return { projects: constCache, lastUpdated: new Date(constCacheTime).toISOString(), stale: false };
  }
  if (constCache && !force && !fresh) {
    if (!constPromise) {
      constPromise = buildConstructionData().then(data => {
        constCache = data; constCacheTime = Date.now(); constPromise = null;
      }).catch(err => { constPromise = null; console.error('Construction refresh failed:', err.message); });
    }
    return { projects: constCache, lastUpdated: new Date(constCacheTime).toISOString(), stale: true };
  }
  if (!constPromise) {
    constPromise = buildConstructionData().then(data => {
      constCache = data; constCacheTime = Date.now(); constPromise = null;
      return data;
    }).catch(err => { constPromise = null; throw err; });
  }
  await constPromise;
  return { projects: constCache, lastUpdated: new Date(constCacheTime).toISOString(), stale: false };
}

// ── Portfolio planner cache ────────────────────────────────────────────────
function startBackgroundRefresh() {
  if (fetchPromise) return;
  fetchPromise = fetchSmartSuiteData(API_KEY).then(projects => {
    cache        = projects;
    cacheTime    = Date.now();
    fetchPromise = null;
    console.log(`Cache refreshed — ${projects.length} projects`);
  }).catch(err => {
    fetchPromise = null;
    console.error('Background refresh failed:', err.message);
  });
}

async function getData(force) {
  const now   = Date.now();
  const fresh = cache && cacheTime && (now - cacheTime) < CACHE_TTL;

  // Serve instantly from cache; kick off background refresh if stale or forced
  if (cache && !force) {
    if (!fresh) startBackgroundRefresh();
    return { projects: cache, lastUpdated: new Date(cacheTime).toISOString(), stale: !fresh };
  }

  // Force refresh OR no cache yet — must wait
  if (!fetchPromise) {
    fetchPromise = fetchSmartSuiteData(API_KEY).then(projects => {
      cache        = projects;
      cacheTime    = Date.now();
      fetchPromise = null;
      return projects;
    }).catch(err => {
      fetchPromise = null;
      throw err;
    });
  }
  await fetchPromise;
  return { projects: cache, lastUpdated: new Date(cacheTime).toISOString(), stale: false };
}

// ── Entity Reporting store ─────────────────────────────────────────────────
// Flat JSON file. CFO plugin writes via POST; dashboard reads via GET.
// Railway note: file persists across restarts but resets on redeploy.
// The CFO plugin's daily email scan re-populates within 24 h of any reset.
const REPORTING_PATH = path.join(__dirname, 'entity-reporting.json');

function loadReporting() {
  try {
    if (fs.existsSync(REPORTING_PATH))
      return JSON.parse(fs.readFileSync(REPORTING_PATH, 'utf8'));
  } catch(e) { console.error('entity-reporting load error:', e.message); }
  return { config: { entities: [] }, reports: {} };
}

function saveReporting(data) {
  try { fs.writeFileSync(REPORTING_PATH, JSON.stringify(data, null, 2), 'utf8'); }
  catch(e) { console.error('entity-reporting save error:', e.message); }
}

// GET  /api/entity-reporting          — full data (config + reports)
app.get('/api/entity-reporting', (_req, res) => {
  res.json(loadReporting());
});

// POST /api/entity-reporting          — upsert one report entry
// Used by CFO plugin AND by the UI (same-origin, no key needed for UI)
// CFO plugin: set x-api-key: <SMARTSUITE_API_KEY> header
// Body: { period, entity, status, driveLink, deliveredDate, notes }
app.post('/api/entity-reporting', express.json(), (req, res) => {
  const { period, entity, status, driveLink, deliveredDate, notes } = req.body || {};
  if (!period || !entity) return res.status(400).json({ error: 'period and entity are required' });
  const data = loadReporting();
  if (!data.reports[period]) data.reports[period] = {};
  data.reports[period][entity] = {
    status:        status        || 'pending',
    driveLink:     driveLink     || null,
    deliveredDate: deliveredDate || null,
    notes:         notes         || '',
    updatedAt:     new Date().toISOString(),
  };
  saveReporting(data);
  res.json({ ok: true });
});

// POST /api/entity-reporting/config   — save entity list + due-day settings + period overrides
app.post('/api/entity-reporting/config', express.json(), (req, res) => {
  const { entities, periodOverrides } = req.body || {};
  if (!Array.isArray(entities)) return res.status(400).json({ error: 'entities array required' });
  const data = loadReporting();
  data.config.entities = entities;
  if (periodOverrides && typeof periodOverrides === 'object')
    data.config.periodOverrides = periodOverrides;
  saveReporting(data);
  res.json({ ok: true });
});

// ── Routes ─────────────────────────────────────────────────────────────────

// GET /api/construction-data
// Returns annotated construction projects with stage (from status field) and
// budget summary (from Baseline Budget Items rows) per project.
// Used by construction-scorecard.html.
app.get('/api/construction-data', async (req, res) => {
  try {
    const force = req.query.force === 'true';
    const result = await getConstructionData(force);
    res.json(result);
  } catch (err) {
    console.error('Construction data error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard-projects?type=disposition|construction
// Returns raw SmartSuite project records filtered by product type.
// Used by disposition-scorecard.html and construction-scorecard.html.
app.get('/api/dashboard-projects', async (req, res) => {
  try {
    const type  = (req.query.type || '').toLowerCase();
    const force = req.query.force === 'true';

    const typeIds = type === 'construction' ? CONSTRUCTION_TYPE_IDS :
                    type === 'disposition'  ? DISPOSITION_TYPE_IDS  : null;

    const { items, lastUpdated, stale } = await getDashboardProjects(force);

    // Filter by product type if requested; otherwise return all
    const filtered = typeIds
      ? items.filter(p => {
          const ptField = p['s4687ad08c'];
          const ptArr   = Array.isArray(ptField) ? ptField : (ptField ? [ptField] : []);
          return typeIds.some(id => ptArr.includes(id));
        })
      : items;

    res.json({ items: filtered, total: filtered.length, lastUpdated, stale });
  } catch (err) {
    console.error('Dashboard projects error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/data', async (req, res) => {
  try {
    const force = req.query.force === 'true';
    const data  = await getData(force);
    res.json(data);
  } catch (err) {
    console.error('SmartSuite fetch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Stitser BUILT Planning Tools → http://localhost:${PORT}`);
  // Warm cache on startup, then refresh every 25 minutes so it's never cold
  startBackgroundRefresh();
  setInterval(startBackgroundRefresh, 25 * 60 * 1000);
});
