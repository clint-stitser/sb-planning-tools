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
const SS_G702_APP    = '68a8c3d2bba73ca6e62d0cb5';

// ── Scoring period ─────────────────────────────────────────────────────────
// TODO: source these from a S-BOS Goals/Targets record instead of hardcoding.
// Calendar reminder set for June 16, 2026 to activate full pillar gating.
const SCORING_PERIOD = {
  start: new Date('2026-06-01T00:00:00Z'),
  end:   new Date('2026-12-31T23:59:59Z'),
  label: 'June 1 – December 31, 2026',
};

// Fields needed by product-line dashboards (lean subset of 173-field schema)
const DASHBOARD_FIELDS = [
  'title', 'status', 's4687ad08c',              // name, status, product type
  'sfa6ec0fec', 's8227b8fc4', 's7e23170f2',     // pipeline/award/wip dates
  's695a5c195', 's17kv07k', 'secceac461',       // out-of-wip / close dates
  'scc0298307',                                  // Estimated Construction End Date
  'sacaa33d0f', 's5efff6ee9', 's828d7f9ef',     // owners, sage job ID, SB company
  'sz83pw9x',                                    // Link to Baseline Budget Items (for join)
  // ── Pillar completeness fields ──────────────────────────────────────────
  'sfiz2vvh',    // Budget pillar: Link to Pay Application Management (G-702 count)
  's561f1796b',  // Budget pillar + Checklists: Google Drive folder link
  'synemrwc',    // Checklists pillar: Link to Check List Tasks
  's0dm3fca',    // Alignment pillar: Link to GYR Status Reports
  'sw6mypea',    // Alignment pillar: Link to Project Stakeholders (need ≥4)
  's4ec74af74',  // Schedule pillar: Smartsheet Schedule ID (text)
  // ── Pipeline projection fields ──────────────────────────────────────────
  'sl14xzgf',    // Confidence Rating (ratingfield, scale 1-5) — conversion probability
  's399940ae0',  // Estimated Duration in Days — used for progress-billing proration
];

// Budget fields needed to compute per-project revenue summary
const BUDGET_FIELDS = [
  's2ba7b261b',   // Project (linked) — for grouping
  'sb54d9092a',   // Revenue Track (pO6Hh=Track1, UhSZv=Track2)
  's40ca9cdee',   // Cash Flow Lookup → "Operating Cash-Income" / "Operating Cash-COGS"
  's2f27d033f',   // SB Company Receiving/Paying — used to filter rows on multi-type projects
  'sc507e6b54',   // Estimated Budget — earliest stage manual estimate
  'sed808550d',   // Baseline Budget formula (G702 → manual s818f40f1d → blank)
  'sa1a3abded',   // Change Orders formula (G702 → manual s432af3d33 → blank)
  's531f1d6ab',   // Adjusted Budget = Baseline + Change Orders
  's160aa943b',   // Completed to Date formula (cumulative — use for project % only)
  's0f7c08530',   // Actual Amount formula (cumulative — use for project % only)
  's6506ec407',   // Balance to Finish = Adjusted − Completed to Date
  's3636482e0',   // % Complete = Complete to Date / Adjusted
  's32eed8560',   // Account description (display label)
  's363b6d973',   // Linked G-702(s) — presence indicates billing has started
  's4975ef4d4',   // Budget freshness: date of most recent G-702/G-703/manual update
  'last_updated', // Fallback freshness when s4975ef4d4 is null (system field, always present)
];

// G-702 fields for period-specific billing (per PRINCIPLES.md)
// Revenue this period = SUM(s0592aef02) WHERE s0996cf591 ∈ scoring window
const G702_FIELDS = [
  's12698a7c3',   // Project link
  's0592aef02',   // Amount Due this Period — period-specific billing amount
  's0996cf591',   // Pay App Date (lookupfield) — filter to scoring window
  's6ce9e1881',   // Completed & Stored to Date — cumulative, for project progress only
  's2ce3db8ed',   // Total Retention Held
  'sf1daf8d5a',   // Balance to Finish (from G-702)
  's5a0e0a7b0',   // Net Change by Change Orders
  's338ec3e01',   // SB Company Collecting Revenue
];

// Construction entity IDs — used to filter budget rows on multi-type projects.
// KCS Homes LLC dba BUILT. (1100) is the GC entity for Construction product line.
// Realm Constructors (1200) operates under a separate product line — excluded here.
const KCS_HOMES_ID = '6914fe61e127b5f69fb770da';  // 1100-KCS Homes LLC dba BUILT.

// Product Type record IDs
const DISPOSITION_TYPE_IDS  = [
  '6a0629f81c9e28015cf0e856',  // Turnkey Disposition Services (CM & Brokerage)
  '6a0655d2d3d9287b9a07591b',  // Turnkey Disposition Services (Brokerage Only)
];
const CONSTRUCTION_TYPE_IDS = [
  '6a0629f81c9e28015cf0e85b',  // Construction (formerly "3rd party GC-Precon & Construct")
];

// Status value → pipeline stage mapping (from live SmartSuite status field options)
// Stage labels follow S-Bos vocabulary exactly — no invented S1/S2/S3/S4 labels.
// "stage" is an internal grouping key only; "label" and "subLabel" are displayed.
//
// Biz Dev  = New Opportunity + Nurture + Warm + Hot (all relationship/pursuit)
// Pipeline = Active in Pipeline (formal pipeline entry)
// WIP      = Active in WIP (construction underway)
// Closeout = Active in Closeout & Warranty
// Closed   = Closed Job-Closed Warranty
// EXCLUDE  = Declined or Job Lost — hidden from dashboard entirely
const CONSTRUCTION_STATUS_MAP = {
  'ready_for_review':                          { stage: 'BIZ_DEV',  label: 'Biz Dev — New Opportunity',  subLabel: 'New Opportunity'           },
  'complete':                                  { stage: 'BIZ_DEV',  label: 'Biz Dev — Nurture',           subLabel: 'Nurture'                   },
  '21c0705b-0c3b-45cd-9e93-07672fac949d':     { stage: 'BIZ_DEV',  label: 'Biz Dev — Warm',             subLabel: 'Warm'                      },
  'fb5677b7-3e68-4705-86af-abb8745a43f7':     { stage: 'BIZ_DEV',  label: 'Biz Dev — Hot',              subLabel: 'Hot'                       },
  'backlog':                                   { stage: 'PIPELINE', label: 'Active in Pipeline',          subLabel: 'Active Pipeline'           },
  'zOlNR':                                     { stage: 'WIP',      label: 'Active in WIP',               subLabel: 'WIP'                       },
  'Swowl':                                     { stage: 'CLOSEOUT', label: 'Closeout & Warranty',         subLabel: 'Closeout'                  },
  'Dio3d':                                     { stage: 'CLOSED',   label: 'Closed Job',                  subLabel: 'Closed'                    },
  '3ae0dcac-d82c-4171-95cd-3f40eed714d7':     { stage: 'EXCLUDE',  label: 'Declined',                    subLabel: 'Declined'                  },
  '41590c12-77e8-494b-878e-2dbb27012ca4':     { stage: 'EXCLUDE',  label: 'Job Lost',                    subLabel: 'Lost'                      },
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
//
// companyId (optional): when set, only rows where s2f27d033f contains this company
//   are used. Applied for multi-type projects so each product line only sees its rows.
//
// The three-state model:
//   'estimate'  → only sc507e6b54 (Estimated Budget) is filled in
//   'baseline'  → sed808550d / s531f1d6ab are populated (contract signed, no G702 yet)
//   'billing'   → s0f7c08530 / s160aa943b are populated (G702 pay apps flowing)
function summariseBudget(rows, companyId = null) {
  // For multi-type projects: restrict to rows assigned to the specified company.
  // For single-type projects (companyId = null): use all rows.
  if (companyId) {
    rows = rows.filter(r => (r.s2f27d033f || []).includes(companyId));
  }
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

  // Budget freshness: most recent s4975ef4d4 (G-702/G-703/manual update formula).
  // Fallback: most recent last_updated on any budget row (system timestamp always present).
  // s4975ef4d4 is preferred — it reflects meaningful billing activity.
  // last_updated fires on any row edit, so it's a coarser but always-available signal.
  let budgetFreshnessDate = null;
  let lastUpdatedFallback = null;
  for (const r of rows) {
    const formula = r.s4975ef4d4;
    if (formula && typeof formula === 'string' && (!budgetFreshnessDate || formula > budgetFreshnessDate)) {
      budgetFreshnessDate = formula;
    }
    const lu = r.last_updated?.on || (typeof r.last_updated === 'string' ? r.last_updated : null);
    if (lu && (!lastUpdatedFallback || lu > lastUpdatedFallback)) {
      lastUpdatedFallback = lu;
    }
  }
  // Use formula if available; fall back to last_updated (still useful — tells us row was edited)
  budgetFreshnessDate = budgetFreshnessDate || lastUpdatedFallback;

  return {
    contractRevenue, contractCost, contractGP, gpRate,
    billedRevenue, billedCost, billedGP,
    btf, pctComplete, budgetState,
    hasBudget:      rows.length > 0,
    hasRevenueRows: revenueRows.length > 0,   // for pillar check
    hasCOGSRows:    cogsRows.length > 0,      // for pillar check
    budgetFreshnessDate,                       // for Principle 9 dual freshness
  };
}

// ── G-702 helpers ──────────────────────────────────────────────────────────

// Parse a Pay App Date lookupfield value → Date or null
// The field returns nested arrays: [["2026-05-15"]] or [[{date:"2026-05-15"}]] or null
function parsePayAppDate(val) {
  if (!val || !Array.isArray(val)) return null;
  const inner = val[0]?.[0];
  if (!inner) return null;
  if (typeof inner === 'string' && inner.length >= 8) return new Date(inner);
  if (inner && typeof inner === 'object' && inner.date) return new Date(inner.date);
  return null;
}

// Fetch all G-702 pay applications for a set of project IDs
async function fetchG702Records(projIdSet) {
  const headers = {
    'Authorization': `Token ${API_KEY}`,
    'ACCOUNT-ID':    SS_ACCOUNT_ID,
    'Content-Type':  'application/json',
  };
  const all = [];
  let offset = 0;
  while (true) {
    const res = await fetch(`${SS_BASE_URL}/applications/${SS_G702_APP}/records/list/`, {
      method: 'POST', headers,
      body: JSON.stringify({ limit: 500, offset, fields: G702_FIELDS }),
    });
    if (!res.ok) {
      console.error(`G-702 fetch error ${res.status}:`, (await res.text()).slice(0, 200));
      break;
    }
    const data = await res.json();
    const items = (data.items || []).filter(r => {
      const pid = Array.isArray(r.s12698a7c3) ? r.s12698a7c3[0] : r.s12698a7c3;
      return pid && projIdSet.has(pid);
    });
    all.push(...items);
    offset += (data.items || []).length;
    if (!data.has_more || (data.items || []).length === 0) break;
  }
  return all;
}

// Summarise G-702s for one project: period-specific and cumulative amounts
function summariseG702s(g702Records, periodStart, periodEnd) {
  let periodRevenue  = 0, hasPeriodData = false;
  let cumulativeBilled = 0, retentionHeld = 0, btfFromG702 = null;

  for (const r of g702Records) {
    const payAppDate = parsePayAppDate(r.s0996cf591);
    const amtThisPeriod = parseFloat(r.s0592aef02) || 0;
    const completedToDate = parseFloat(r.s6ce9e1881) || 0;
    const retention = parseFloat(r.s2ce3db8ed) || 0;
    const btf = parseFloat(r.sf1daf8d5a);

    // Period-specific: only count if pay app date falls within scoring window
    if (payAppDate && payAppDate >= periodStart && payAppDate <= periodEnd) {
      periodRevenue += amtThisPeriod;
      hasPeriodData = true;
    }

    // Cumulative: use most recent G-702's completed-to-date
    cumulativeBilled = Math.max(cumulativeBilled, completedToDate);
    retentionHeld    = Math.max(retentionHeld, retention);
    if (!isNaN(btf)) btfFromG702 = btf;
  }

  return {
    periodRevenue:   hasPeriodData ? periodRevenue : null,
    cumulativeBilled: cumulativeBilled || null,
    retentionHeld:   retentionHeld || null,
    btfFromG702,
    g702Count:       g702Records.length,
  };
}

// ── Pillar completeness (Option B: display-only, inclusive scoring) ─────────
// OPTION B ACTIVE: Incomplete projects are shown with ⚠️ but still score.
// Calendar reminder June 16, 2026 to switch to Option A (full exclusion).
// See PRINCIPLES.md → Pillar Completeness section for full check definitions.
function computePillars(p, budget) {
  const b = {
    hasInflow:     budget.hasRevenueRows,
    hasOutflow:    budget.hasCOGSRows,
    hasG702orDrive: (p.sfiz2vvh?.length > 0) || !!(p.s561f1796b),
  };
  const s = {
    hasStart:      !!(p.s7e23170f2?.date),
    hasEnd:        !!(p.scc0298307?.date),
    hasSmartsheet: !!(p.s4ec74af74 && String(p.s4ec74af74).trim()),
  };
  const c = {
    hasDriveFolder: !!(p.s561f1796b),
    hasChecklists:  (p.synemrwc?.length || 0) > 0,
  };
  const a = {
    hasGYR:            (p.s0dm3fca?.length || 0) > 0,
    stakeholderCount:  p.sw6mypea?.length || 0,
    hasEnoughStakeholders: (p.sw6mypea?.length || 0) >= 4,
  };

  const checks = [
    b.hasInflow, b.hasOutflow, b.hasG702orDrive,
    s.hasStart, s.hasEnd, s.hasSmartsheet,
    c.hasDriveFolder, c.hasChecklists,
    a.hasGYR, a.hasEnoughStakeholders,
  ];
  const passCount = checks.filter(Boolean).length;
  const complete  = passCount === checks.length;

  // Missing items for the tooltip / pending setup section
  const missing = [];
  if (!b.hasInflow)     missing.push('Budget: no revenue row');
  if (!b.hasOutflow)    missing.push('Budget: no cost row');
  if (!b.hasG702orDrive) missing.push('Budget: no G-702 or Drive folder');
  if (!s.hasStart)      missing.push('Schedule: no Construction Start date');
  if (!s.hasEnd)        missing.push('Schedule: no Construction End date');
  if (!s.hasSmartsheet) missing.push('Schedule: Smartsheet not linked');
  if (!c.hasDriveFolder) missing.push('Checklists: no Drive folder');
  if (!c.hasChecklists) missing.push('Checklists: none assigned');
  if (!a.hasGYR)        missing.push('Alignment: no GYR report');
  if (!a.hasEnoughStakeholders) missing.push(`Alignment: ${a.stakeholderCount}/4 stakeholders`);

  return { budget: b, schedule: s, checklists: c, alignment: a, complete, passCount, total: checks.length, missing };
}

// ── Construction data cache (projects + budget) ────────────────────────────
let constCache     = null;
let constCacheTime = null;
let constPromise   = null;
const CONST_TTL    = 5 * 60 * 1000;

async function buildConstructionData() {
  // Fetch projects + budget rows in parallel; then G-702s once we have project IDs
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

  // Fetch G-702s for all construction projects (period-specific billing)
  const allG702s = await fetchG702Records(projIds).catch(err => {
    console.error('G-702 fetch failed (non-fatal):', err.message);
    return [];
  });

  // Group budget rows by project ID
  const budgetByProject = {};
  for (const row of allBudgetRows) {
    const ids = Array.isArray(row.s2ba7b261b) ? row.s2ba7b261b : (row.s2ba7b261b ? [row.s2ba7b261b] : []);
    for (const pid of ids) {
      if (projIds.has(pid)) {
        (budgetByProject[pid] = budgetByProject[pid] || []).push(row);
      }
    }
  }

  // Group G-702s by project ID
  const g702ByProject = {};
  for (const r of allG702s) {
    const pid = Array.isArray(r.s12698a7c3) ? r.s12698a7c3[0] : r.s12698a7c3;
    if (pid && projIds.has(pid)) {
      (g702ByProject[pid] = g702ByProject[pid] || []).push(r);
    }
  }

  // Period-capturable BTF: how much of a project's Balance to Finish can
  // realistically be billed before the scoring period ends (Dec 31)?
  //
  // Logic: if the project's estimated completion date falls WITHIN the period,
  // 100% of BTF is capturable. If it extends PAST the period end, prorate by
  // (days remaining in period / days remaining in project).
  //
  // This answers: "How much WIP revenue will actually land before Dec 31?"
  function periodCapturableBTF(btf, estConstEnd) {
    if (!btf || btf <= 0) return 0;
    const today = new Date();
    if (!estConstEnd) return btf;  // no date = assume fully capturable
    const projEnd = new Date(estConstEnd);
    if (projEnd <= SCORING_PERIOD.end) return btf;  // completes within period → all capturable
    const daysInPeriod  = Math.max(0, (SCORING_PERIOD.end - today) / 86400000);
    const daysToComplete = Math.max(1,  (projEnd - today) / 86400000);
    return btf * Math.min(1, daysInPeriod / daysToComplete);
  }

  // Annotate each project
  const annotated = projects.map(p => {
    const statusVal  = p.status?.value || '';
    const stageInfo  = CONSTRUCTION_STATUS_MAP[statusVal]
      || { stage: 'BIZ_DEV', label: statusVal || 'Unknown', subLabel: statusVal || 'Unknown' };
    const budgetRows = budgetByProject[p.id] || [];

    // Multi-type: restrict budget to KCS-Homes rows; single-type: use all
    const productTypes  = Array.isArray(p.s4687ad08c) ? p.s4687ad08c : (p.s4687ad08c ? [p.s4687ad08c] : []);
    const isMultiType   = productTypes.length > 1;
    const companyFilter = isMultiType ? KCS_HOMES_ID : null;

    const budget  = summariseBudget(budgetRows, companyFilter);
    const g702    = summariseG702s(g702ByProject[p.id] || [], SCORING_PERIOD.start, SCORING_PERIOD.end);
    const pillars = computePillars(p, budget);
    const estConstEnd = p.scc0298307?.date || null;

    // Period-capturable BTF: how much of this project's remaining value
    // will land before December 31, 2026
    const capturableBTF = periodCapturableBTF(budget.btf, estConstEnd);

    // ── Pipeline projected billing (progress-based, no hard deadline cutoff) ──
    //
    // Construction uses PROGRESS-BASED BILLING, not event-based (unlike Disposition
    // where revenue only lands on a single close event). A job mobilizing Nov 1 can
    // still bill 2 months before Dec 31. Dec 1 still generates 1 month of billing.
    // The only true cutoff is Dec 31 itself.
    //
    // Formula: contractRevenue × min(1, daysRemainingInPeriod / estimatedDuration) × conversionRate
    //   - daysRemainingInPeriod: days from TODAY to Dec 31 (dynamic — shrinks over time)
    //   - estimatedDuration: per-project (s399940ae0) or default 90 days (typical S3)
    //   - conversionRate: per-project Confidence Rating (sl14xzgf / 5) or default 0.30
    //
    // Sep 2 mobilization deadline remains a VISIBILITY MARKER ("mobilize here for full
    // billing") but is NOT a formula parameter. Missing it doesn't zero out the projection.
    //
    // Only Active Pipeline (stage=PIPELINE) contributes to [C].
    // BIZ_DEV excluded: pre-award, still speculative. Shows in stage card for context.
    const CONFIDENCE_SCALE   = 10;   // sl14xzgf is a 1-10 numeric rating (display_format: numbers)
    const DEFAULT_CONVERSION = 0.30; // conservative default for unrated pipeline jobs
    const DEFAULT_DURATION   = 90;   // typical S3 WIP phase in days
    const MIN_VALID_DURATION = 14;   // filter out clearly wrong values (< 2 weeks)

    const today = new Date();
    const daysRemainingInPeriod = Math.max(0, (SCORING_PERIOD.end - today) / 86400000);

    // Per-project confidence rating → conversion probability
    const rawRating = parseFloat(p.sl14xzgf) || 0;
    const confidenceRating = rawRating > 0 ? rawRating : null; // null = not yet rated
    const conversionRate = rawRating > 0
      ? Math.min(1, rawRating / CONFIDENCE_SCALE)
      : DEFAULT_CONVERSION;

    // Per-project estimated duration (validate > MIN_VALID_DURATION)
    const rawDuration  = parseFloat(p.s399940ae0) || 0;
    const estDuration  = rawDuration >= MIN_VALID_DURATION ? rawDuration : DEFAULT_DURATION;

    // Default conversion rates by stage
    const HOT_DEFAULT_CONVERSION = 0.55; // Hot status justifies higher floor than generic pipeline

    let pipelineProjected = 0;
    const isHot = stageInfo.stage === 'BIZ_DEV' && stageInfo.subLabel === 'Hot';

    if (budget.contractRevenue && daysRemainingInPeriod > 0) {
      if (stageInfo.stage === 'PIPELINE') {
        // Active Pipeline: include at confidence rating (default 30%)
        const billableFrac = Math.min(1, daysRemainingInPeriod / estDuration);
        pipelineProjected  = budget.contractRevenue * billableFrac * conversionRate;

      } else if (isHot) {
        // Hot jobs included if effective conversion ≥ 50%.
        // Unrated Hot gets 55% default (Hot status justifies higher floor than 30%).
        // Hot jobs explicitly rated ≤ 2 stars (≤ 40%) are excluded — team said no.
        const hotConvRate = rawRating > 0
          ? Math.min(1, rawRating / CONFIDENCE_SCALE)
          : HOT_DEFAULT_CONVERSION;
        if (hotConvRate >= 0.50) {
          const billableFrac = Math.min(1, daysRemainingInPeriod / estDuration);
          pipelineProjected  = budget.contractRevenue * billableFrac * hotConvRate;
        }
      }
    }
    // Warm/Nurture/New Opportunity: $0 in projected score.
    // Visible in Biz Dev stage card for pipeline awareness only.

    return {
      id:           p.id,
      title:        p.title || p.s937f1d342 || '—',
      sbosUrl:      `https://app.stitserbuilt.com/sb-crm-projects-list-details?recordId=${p.id}`,
      statusValue:  statusVal,
      stage:        stageInfo.stage,
      statusLabel:  stageInfo.label,
      subLabel:     stageInfo.subLabel,
      isMultiType,
      productTypes,
      pillars,
      dates: {
        pipeline:    p.sfa6ec0fec?.date  || null,
        awarded:     p.s8227b8fc4?.date  || null,
        wip:         p.s7e23170f2?.date  || null,
        outOfWip:    p.s695a5c195?.date  || null,
        estClose:    p.secceac461?.date  || null,
        actClose:    p.s17kv07k?.date    || null,
        estConstEnd,
      },
      budget,
      g702,
      // Period-scope revenue metrics — answer "what will actually land before Dec 31?"
      period: {
        billedActual:        g702.periodRevenue || 0, // [A] G-702 actuals within scoring window
        capturableBTF,                                 // [B] WIP BTF prorated to Dec 31
        pipelineProjected,                             // [C] Pipeline contribution (continuous, no deadline cutoff)
        extendsOutOfPeriod:  estConstEnd && new Date(estConstEnd) > SCORING_PERIOD.end, // WIP risk flag
      },
      // Conversion metrics — for surfacing in the dashboard
      conversion: {
        confidenceRating,    // null = not set, 1-5 = per-project star rating
        conversionRate,      // 0-1 decimal used in [C] formula
        estDuration,         // days used for proration
        isDefaultRating:     rawRating === 0, // flag to prompt team to rate this job
      },
      freshness: {
        budget:    budget.budgetFreshnessDate,
        schedule:  null,  // Smartsheet modifiedAt deferred
      },
    };
  }).filter(p => p.stage !== 'EXCLUDE');

  // ── 3-Bucket Projected Score ───────────────────────────────────────────
  // [A] Billed this period (actuals from G-702 within scoring window)
  const bucketA = annotated.reduce((s, p) => s + (p.period.billedActual || 0), 0);
  // [B] WIP capturable BTF (period-prorated balance to finish for Active in WIP jobs)
  const bucketB = annotated
    .filter(p => p.stage === 'WIP' || p.stage === 'CLOSEOUT')
    .reduce((s, p) => s + (p.period.capturableBTF || 0), 0);
  // [C] Pipeline + Hot: Active Pipeline (all) + Biz Dev Hot (≥50% confidence only)
  const bucketC = annotated
    .filter(p => p.stage === 'PIPELINE' || (p.stage === 'BIZ_DEV' && p.subLabel === 'Hot'))
    .reduce((s, p) => s + (p.period.pipelineProjected || 0), 0);
  const projectedTotal = bucketA + bucketB + bucketC;

  console.log(`Construction data built — ${annotated.length} projects, ${allBudgetRows.length} budget rows, ${allG702s.length} G-702s. Projected: $A=${bucketA.toLocaleString()} $B=${bucketB.toLocaleString()} $C=${bucketC.toLocaleString()} Total=$${projectedTotal.toLocaleString()}`);
  // Pipeline Coverage: how much of the goal does the current projected pipeline cover?
  // This is the GYR signal — replaces time-elapsed pace which produces misleading
  // values early in the period (e.g., 3,480% on Day 4 is mathematically true but useless).
  const coverage = projectedTotal / 4_500_000;

  return {
    projects:      annotated,
    scoringPeriod: { start: SCORING_PERIOD.start.toISOString(), end: SCORING_PERIOD.end.toISOString(), label: SCORING_PERIOD.label },
    periodRevenue: bucketA,  // legacy compat
    score: { bucketA, bucketB, bucketC, projectedTotal, coverage },
  };
}

async function getConstructionData(force) {
  const now   = Date.now();
  const fresh = constCache && constCacheTime && (now - constCacheTime) < CONST_TTL;

  if (constCache && !force && fresh) {
    return { ...constCache, lastUpdated: new Date(constCacheTime).toISOString(), stale: false };
  }
  if (constCache && !force && !fresh) {
    if (!constPromise) {
      constPromise = buildConstructionData().then(data => {
        constCache = data; constCacheTime = Date.now(); constPromise = null;
      }).catch(err => { constPromise = null; console.error('Construction refresh failed:', err.message); });
    }
    return { ...constCache, lastUpdated: new Date(constCacheTime).toISOString(), stale: true };
  }
  if (!constPromise) {
    constPromise = buildConstructionData().then(data => {
      constCache = data; constCacheTime = Date.now(); constPromise = null;
      return data;
    }).catch(err => { constPromise = null; throw err; });
  }
  await constPromise;
  return { ...constCache, lastUpdated: new Date(constCacheTime).toISOString(), stale: false };
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

// ── Article Editor (SBos-Knowledge-Base GitHub Pages) ─────────────────────
// Two endpoints: save (PUT via GitHub Contents API) and history (commit log).
// No auth — anyone who can see the page can submit an edit with their name.
// CORS is open to GitHub Pages origin + localhost for local dev.

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GH_REPO      = 'clint-stitser/sb-planning-tools';  // KB files now live here
const GH_API       = 'https://api.github.com';

function articleCors(req, res, next) {
  const allowed = [
    'https://clint-stitser.github.io',
    'http://localhost:3000',
    'http://127.0.0.1:5500',
    'http://localhost:5500',
  ];
  const origin = req.headers.origin;
  if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

// GET /api/article/history?path=lessons/welcome-to-sbos.html
app.get('/api/article/history', articleCors, async (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'path required' });
  if (!GITHUB_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN not set' });
  try {
    const r = await fetch(
      `${GH_API}/repos/${GH_REPO}/commits?path=${encodeURIComponent(filePath)}&per_page=25`,
      { headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' } }
    );
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    const commits = await r.json();
    res.json({ history: commits.map(c => ({
      sha:     c.sha.slice(0, 7),
      message: c.commit.message,
      author:  c.commit.author.name,
      date:    c.commit.author.date,
    }))});
  } catch (err) {
    console.error('Article history error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/article/save
// Body: { filePath, html, editorName }
// html = full document HTML; server strips contenteditable attrs before committing.
app.post('/api/article/save', articleCors, express.json({ limit: '4mb' }), async (req, res) => {
  const { filePath, html, editorName } = req.body || {};
  if (!filePath || !html || !editorName) {
    return res.status(400).json({ error: 'filePath, html, and editorName are required' });
  }
  if (!GITHUB_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN not set' });

  const ghHeaders = {
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Accept':        'application/vnd.github.v3+json',
    'Content-Type':  'application/json',
  };
  const fileUrl = `${GH_API}/repos/${GH_REPO}/contents/${filePath}`;

  try {
    // Strip browser-injected contenteditable attributes before saving
    const cleanHtml = html.replace(/\s*contenteditable="[^"]*"/g, '');

    // Get current SHA (GitHub requires it for updates)
    const current = await fetch(fileUrl, { headers: ghHeaders });
    if (!current.ok) throw new Error(`GitHub GET ${current.status}`);
    const { sha } = await current.json();

    // Build commit message and commit
    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const label   = filePath.split('/').pop().replace('.html', '').replace(/-/g, ' ');
    const message = `${editorName} edited ${label} — ${dateStr}`;
    const content = Buffer.from(cleanHtml).toString('base64');

    const update = await fetch(fileUrl, {
      method:  'PUT',
      headers: ghHeaders,
      body:    JSON.stringify({ message, content, sha }),
    });
    if (!update.ok) throw new Error(`GitHub PUT ${update.status}: ${(await update.text()).slice(0, 200)}`);
    const result = await update.json();
    console.log(`Article saved: ${message}`);
    res.json({ ok: true, sha: result.content?.sha?.slice(0, 7), message });
  } catch (err) {
    console.error('Article save error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Routes ─────────────────────────────────────────────────────────────────

// GET /api/construction-data
// Returns annotated construction projects with stage, budget, G-702 period data,
// pillar completeness, and scoring period metadata.
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

// ── Learning Tracks (Section 1) ────────────────────────────────────────────
// GET /api/learning-tracks?person_id=<optional>
// Returns full Track→Course→Lesson hierarchy plus per-lesson completion status.
const TRAIN_TRACKS_APP  = '68d480e2727607560a7f0d23';
const TRAIN_COURSES_APP = '68d480e2727607560a7f0d2c';
const TRAIN_LESSONS_APP = '68d480e2727607560a7f0d26';
const TRAIN_PROGRESS_APP= '6a18ad82e630be8e82a202ea';

async function ssListAll(appId, fields = []) {
  const headers = { 'Authorization': `Token ${API_KEY}`, 'ACCOUNT-ID': SS_ACCOUNT_ID, 'Content-Type': 'application/json' };
  const all = []; let offset = 0;
  while (true) {
    const body = { limit: 200, offset };
    if (fields.length) body.fields = fields;
    const r = await fetch(`${SS_BASE_URL}/applications/${appId}/records/list/`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!r.ok) break;
    const d = await r.json();
    all.push(...(d.items || []));
    if (!d.has_more || !(d.items || []).length) break;
    offset += d.items.length;
  }
  return all;
}

app.get('/api/learning-tracks', async (req, res) => {
  try {
    const personId = req.query.person_id || null;
    const [tracks, courses, lessons] = await Promise.all([
      ssListAll(TRAIN_TRACKS_APP, ['title', 'description']),
      ssListAll(TRAIN_COURSES_APP, ['title', 'description', 'link_to_learning_tracks', 'sf4cbfb4bb', 's59d010ab9', 'sdc776b2fa']),
      ssListAll(TRAIN_LESSONS_APP, ['title', 'type', 'sa2c745c03', 'sefd6f1609', 'sd97f4c063', 'se82cbdade', 'link_to_courses', 's05e6aca0a', 's7ccdea252', 's2d92d822a', 'description']),
    ]);

    // Progress lookup: completed lesson IDs for this person
    let completedLessonIds = new Set();
    if (personId) {
      const progress = await ssListAll(TRAIN_PROGRESS_APP, ['s795f4d404', 's43b519ec1', 's56ad0c6cc']);
      progress.forEach(p => {
        const persons = p.s43b519ec1 || [];
        if (persons.includes(personId)) {
          (p.s795f4d404 || []).forEach(lid => completedLessonIds.add(lid));
        }
      });
    }

    // Index courses by ID
    const courseById = {};
    courses.forEach(c => { courseById[c.id] = c; });

    // Build track→courses→lessons hierarchy
    const hierarchy = tracks.map(track => ({
      id:          track.id,
      title:       track.title,
      description: track.description || '',
      courses:     courses
        .filter(c => (c.link_to_learning_tracks || []).includes(track.id))
        .map(course => ({
          id:          course.id,
          title:       course.title,
          description: course.description || '',
          totalMins:   parseFloat(course.s59d010ab9) || null,
          lessons:     lessons
            .filter(l => (l.link_to_courses || []).includes(course.id))
            .sort((a, b) => (parseFloat(a.se82cbdade) || 99) - (parseFloat(b.se82cbdade) || 99))
            .map(l => ({
              id:          l.id,
              title:       l.title,
              description: l.description || '',
              url:         l.sefd6f1609 || null,
              mins:        parseFloat(l.sa2c745c03) || null,
              pillar:      l.s05e6aca0a || '',
              type:        l.s7ccdea252 || l.type || '',
              audience:    l.s2d92d822a || '',
              status:      l.sd97f4c063 || '',
              lessonNum:   parseFloat(l.se82cbdade) || null,
              completed:   completedLessonIds.has(l.id),
            })),
        })),
    }));

    res.json({ tracks: hierarchy, personId });
  } catch (err) {
    console.error('Learning tracks error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Feature Roadmap / IT Projects (Section 5) ──────────────────────────────
// GET /api/roadmap
// Returns Projects table records filtered to IT/Systems dept, grouped by stage.
const IT_DEPT_ID = '6858d8c9355da45e14c28547';
const ROADMAP_STATUS_MAP = {
  'ready_for_review':                      'pipeline',
  'complete':                              'pipeline',
  '21c0705b-0c3b-45cd-9e93-07672fac949d': 'pipeline',
  'fb5677b7-3e68-4705-86af-abb8745a43f7': 'pipeline',
  'backlog':                               'pipeline',
  'zOlNR':                                 'wip',
  'Swowl':                                 'closeout',
  'Dio3d':                                 'closed',
};

app.get('/api/roadmap', async (req, res) => {
  try {
    const projects = await ssListAll(SS_PROJECTS_ID, [
      'title', 'status', 's49e345573', 'description', 'sfa6ec0fec',
      's8227b8fc4', 's7e23170f2', 's695a5c195', 'secceac461', 's4687ad08c',
    ]);
    const itProjects = projects.filter(p =>
      (p.s49e345573 || []).includes(IT_DEPT_ID)
    );
    const grouped = { pipeline: [], wip: [], closeout: [], closed: [] };
    itProjects.forEach(p => {
      const stage = ROADMAP_STATUS_MAP[p.status?.value] || 'pipeline';
      grouped[stage].push({
        id:          p.id,
        title:       p.title || '—',
        description: p.description || '',
        status:      p.status?.value || '',
        dates: {
          pipeline: p.sfa6ec0fec?.date  || null,
          wip:      p.s7e23170f2?.date  || null,
          close:    p.secceac461?.date  || null,
        },
        sbosUrl: `https://app.stitserbuilt.com/sb-crm-projects-list-details?recordId=${p.id}`,
      });
    });
    res.json({ groups: grouped, total: itProjects.length });
  } catch (err) {
    console.error('Roadmap error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/snapshot
// Creates Stats records in SmartSuite for the current dashboard state.
// v1: writes Stats records + returns HTML string for client-side download.
// TODO v1.1: upload HTML to Google Drive + write link back to Stats record.
// Increased limit: htmlContent can be 200-500KB; default 100KB limit causes 413 errors
app.post('/api/snapshot', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const { dashboardType = 'construction', periodStart, periodEnd, periodCode, metrics = [], htmlContent } = req.body || {};
    if (!periodStart || !periodEnd) return res.status(400).json({ error: 'periodStart and periodEnd required' });

    const headers = {
      'Authorization': `Token ${API_KEY}`,
      'ACCOUNT-ID':    SS_ACCOUNT_ID,
      'Content-Type':  'application/json',
    };

    const STATS_APP = '6840927ebcfa2d2bfef039e2';
    const created   = [];

    for (const m of metrics) {
      // Each metric: { goalId, priorityId, projectId, amount, periodType, label }
      // title is required (recordtitlefield); linked record fields take arrays of IDs.
      const payload = {
        title:      `${periodCode}-${m.label || 'Metric'}`,
        sd6cc86075: m.goalId     ? [m.goalId]     : [],  // Associated Goal (linkedrecordfield)
        s38ac950e1: m.priorityId ? [m.priorityId] : [],  // Associated Priority (linkedrecordfield)
        s5e8a7ac82: m.projectId  ? [m.projectId]  : [],  // Link to Projects (linkedrecordfield)
        s793df2063: { date: periodStart },                // Begin Date
        sb5657209d: { date: periodEnd   },                // End Date
        sfa08338c5: m.periodType || 'LGtGZ',             // Monthly(kwIw9) or Weekly(LGtGZ)
        s6471266f2: m.amount,                             // Amount for Period (required numberfield)
      };
      const r = await fetch(`${SS_BASE_URL}/applications/${STATS_APP}/records/`, {
        method: 'POST', headers,
        body: JSON.stringify(payload),
      });
      const rBody = await r.text();
      if (r.ok) {
        try { created.push(JSON.parse(rBody).id); } catch(e) {}
      } else {
        console.error(`Stats record create failed [${r.status}]:`, rBody.slice(0, 300));
      }
    }

    // Save HTML to a temp file if provided (client downloads it)
    // TODO v1.1: upload to Google Drive and write link to Stats record
    let snapshotFile = null;
    if (htmlContent) {
      const fname = `snapshot-${dashboardType}-${periodEnd}-${periodCode || 'snap'}.html`;
      snapshotFile = path.join(__dirname, 'snapshots', fname);
      fs.mkdirSync(path.join(__dirname, 'snapshots'), { recursive: true });
      fs.writeFileSync(snapshotFile, htmlContent, 'utf8');
    }

    res.json({
      ok: true,
      statsRecordsCreated: created.length,
      snapshotPath: snapshotFile ? `/snapshots/${path.basename(snapshotFile)}` : null,
      note: 'v1: Download the snapshot HTML from the link above and upload to Google Drive manually. v1.1 will automate Drive upload.',
    });
  } catch (err) {
    console.error('Snapshot error:', err.message);
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

app.use('/snapshots', express.static(path.join(__dirname, 'snapshots')));
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
