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

// Fields needed by product-line dashboards (lean subset of 173-field schema)
const DASHBOARD_FIELDS = [
  'title', 'status', 's4687ad08c',  // name, status, product type
  'sfa6ec0fec', 's8227b8fc4', 's7e23170f2', 's695a5c195',  // stage dates
  'secceac461', 's17kv07k',          // close dates
  'sce63122c3', 's2djrcac', 'sd22575e83', 'svs6xrqj',  // financials
  'sacaa33d0f', 's5efff6ee9',        // owners, project #
];

// Product Type record IDs
const DISPOSITION_TYPE_IDS  = [
  '6a0629f81c9e28015cf0e856',  // Turnkey Disposition Services (CM & Brokerage)
  '6a0655d2d3d9287b9a07591b',  // Turnkey Disposition Services (Brokerage Only)
];
const CONSTRUCTION_TYPE_IDS = [
  '6a0629f81c9e28015cf0e85b',  // 3rd party GC-Precon & Construct
];

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
