'use strict';
require('dotenv').config();

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { fetchSmartSuiteData } = require('./refresh-data');

// ── SmartSuite constants ────────────────────────────────────────────────────
const SS_ACCOUNT_ID        = 's71hvw05';
const SS_BASE_URL          = 'https://app.smartsuite.com/api/v1';
const SS_PROJECTS_ID       = '68216a706900e8eaf75a05a7';
const SS_BUDGET_APP        = '69bb89ebf6a195c2c73a3b3e';
const SS_G702_APP          = '68a8c3d2bba73ca6e62d0cb5';
const SS_PROJECT_DATES_APP = '69bb7d64740e0e696d88c47f';

const PROJ_DATE_CONST_START = 'PPaox';
const PROJ_DATE_CONST_END   = 'exoZI';

const SCORING_PERIOD = {
  start: new Date('2026-06-01T00:00:00Z'),
  end:   new Date('2026-12-31T23:59:59Z'),
  label: 'June 1 – December 31, 2026',
};

const DASHBOARD_FIELDS = [
  'title', 'status', 's4687ad08c',
  'sfa6ec0fec', 's8227b8fc4', 's7e23170f2',
  's695a5c195', 's17kv07k', 'secceac461',
  'scc0298307',
  'sacaa33d0f', 's5efff6ee9', 's828d7f9ef',
  'sz83pw9x',
  'sfiz2vvh',
  's561f1796b',
  'synemrwc',
  's0dm3fca',
  'sw6mypea',
  's4ec74af74',
  'sl14xzgf',
  's399940ae0',
];

const BUDGET_FIELDS = [
  's2ba7b261b', 'sb54d9092a', 's40ca9cdee', 's2f27d033f',
  'sc507e6b54', 'sed808550d', 'sa1a3abded', 's531f1d6ab',
  's160aa943b', 's0f7c08530', 's6506ec407', 's3636482e0',
  's32eed8560', 's363b6d973', 's4975ef4d4', 'last_updated',
];

const G702_FIELDS = [
  's12698a7c3', 's0592aef02', 's0996cf591', 's6ce9e1881',
  's2ce3db8ed', 'sf1daf8d5a', 's5a0e0a7b0', 's338ec3e01',
];

const KCS_HOMES_ID = '6914fe61e127b5f69fb770da';

const DISPOSITION_TYPE_IDS  = [
  '6a0629f81c9e28015cf0e856',
  '6a0655d2d3d9287b9a07591b',
];
const CONSTRUCTION_TYPE_IDS = [
  '6a0629f81c9e28015cf0e85b',
];

const CONSTRUCTION_STATUS_MAP = {
  'ready_for_review':                          { stage: 'BIZ_DEV',  label: 'Biz Dev — New Opportunity',  subLabel: 'New Opportunity' },
  'complete':                                  { stage: 'BIZ_DEV',  label: 'Biz Dev — Nurture',           subLabel: 'Nurture' },
  '21c0705b-0c3b-45cd-9e93-07672fac949d':     { stage: 'BIZ_DEV',  label: 'Biz Dev — Warm',             subLabel: 'Warm' },
  'fb5677b7-3e68-4705-86af-abb8745a43f7':     { stage: 'BIZ_DEV',  label: 'Biz Dev — Hot',              subLabel: 'Hot' },
  'backlog':                                   { stage: 'PIPELINE', label: 'Active in Pipeline',          subLabel: 'Active Pipeline' },
  'zOlNR':                                     { stage: 'WIP',      label: 'Active in WIP',               subLabel: 'WIP' },
  'Swowl':                                     { stage: 'CLOSEOUT', label: 'Closeout & Warranty',         subLabel: 'Closeout' },
  'Dio3d':                                     { stage: 'CLOSED',   label: 'Closed Job',                  subLabel: 'Closed' },
  '3ae0dcac-d82c-4171-95cd-3f40eed714d7':     { stage: 'EXCLUDE',  label: 'Declined',                    subLabel: 'Declined' },
  '41590c12-77e8-494b-878e-2dbb27012ca4':     { stage: 'EXCLUDE',  label: 'Job Lost',                    subLabel: 'Lost' },
};

const app     = express();
const PORT    = process.env.PORT || 3000;
const API_KEY = process.env.SMARTSUITE_API_KEY;

if (!API_KEY) {
  console.error('Error: SMARTSUITE_API_KEY is not set.');
  process.exit(1);
}

// ── In-memory caches ────────────────────────────────────────────────────────
let cache        = null;
let cacheTime    = null;
let fetchPromise = null;
const CACHE_TTL  = 7 * 24 * 60 * 60 * 1000; // PAUSED — 7 days

let dashCache     = null;
let dashCacheTime = null;
let dashPromise   = null;
const DASH_TTL    = 7 * 24 * 60 * 60 * 1000; // PAUSED — 7 days

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
      method: 'POST', headers,
      body: JSON.stringify({ limit: 500, offset, fields: DASHBOARD_FIELDS }),
    });
    if (!res.ok) throw new Error(`SmartSuite ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data  = await res.json();
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
  if (dashCache && !force && fresh)  return { items: dashCache, lastUpdated: new Date(dashCacheTime).toISOString(), stale: false };
  if (dashCache && !force && !fresh) {
    if (!dashPromise) {
      dashPromise = fetchDashboardProjects().then(items => {
        dashCache = items; dashCacheTime = Date.now(); dashPromise = null;
      }).catch(err => { dashPromise = null; console.error('Dashboard refresh failed:', err.message); });
    }
    return { items: dashCache, lastUpdated: new Date(dashCacheTime).toISOString(), stale: true };
  }
  if (!dashPromise) {
    dashPromise = fetchDashboardProjects().then(items => {
      dashCache = items; dashCacheTime = Date.now(); dashPromise = null; return items;
    }).catch(err => { dashPromise = null; throw err; });
  }
  await dashPromise;
  return { items: dashCache, lastUpdated: new Date(dashCacheTime).toISOString(), stale: false };
}

// ── Budget helpers ──────────────────────────────────────────────────────────
async function fetchAllBudgetRows() {
  const headers = { 'Authorization': `Token ${API_KEY}`, 'ACCOUNT-ID': SS_ACCOUNT_ID, 'Content-Type': 'application/json' };
  const all = []; let offset = 0;
  while (true) {
    const res = await fetch(`${SS_BASE_URL}/applications/${SS_BUDGET_APP}/records/list/`, {
      method: 'POST', headers,
      body: JSON.stringify({ limit: 500, offset, fields: BUDGET_FIELDS }),
    });
    if (!res.ok) throw new Error(`Budget API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json(); const items = data.items || [];
    all.push(...items); offset += items.length;
    if (!data.has_more || items.length === 0) break;
  }
  return all;
}

function summariseBudget(rows, companyId = null) {
  if (companyId) rows = rows.filter(r => (r.s2f27d033f || []).includes(companyId));
  const num  = v => (v != null && v !== '' && !isNaN(parseFloat(v))) ? parseFloat(v) : null;
  const best = (row, ...fields) => { for (const f of fields) { const v = num(row[f]); if (v !== null) return v; } return null; };
  const revenueRows = rows.filter(r => (r.s40ca9cdee?.[0]?.[0] || '') === 'Operating Cash-Income');
  const cogsRows    = rows.filter(r => (r.s40ca9cdee?.[0]?.[0] || '') === 'Operating Cash-COGS');
  const sumContract = rowSet => rowSet.reduce((s, r) => s + (best(r, 's531f1d6ab', 'sed808550d', 'sc507e6b54') || 0), 0) || null;
  const sumActuals  = rowSet => { let t = 0, h = false; for (const r of rowSet) { const v = best(r, 's0f7c08530', 's160aa943b'); if (v !== null) { t += v; h = true; } } return h ? t : null; };
  const sumBTF      = rowSet => { let t = 0, h = false; for (const r of rowSet) { const v = num(r.s6506ec407); if (v !== null) { t += v; h = true; } } return h ? t : null; };
  const contractRevenue = sumContract(revenueRows);
  const contractCost    = sumContract(cogsRows);
  const billedRevenue   = sumActuals(revenueRows);
  const billedCost      = sumActuals(cogsRows);
  const btfRevenue      = sumBTF(revenueRows);
  const contractGP  = (contractRevenue != null && contractCost != null) ? contractRevenue - contractCost : null;
  const billedGP    = (billedRevenue != null && billedCost != null) ? billedRevenue - billedCost : billedRevenue != null ? billedRevenue * 0.09 : null;
  const gpRate      = contractRevenue ? (contractGP ?? 0) / contractRevenue : null;
  const btf         = btfRevenue ?? (contractRevenue != null ? contractRevenue - (billedRevenue || 0) : null);
  const pctComplete = (contractRevenue && billedRevenue != null) ? billedRevenue / contractRevenue : 0;
  const hasG702     = rows.some(r => (r.s363b6d973 || []).length > 0);
  const hasBaseline = rows.some(r => num(r.sed808550d) || num(r.s531f1d6ab));
  const hasEstimate = rows.some(r => num(r.sc507e6b54));
  const budgetState = hasG702 ? 'billing' : hasBaseline ? 'baseline' : hasEstimate ? 'estimate' : 'empty';
  let budgetFreshnessDate = null, lastUpdatedFallback = null;
  for (const r of rows) {
    const formula = r.s4975ef4d4;
    if (formula && typeof formula === 'string' && (!budgetFreshnessDate || formula > budgetFreshnessDate)) budgetFreshnessDate = formula;
    const lu = r.last_updated?.on || (typeof r.last_updated === 'string' ? r.last_updated : null);
    if (lu && (!lastUpdatedFallback || lu > lastUpdatedFallback)) lastUpdatedFallback = lu;
  }
  budgetFreshnessDate = budgetFreshnessDate || lastUpdatedFallback;
  return { contractRevenue, contractCost, contractGP, gpRate, billedRevenue, billedCost, billedGP, btf, pctComplete, budgetState, hasBudget: rows.length > 0, hasRevenueRows: revenueRows.length > 0, hasCOGSRows: cogsRows.length > 0, budgetFreshnessDate };
}

// ── G-702 helpers ────────────────────────────────────────────────────────────
function parsePayAppDate(val) {
  if (!val || !Array.isArray(val)) return null;
  const inner = val[0]?.[0];
  if (!inner) return null;
  if (typeof inner === 'string' && inner.length >= 8) return new Date(inner);
  if (inner && typeof inner === 'object' && inner.date) return new Date(inner.date);
  return null;
}

async function fetchG702Records(projIdSet) {
  const headers = { 'Authorization': `Token ${API_KEY}`, 'ACCOUNT-ID': SS_ACCOUNT_ID, 'Content-Type': 'application/json' };
  const all = []; let offset = 0;
  while (true) {
    const res = await fetch(`${SS_BASE_URL}/applications/${SS_G702_APP}/records/list/`, {
      method: 'POST', headers,
      body: JSON.stringify({ limit: 500, offset, fields: G702_FIELDS }),
    });
    if (!res.ok) { console.error(`G-702 fetch error ${res.status}:`, (await res.text()).slice(0, 200)); break; }
    const data  = await res.json();
    const items = (data.items || []).filter(r => { const pid = Array.isArray(r.s12698a7c3) ? r.s12698a7c3[0] : r.s12698a7c3; return pid && projIdSet.has(pid); });
    all.push(...items);
    offset += (data.items || []).length;
    if (!data.has_more || (data.items || []).length === 0) break;
  }
  return all;
}

async function fetchProjectDatesMap() {
  const headers = { 'Authorization': `Token ${API_KEY}`, 'ACCOUNT-ID': SS_ACCOUNT_ID, 'Content-Type': 'application/json' };
  const fields  = ['sc632a4d66', 's147d5462c', 's8ca756976', 's7c51ac6b5', 'sde9ad11a3'];
  const filter  = { operator: 'or', fields: [{ field: 'sc632a4d66', comparison: 'is', value: PROJ_DATE_CONST_START }, { field: 'sc632a4d66', comparison: 'is', value: PROJ_DATE_CONST_END }] };
  const all = []; let offset = 0;
  while (true) {
    const res = await fetch(`${SS_BASE_URL}/applications/${SS_PROJECT_DATES_APP}/records/list/`, { method: 'POST', headers, body: JSON.stringify({ limit: 500, offset, fields, filter }) });
    if (!res.ok) { console.error(`Project Dates fetch error ${res.status}:`, (await res.text()).slice(0, 200)); break; }
    const data = await res.json(); const items = data.items || [];
    all.push(...items); offset += items.length;
    if (!data.has_more || items.length === 0) break;
  }
  const map = {};
  for (const r of all) {
    const projectId = Array.isArray(r.sde9ad11a3) ? r.sde9ad11a3[0] : r.sde9ad11a3;
    if (!projectId) continue;
    const eventVal = r.sc632a4d66?.value || r.sc632a4d66 || '';
    const date = r.s7c51ac6b5?.date || r.s147d5462c?.date || r.s8ca756976?.date || null;
    if (!map[projectId]) map[projectId] = { constStart: null, constEnd: null };
    if (eventVal === PROJ_DATE_CONST_START) map[projectId].constStart = date;
    if (eventVal === PROJ_DATE_CONST_END)   map[projectId].constEnd   = date;
  }
  return map;
}

function summariseG702s(g702Records, periodStart, periodEnd) {
  let periodRevenue = 0, hasPeriodData = false, cumulativeBilled = 0, retentionHeld = 0, btfFromG702 = null;
  for (const r of g702Records) {
    const payAppDate = parsePayAppDate(r.s0996cf591);
    const amtThisPeriod = parseFloat(r.s0592aef02) || 0;
    const completedToDate = parseFloat(r.s6ce9e1881) || 0;
    const retention = parseFloat(r.s2ce3db8ed) || 0;
    const btf = parseFloat(r.sf1daf8d5a);
    if (payAppDate && payAppDate >= periodStart && payAppDate <= periodEnd) { periodRevenue += amtThisPeriod; hasPeriodData = true; }
    cumulativeBilled = Math.max(cumulativeBilled, completedToDate);
    retentionHeld    = Math.max(retentionHeld, retention);
    if (!isNaN(btf)) btfFromG702 = btf;
  }
  return { periodRevenue: hasPeriodData ? periodRevenue : null, cumulativeBilled: cumulativeBilled || null, retentionHeld: retentionHeld || null, btfFromG702, g702Count: g702Records.length };
}

function computePillars(p, budget) {
  const b = { hasInflow: budget.hasRevenueRows, hasOutflow: budget.hasCOGSRows, hasG702orDrive: (p.sfiz2vvh?.length > 0) || !!(p.s561f1796b) };
  const s = { hasStart: !!(p.s7e23170f2?.date), hasEnd: !!(p.scc0298307?.date), hasSmartsheet: !!(p.s4ec74af74 && String(p.s4ec74af74).trim()) };
  const c = { hasDriveFolder: !!(p.s561f1796b), hasChecklists: (p.synemrwc?.length || 0) > 0 };
  const a = { hasGYR: (p.s0dm3fca?.length || 0) > 0, stakeholderCount: p.sw6mypea?.length || 0, hasEnoughStakeholders: (p.sw6mypea?.length || 0) >= 4 };
  const checks = [b.hasInflow, b.hasOutflow, b.hasG702orDrive, s.hasStart, s.hasEnd, s.hasSmartsheet, c.hasDriveFolder, c.hasChecklists, a.hasGYR, a.hasEnoughStakeholders];
  const passCount = checks.filter(Boolean).length;
  const missing = [];
  if (!b.hasInflow) missing.push('Budget: no revenue row'); if (!b.hasOutflow) missing.push('Budget: no cost row');
  if (!b.hasG702orDrive) missing.push('Budget: no G-702 or Drive folder'); if (!s.hasStart) missing.push('Schedule: no Construction Start date');
  if (!s.hasEnd) missing.push('Schedule: no Construction End date'); if (!s.hasSmartsheet) missing.push('Schedule: Smartsheet not linked');
  if (!c.hasDriveFolder) missing.push('Checklists: no Drive folder'); if (!c.hasChecklists) missing.push('Checklists: none assigned');
  if (!a.hasGYR) missing.push('Alignment: no GYR report');
  if (!a.hasEnoughStakeholders) missing.push(`Alignment: ${a.stakeholderCount}/4 stakeholders`);
  return { budget: b, schedule: s, checklists: c, alignment: a, complete: passCount === checks.length, passCount, total: checks.length, missing };
}

// ── Construction data cache ──────────────────────────────────────────────────
let constCache     = null;
let constCacheTime = null;
let constPromise   = null;
const CONST_TTL    = 7 * 24 * 60 * 60 * 1000; // PAUSED — 7 days

async function buildConstructionData() {
  const [allProjects, allBudgetRows, projectDatesMap] = await Promise.all([
    fetchDashboardProjects(),
    fetchAllBudgetRows(),
    fetchProjectDatesMap().catch(err => { console.error('Project Dates fetch failed (non-fatal):', err.message); return {}; }),
  ]);
  const projects = allProjects.filter(p => {
    const pt = Array.isArray(p.s4687ad08c) ? p.s4687ad08c : (p.s4687ad08c ? [p.s4687ad08c] : []);
    return CONSTRUCTION_TYPE_IDS.some(id => pt.includes(id));
  });
  const projIds = new Set(projects.map(p => p.id));
  const allG702s = await fetchG702Records(projIds).catch(err => { console.error('G-702 fetch failed (non-fatal):', err.message); return []; });
  const budgetByProject = {};
  for (const row of allBudgetRows) {
    const ids = Array.isArray(row.s2ba7b261b) ? row.s2ba7b261b : (row.s2ba7b261b ? [row.s2ba7b261b] : []);
    for (const pid of ids) if (projIds.has(pid)) (budgetByProject[pid] = budgetByProject[pid] || []).push(row);
  }
  const g702ByProject = {};
  for (const r of allG702s) {
    const pid = Array.isArray(r.s12698a7c3) ? r.s12698a7c3[0] : r.s12698a7c3;
    if (pid && projIds.has(pid)) (g702ByProject[pid] = g702ByProject[pid] || []).push(r);
  }
  function periodCapturableBTF(btf, estConstEnd) {
    if (!btf || btf <= 0) return 0;
    const today = new Date();
    if (!estConstEnd) return btf;
    const projEnd = new Date(estConstEnd);
    if (projEnd <= SCORING_PERIOD.end) return btf;
    const daysInPeriod   = Math.max(0, (SCORING_PERIOD.end - today) / 86400000);
    const daysToComplete = Math.max(1, (projEnd - today) / 86400000);
    return btf * Math.min(1, daysInPeriod / daysToComplete);
  }
  const CONFIDENCE_SCALE   = 10;
  const DEFAULT_CONVERSION = 0.30;
  const DEFAULT_DURATION   = 90;
  const MIN_VALID_DURATION = 14;
  const HOT_DEFAULT_CONVERSION = 0.55;
  const today = new Date();
  const daysRemainingInPeriod = Math.max(0, (SCORING_PERIOD.end - today) / 86400000);
  const annotated = projects.map(p => {
    const statusVal  = p.status?.value || '';
    const stageInfo  = CONSTRUCTION_STATUS_MAP[statusVal] || { stage: 'BIZ_DEV', label: statusVal || 'Unknown', subLabel: statusVal || 'Unknown' };
    const budgetRows = budgetByProject[p.id] || [];
    const productTypes  = Array.isArray(p.s4687ad08c) ? p.s4687ad08c : (p.s4687ad08c ? [p.s4687ad08c] : []);
    const isMultiType   = productTypes.length > 1;
    const companyFilter = isMultiType ? KCS_HOMES_ID : null;
    const budget   = summariseBudget(budgetRows, companyFilter);
    const g702     = summariseG702s(g702ByProject[p.id] || [], SCORING_PERIOD.start, SCORING_PERIOD.end);
    const pillars  = computePillars(p, budget);
    const estConstEnd = p.scc0298307?.date || null;
    const capturableBTF = periodCapturableBTF(budget.btf, estConstEnd);
    const rawRating = parseFloat(p.sl14xzgf) || 0;
    const confidenceRating = rawRating > 0 ? rawRating : null;
    const conversionRate   = rawRating > 0 ? Math.min(1, rawRating / CONFIDENCE_SCALE) : DEFAULT_CONVERSION;
    const rawDuration = parseFloat(p.s399940ae0) || 0;
    const estDuration = rawDuration >= MIN_VALID_DURATION ? rawDuration : DEFAULT_DURATION;
    const isHot = stageInfo.stage === 'BIZ_DEV' && stageInfo.subLabel === 'Hot';
    let pipelineProjected = 0;
    if (budget.contractRevenue && daysRemainingInPeriod > 0) {
      if (stageInfo.stage === 'PIPELINE') {
        const billableFrac = Math.min(1, daysRemainingInPeriod / estDuration);
        pipelineProjected  = budget.contractRevenue * billableFrac * conversionRate;
      } else if (isHot) {
        const hotConvRate = rawRating > 0 ? Math.min(1, rawRating / CONFIDENCE_SCALE) : HOT_DEFAULT_CONVERSION;
        if (hotConvRate >= 0.50) {
          const billableFrac = Math.min(1, daysRemainingInPeriod / estDuration);
          pipelineProjected  = budget.contractRevenue * billableFrac * hotConvRate;
        }
      }
    }
    return {
      id: p.id, title: p.title || p.s937f1d342 || '—',
      sbosUrl: `https://app.stitserbuilt.com/sb-crm-projects-list-details?recordId=${p.id}`,
      statusValue: statusVal, stage: stageInfo.stage, statusLabel: stageInfo.label, subLabel: stageInfo.subLabel,
      isMultiType, productTypes, pillars,
      dates: { pipeline: p.sfa6ec0fec?.date || null, awarded: p.s8227b8fc4?.date || null, wip: p.s7e23170f2?.date || null, outOfWip: p.s695a5c195?.date || null, estClose: p.secceac461?.date || null, actClose: p.s17kv07k?.date || null, estConstEnd, constStart: (projectDatesMap[p.id] || {}).constStart || null, constEnd: (projectDatesMap[p.id] || {}).constEnd || null },
      budget, g702,
      period: { billedActual: g702.periodRevenue || 0, capturableBTF, pipelineProjected, extendsOutOfPeriod: estConstEnd && new Date(estConstEnd) > SCORING_PERIOD.end },
      conversion: { confidenceRating, conversionRate, estDuration, isDefaultRating: rawRating === 0 },
      freshness: { budget: budget.budgetFreshnessDate, schedule: null },
    };
  }).filter(p => p.stage !== 'EXCLUDE');
  const bucketA = annotated.reduce((s, p) => s + (p.period.billedActual || 0), 0);
  const bucketB = annotated.filter(p => p.stage === 'WIP' || p.stage === 'CLOSEOUT').reduce((s, p) => s + (p.period.capturableBTF || 0), 0);
  const bucketC = annotated.filter(p => p.stage === 'PIPELINE' || (p.stage === 'BIZ_DEV' && p.subLabel === 'Hot')).reduce((s, p) => s + (p.period.pipelineProjected || 0), 0);
  const projectedTotal = bucketA + bucketB + bucketC;
  console.log(`Construction data built — ${annotated.length} projects. Projected: $A=${bucketA.toLocaleString()} $B=${bucketB.toLocaleString()} $C=${bucketC.toLocaleString()} Total=$${projectedTotal.toLocaleString()}`);
  return { projects: annotated, scoringPeriod: { start: SCORING_PERIOD.start.toISOString(), end: SCORING_PERIOD.end.toISOString(), label: SCORING_PERIOD.label }, periodRevenue: bucketA, score: { bucketA, bucketB, bucketC, projectedTotal, coverage: projectedTotal / 4_500_000 } };
}

async function getConstructionData(force) {
  const now   = Date.now();
  const fresh = constCache && constCacheTime && (now - constCacheTime) < CONST_TTL;
  if (constCache && !force && fresh)  return { ...constCache, lastUpdated: new Date(constCacheTime).toISOString(), stale: false };
  if (constCache && !force && !fresh) {
    if (!constPromise) constPromise = buildConstructionData().then(data => { constCache = data; constCacheTime = Date.now(); constPromise = null; }).catch(err => { constPromise = null; console.error('Construction refresh failed:', err.message); });
    return { ...constCache, lastUpdated: new Date(constCacheTime).toISOString(), stale: true };
  }
  if (!constPromise) constPromise = buildConstructionData().then(data => { constCache = data; constCacheTime = Date.now(); constPromise = null; return data; }).catch(err => { constPromise = null; throw err; });
  await constPromise;
  return { ...constCache, lastUpdated: new Date(constCacheTime).toISOString(), stale: false };
}

// ── Portfolio planner cache ──────────────────────────────────────────────────
function startBackgroundRefresh() {
  if (fetchPromise) return;
  fetchPromise = fetchSmartSuiteData(API_KEY).then(projects => {
    cache = projects; cacheTime = Date.now(); fetchPromise = null;
    console.log(`Cache refreshed — ${projects.length} projects`);
  }).catch(err => { fetchPromise = null; console.error('Background refresh failed:', err.message); });
}

async function getData(force) {
  const now   = Date.now();
  const fresh = cache && cacheTime && (now - cacheTime) < CACHE_TTL;
  if (cache && !force) { if (!fresh) startBackgroundRefresh(); return { projects: cache, lastUpdated: new Date(cacheTime).toISOString(), stale: !fresh }; }
  if (!fetchPromise) fetchPromise = fetchSmartSuiteData(API_KEY).then(projects => { cache = projects; cacheTime = Date.now(); fetchPromise = null; return projects; }).catch(err => { fetchPromise = null; throw err; });
  await fetchPromise;
  return { projects: cache, lastUpdated: new Date(cacheTime).toISOString(), stale: false };
}

// ── Entity Reporting store ───────────────────────────────────────────────────
const REPORTING_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'entity-reporting.json')
  : path.join(__dirname, 'entity-reporting.json');

function loadReporting() {
  try { if (fs.existsSync(REPORTING_PATH)) return JSON.parse(fs.readFileSync(REPORTING_PATH, 'utf8')); } catch(e) { console.error('entity-reporting load error:', e.message); }
  return { config: { entities: [] }, reports: {} };
}
function saveReporting(data) {
  try { fs.writeFileSync(REPORTING_PATH, JSON.stringify(data, null, 2), 'utf8'); } catch(e) { console.error('entity-reporting save error:', e.message); }
}

app.get('/api/entity-reporting', (_req, res) => { res.json(loadReporting()); });

app.post('/api/entity-reporting', express.json(), (req, res) => {
  const { period, entity, status, driveLink, deliveredDate, notes } = req.body || {};
  if (!period || !entity) return res.status(400).json({ error: 'period and entity are required' });
  const data = loadReporting();
  if (!data.reports[period]) data.reports[period] = {};
  data.reports[period][entity] = { status: status || 'pending', driveLink: driveLink || null, deliveredDate: deliveredDate || null, notes: notes || '', updatedAt: new Date().toISOString() };
  saveReporting(data);
  res.json({ ok: true });
});

app.post('/api/entity-reporting/config', express.json(), (req, res) => {
  const { entities, periodOverrides } = req.body || {};
  if (!Array.isArray(entities)) return res.status(400).json({ error: 'entities array required' });
  const data = loadReporting();
  data.config.entities = entities;
  if (periodOverrides && typeof periodOverrides === 'object') data.config.periodOverrides = periodOverrides;
  saveReporting(data);
  res.json({ ok: true });
});

// ── Article Editor ────────────────────────────────────────────────────────────
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GH_REPO      = 'clint-stitser/sb-planning-tools';
const GH_API       = 'https://api.github.com';

function articleCors(req, res, next) {
  const allowed = ['https://clint-stitser.github.io', 'http://localhost:3000', 'http://127.0.0.1:5500', 'http://localhost:5500'];
  const origin = req.headers.origin;
  if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

app.get('/api/article/history', articleCors, async (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'path required' });
  if (!GITHUB_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN not set' });
  try {
    const r = await fetch(`${GH_API}/repos/${GH_REPO}/commits?path=${encodeURIComponent(filePath)}&per_page=25`, { headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' } });
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    const commits = await r.json();
    res.json({ history: commits.map(c => ({ sha: c.sha.slice(0, 7), message: c.commit.message, author: c.commit.author.name, date: c.commit.author.date })) });
  } catch (err) { console.error('Article history error:', err.message); res.status(500).json({ error: err.message }); }
});

app.post('/api/article/save', articleCors, express.json({ limit: '4mb' }), async (req, res) => {
  const { filePath, html, editorName } = req.body || {};
  if (!filePath || !html || !editorName) return res.status(400).json({ error: 'filePath, html, and editorName are required' });
  if (!GITHUB_TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN not set' });
  const ghHeaders = { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' };
  const fileUrl = `${GH_API}/repos/${GH_REPO}/contents/${filePath}`;
  try {
    const cleanHtml = html.replace(/\s*contenteditable="[^"]*"/g, '');
    const current = await fetch(fileUrl, { headers: ghHeaders });
    if (!current.ok) throw new Error(`GitHub GET ${current.status}`);
    const { sha } = await current.json();
    const now = new Date(); const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const label = filePath.split('/').pop().replace('.html', '').replace(/-/g, ' ');
    const message = `${editorName} edited ${label} — ${dateStr}`;
    const content = Buffer.from(cleanHtml).toString('base64');
    const update = await fetch(fileUrl, { method: 'PUT', headers: ghHeaders, body: JSON.stringify({ message, content, sha }) });
    if (!update.ok) throw new Error(`GitHub PUT ${update.status}: ${(await update.text()).slice(0, 200)}`);
    const result = await update.json();
    console.log(`Article saved: ${message}`);
    res.json({ ok: true, sha: result.content?.sha?.slice(0, 7), message });
  } catch (err) { console.error('Article save error:', err.message); res.status(500).json({ error: err.message }); }
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/api/construction-data', async (req, res) => {
  try {
    const force = req.query.force === 'true';
    res.json(await getConstructionData(force));
  } catch (err) { console.error('Construction data error:', err.message); res.status(500).json({ error: err.message }); }
});

// ── Learning Tracks ───────────────────────────────────────────────────────────
const TRAIN_TRACKS_APP   = '68d480e2727607560a7f0d23';
const TRAIN_COURSES_APP  = '68d480e2727607560a7f0d2c';
const TRAIN_LESSONS_APP  = '68d480e2727607560a7f0d26';
const TRAIN_PROGRESS_APP = '6a18ad82e630be8e82a202ea';

async function ssListAll(appId, fields = []) {
  const headers = { 'Authorization': `Token ${API_KEY}`, 'ACCOUNT-ID': SS_ACCOUNT_ID, 'Content-Type': 'application/json' };
  const all = []; let offset = 0;
  while (true) {
    const body = { limit: 200, offset };
    if (fields.length) body.fields = fields;
    const r = await fetch(`${SS_BASE_URL}/applications/${appId}/records/list/`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!r.ok) break;
    const d = await r.json(); all.push(...(d.items || []));
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
    let completedLessonIds = new Set();
    if (personId) {
      const progress = await ssListAll(TRAIN_PROGRESS_APP, ['s795f4d404', 's43b519ec1', 's56ad0c6cc']);
      progress.forEach(p => { const persons = p.s43b519ec1 || []; if (persons.includes(personId)) (p.s795f4d404 || []).forEach(lid => completedLessonIds.add(lid)); });
    }
    const hierarchy = tracks.map(track => ({
      id: track.id, title: track.title, description: track.description || '',
      courses: courses.filter(c => (c.link_to_learning_tracks || []).includes(track.id)).map(course => ({
        id: course.id, title: course.title, description: course.description || '', totalMins: parseFloat(course.s59d010ab9) || null,
        lessons: lessons.filter(l => (l.link_to_courses || []).includes(course.id)).sort((a, b) => (parseFloat(a.se82cbdade) || 99) - (parseFloat(b.se82cbdade) || 99)).map(l => ({
          id: l.id, title: l.title, description: l.description || '', url: l.sefd6f1609 || null, mins: parseFloat(l.sa2c745c03) || null,
          pillar: l.s05e6aca0a || '', type: l.s7ccdea252 || l.type || '', audience: l.s2d92d822a || '', status: l.sd97f4c063 || '',
          lessonNum: parseFloat(l.se82cbdade) || null, completed: completedLessonIds.has(l.id),
        })),
      })),
    }));
    res.json({ tracks: hierarchy, personId });
  } catch (err) { console.error('Learning tracks error:', err.message); res.status(500).json({ error: err.message }); }
});

// ── Feature Roadmap / IT Projects ─────────────────────────────────────────────
const IT_DEPT_ID = '6858d8c9355da45e14c28547';
const ROADMAP_STATUS_MAP = {
  'ready_for_review': 'pipeline', 'complete': 'pipeline',
  '21c0705b-0c3b-45cd-9e93-07672fac949d': 'pipeline',
  'fb5677b7-3e68-4705-86af-abb8745a43f7': 'pipeline',
  'backlog': 'pipeline', 'zOlNR': 'wip', 'Swowl': 'closeout', 'Dio3d': 'closed',
};

// App Item field slugs
const APP_ITEM_FIELDS = [
  'sf7ec194d1',  // Kind of App Item (multiselect)
  'sc25affb6d',  // App Item Applicable Pillars (multiselect)
  'sfdac4b613',  // App Item Applicable Stages (multiselect)
  's1dbcd776a',  // App Item Inclusions (multiselect)
  'svwfwds0',    // Link to Check Lists
  'synemrwc',    // Link to Check List Tasks
];

app.get('/api/roadmap', async (req, res) => {
  try {
    const baseFields = [
      'title', 'status', 's49e345573', 'description', 'sfa6ec0fec',
      's8227b8fc4', 's7e23170f2', 's695a5c195', 'secceac461', 's4687ad08c',
      ...APP_ITEM_FIELDS,
    ];
    const projects = await ssListAll(SS_PROJECTS_ID, baseFields);
    const itProjects = projects.filter(p => (p.s49e345573 || []).includes(IT_DEPT_ID));
    const grouped = { pipeline: [], wip: [], closeout: [], closed: [] };
    itProjects.forEach(p => {
      const stage = ROADMAP_STATUS_MAP[p.status?.value] || 'pipeline';
      grouped[stage].push({
        id:          p.id,
        title:       p.title || '—',
        description: p.description || '',
        status:      p.status?.value || '',
        // App Item metadata
        sf7ec194d1:  p.sf7ec194d1  || [],  // kind
        sc25affb6d:  p.sc25affb6d  || [],  // pillars
        sfdac4b613:  p.sfdac4b613  || [],  // stages
        s1dbcd776a:  p.s1dbcd776a  || [],  // inclusions
        dates: {
          pipeline: p.sfa6ec0fec?.date || null,
          wip:      p.s7e23170f2?.date || null,
          close:    p.secceac461?.date || null,
        },
        sbosUrl: `https://app.stitserbuilt.com/sb-crm-projects-list-details?recordId=${p.id}`,
      });
    });
    res.json({ groups: grouped, total: itProjects.length });
  } catch (err) { console.error('Roadmap error:', err.message); res.status(500).json({ error: err.message }); }
});

// POST /api/roadmap/update
// Body: { id, sf7ec194d1, sc25affb6d, sfdac4b613, s1dbcd776a }
// Writes the four App Item multiselect fields back to SmartSuite.
app.post('/api/roadmap/update', express.json(), async (req, res) => {
  try {
    const { id, sf7ec194d1, sc25affb6d, sfdac4b613, s1dbcd776a } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const payload = {};
    if (Array.isArray(sf7ec194d1)) payload.sf7ec194d1 = sf7ec194d1;
    if (Array.isArray(sc25affb6d)) payload.sc25affb6d = sc25affb6d;
    if (Array.isArray(sfdac4b613)) payload.sfdac4b613 = sfdac4b613;
    if (Array.isArray(s1dbcd776a)) payload.s1dbcd776a = s1dbcd776a;
    if (Object.keys(payload).length === 0) return res.status(400).json({ error: 'no valid fields to update' });
    const r = await fetch(`${SS_BASE_URL}/applications/${SS_PROJECTS_ID}/records/${id}/`, {
      method:  'PATCH',
      headers: { 'Authorization': `Token ${API_KEY}`, 'ACCOUNT-ID': SS_ACCOUNT_ID, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const body = await r.text();
      console.error(`Roadmap update error ${r.status}:`, body.slice(0, 300));
      return res.status(r.status).json({ error: `SmartSuite ${r.status}`, detail: body.slice(0, 200) });
    }
    const updated = await r.json();
    console.log(`Roadmap update: ${id} — ${Object.keys(payload).join(', ')}`);
    res.json({ ok: true, id, updated: Object.keys(payload) });
  } catch (err) { console.error('Roadmap update error:', err.message); res.status(500).json({ error: err.message }); }
});

// ── Snapshot ──────────────────────────────────────────────────────────────────
app.post('/api/snapshot', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const { dashboardType = 'construction', periodStart, periodEnd, periodCode, metrics = [], htmlContent } = req.body || {};
    if (!periodStart || !periodEnd) return res.status(400).json({ error: 'periodStart and periodEnd required' });
    const headers = { 'Authorization': `Token ${API_KEY}`, 'ACCOUNT-ID': SS_ACCOUNT_ID, 'Content-Type': 'application/json' };
    const STATS_APP = '6840927ebcfa2d2bfef039e2';
    const created   = [];
    for (const m of metrics) {
      const payload = {
        title: `${periodCode}-${m.label || 'Metric'}`,
        sd6cc86075: m.goalId     ? [m.goalId]     : [],
        s38ac950e1: m.priorityId ? [m.priorityId] : [],
        s5e8a7ac82: m.projectId  ? [m.projectId]  : [],
        s793df2063: { date: periodStart },
        sb5657209d: { date: periodEnd },
        sfa08338c5: m.periodType || 'LGtGZ',
        s6471266f2: m.amount,
      };
      const r = await fetch(`${SS_BASE_URL}/applications/${STATS_APP}/records/`, { method: 'POST', headers, body: JSON.stringify(payload) });
      const rBody = await r.text();
      if (r.ok) { try { created.push(JSON.parse(rBody).id); } catch(e) {} } else console.error(`Stats record create failed [${r.status}]:`, rBody.slice(0, 300));
    }
    let snapshotFile = null;
    if (htmlContent) {
      const fname = `snapshot-${dashboardType}-${periodEnd}-${periodCode || 'snap'}.html`;
      snapshotFile = path.join(__dirname, 'snapshots', fname);
      fs.mkdirSync(path.join(__dirname, 'snapshots'), { recursive: true });
      fs.writeFileSync(snapshotFile, htmlContent, 'utf8');
    }
    res.json({ ok: true, statsRecordsCreated: created.length, snapshotPath: snapshotFile ? `/snapshots/${path.basename(snapshotFile)}` : null });
  } catch (err) { console.error('Snapshot error:', err.message); res.status(500).json({ error: err.message }); }
});

// ── Dashboard projects ────────────────────────────────────────────────────────
app.get('/api/dashboard-projects', async (req, res) => {
  try {
    const type  = (req.query.type || '').toLowerCase();
    const force = req.query.force === 'true';
    const typeIds = type === 'construction' ? CONSTRUCTION_TYPE_IDS : type === 'disposition' ? DISPOSITION_TYPE_IDS : null;
    const { items, lastUpdated, stale } = await getDashboardProjects(force);
    const filtered = typeIds ? items.filter(p => { const ptArr = Array.isArray(p.s4687ad08c) ? p.s4687ad08c : (p.s4687ad08c ? [p.s4687ad08c] : []); return typeIds.some(id => ptArr.includes(id)); }) : items;
    res.json({ items: filtered, total: filtered.length, lastUpdated, stale });
  } catch (err) { console.error('Dashboard projects error:', err.message); res.status(500).json({ error: err.message }); }
});

app.get('/api/data', async (req, res) => {
  try {
    const force = req.query.force === 'true';
    res.json(await getData(force));
  } catch (err) { console.error('SmartSuite fetch error:', err.message); res.status(500).json({ error: err.message }); }
});

// ── Hub pages ─────────────────────────────────────────────────────────────────
app.get('/team',      (req, res) => res.sendFile(path.join(__dirname, 'dashboards/team.html')));
app.get('/executive', (req, res) => res.sendFile(path.join(__dirname, 'dashboards/executive.html')));
app.get('/personal',  (req, res) => res.sendFile(path.join(__dirname, 'dashboards/personal.html')));

app.use('/snapshots', express.static(path.join(__dirname, 'snapshots')));
app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Stitser BUILT Planning Tools → http://localhost:${PORT}`);
  startBackgroundRefresh();
  setInterval(startBackgroundRefresh, 25 * 60 * 1000);
});
