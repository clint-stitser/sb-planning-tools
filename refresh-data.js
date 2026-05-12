#!/usr/bin/env node
'use strict';

/**
 * refresh-data.js
 *
 * Exports fetchSmartSuiteData() for use by server.js.
 * Also runnable as a CLI to bake data into index.html:
 *   SMARTSUITE_API_KEY=<key> node refresh-data.js
 */

const fs   = require('fs');
const path = require('path');

const ACCOUNT_ID = 's71hvw05';
const BASE_URL   = 'https://app.smartsuite.com/api/v1';

// ── App IDs ────────────────────────────────────────────────────────────────
const APPS = {
  projects:     '68216a706900e8eaf75a05a7',
  stakeholders: '6996a3079f04b5f34a06ad88',
  people:       '68216a706900e8eaf75a05af',
  companies:    '68216a706900e8eaf75a05c0',
  dates:        '69bb7d64740e0e696d88c47f',
  budget:       '69bb89ebf6a195c2c73a3b3e',
};

// ── Lookup tables ──────────────────────────────────────────────────────────
const STATUS_STAGE = {
  'ready_for_review':                          'New Opportunity',
  'complete':                                  'Nurture',
  '21c0705b-0c3b-45cd-9e93-07672fac949d':     'Warm',
  'fb5677b7-3e68-4705-86af-abb8745a43f7':     'Hot',
  'backlog':                                   'Pipeline',
  'zOlNR':                                     'WIP',
  'Swowl':                                     'Closeout',
  'Dio3d':                                     'Closed',
};

const ACTIVE_STAGES = new Set(['WIP', 'Closeout', 'Pipeline', 'New Opportunity', 'Nurture', 'Warm', 'Hot']);

const SECTION_MAP = {
  'ozQle': 'inv',
  'x0IWR': 'op',
  'wExoS': 'fin',
};

const EVENT_MAP = {
  'zMFpd': 'UW Start',
  'r1Jtf': 'First Meeting/Job Walk',
  'x70Sj': 'Second Meeting/Final Questions',
  'iPHKk': 'Date to Enter Pipeline',
  'f8xrD': 'Purchase Close Date',
  'e2buq': 'Bid Completion Date',
  '0x5Gz': 'Project Awarded',
  'sfcAz': 'Permit Issuance',
  'PPaox': 'Construction Start',
  'exoZI': 'Construction End',
  'K302b': 'COE/Lease Commence',
  'kc4xy': 'Closeout & Punch List',
  '5Urb3': '1 Year Warranty End Date',
  'FxgSM': 'Statutory Liability End Date',
  '48dr3': 'List Date',
};

const ROLE_MAP = {
  'oQSWE': 'Architect/Engineer/Planner',
  'VdKY5': 'Attorney',
  'YNZwg': 'Biz Dev Lead',
  'aluKw': 'Buyer/Tenant',
  'fCIvB': "Buyer/Tenant's Broker",
  '2mllV': 'Debt',
  'PIaqT': 'Equity',
  'PBJa9': 'Owner',
  'rDEzH': "Owner's Broker",
  'DuEsY': "Owner's Rep",
  '3cdUc': 'Project Engineer',
  'neoql': 'Project Estimator',
  'afZkI': 'Project Manager',
  'fc4Gy': 'Sub-Contractor',
  'uEcZp': 'Superintendent',
  'ylggs': 'Buyer Broker',
  'ojeaa': 'Owner Broker',
  'n8868': 'Title Company',
  'JSwTr': 'Project Contact (TBD)',
  'O4qQl': 'Introduced/Referred Project',
};

const TRACK_MAP = {
  'pO6Hh': 'Track 1 (Operating Revenue)',
  'UhSZv': 'Track 2 (Back-End Profit)',
};

// ── API helpers ────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function listRecords(appId, apiKey, body = {}, fields = null) {
  const headers = {
    'Authorization': `Token ${apiKey}`,
    'ACCOUNT-ID': ACCOUNT_ID,
    'Content-Type': 'application/json',
  };
  const records = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const payload = { limit, offset, ...body };
    if (fields) payload.fields = fields;
    let res, retries = 0;
    while (true) {
      res = await fetch(`${BASE_URL}/applications/${appId}/records/list/`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (res.status === 429) {
        const wait = (2 ** retries) * 2000;
        console.log(`  Rate limited — retrying in ${wait / 1000}s…`);
        await sleep(wait);
        retries++;
        if (retries > 5) throw new Error(`Max retries exceeded for app ${appId}`);
      } else break;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${res.status} for app ${appId}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    records.push(...(data.items || []));
    const total = data.total ?? data.count ?? 0;
    offset += limit;
    if (offset >= total) break;
    await sleep(500);
  }
  return records;
}

// ── Date helpers ───────────────────────────────────────────────────────────
function toYMD(isoStr) {
  if (!isoStr) return null;
  return isoStr.slice(0, 10);
}
function dateVal(field) {
  if (!field) return null;
  return toYMD(field.date);
}
function computeNkd(datePairs) {
  const TODAY = new Date().toISOString().slice(0, 10);
  const valid = datePairs.filter(x => x.d);
  if (!valid.length) return null;
  const future = valid.filter(x => x.d >= TODAY).sort((a, b) => a.d.localeCompare(b.d));
  const past   = valid.filter(x => x.d <  TODAY).sort((a, b) => b.d.localeCompare(a.d));
  const chosen = future[0] || past[0];
  return { e: chosen.e, d: chosen.d, past: chosen.d < TODAY };
}

// ── Core fetch + transform ─────────────────────────────────────────────────
async function fetchSmartSuiteData(apiKey) {
  const t0 = Date.now();
  console.log('Fetching SmartSuite data…');

  const [projects, people, companies, stakeholders, dateRecs, budgetRecs] = await Promise.all([
    listRecords(APPS.projects,     apiKey),
    listRecords(APPS.people,       apiKey),
    listRecords(APPS.companies,    apiKey),
    listRecords(APPS.stakeholders, apiKey),
    listRecords(APPS.dates,        apiKey),
    listRecords(APPS.budget,       apiKey),
  ]);

  console.log(`Fetched in ${((Date.now()-t0)/1000).toFixed(1)}s: ${projects.length} projects, ${people.length} people, ${companies.length} companies, ${stakeholders.length} stakeholders, ${dateRecs.length} dates, ${budgetRecs.length} budget items`);

  const peopleById  = Object.fromEntries(people.map(p => [p.id, p.title || '']));
  const companyById = Object.fromEntries(companies.map(c => [c.id, c.title || '']));

  const datesByProject = {};
  for (const r of dateRecs) {
    for (const pid of (r.sed6d961dc || [])) (datesByProject[pid] ||= []).push(r);
  }
  const budgetByProject = {};
  for (const r of budgetRecs) {
    for (const pid of (r.s2ba7b261b || [])) (budgetByProject[pid] ||= []).push(r);
  }
  const stakeholdersByProject = {};
  for (const r of stakeholders) {
    for (const pid of (r.sbb52b9f41 || [])) (stakeholdersByProject[pid] ||= []).push(r);
  }

  const result = [];
  for (const proj of projects) {
    const statusVal = (proj.status?.value) || proj.status;
    const stage     = STATUS_STAGE[statusVal];
    if (!stage || !ACTIVE_STAGES.has(stage)) continue;

    const id  = proj.id;
    const n   = proj.title || '';
    const url = `https://app.stitserbuilt.com/sb-crm-projects-list-details?recordId=${id}`;

    const coIds = proj.s828d7f9ef || [];
    const co    = coIds.length ? (companyById[coIds[0]] || '—') : '—';

    const projDateRecs = datesByProject[id] || [];
    const datePairs = [];
    for (const dr of projDateRecs) {
      const eventLabel = EVENT_MAP[dr.sc632a4d66] || dr.sc632a4d66 || '';
      if (!eventLabel) continue;
      const est  = dateVal(dr.s147d5462c);
      const base = dateVal(dr.s8ca756976);
      const act  = dateVal(dr.s7c51ac6b5);
      const d    = act || base || est;
      if (d) datePairs.push({ e: eventLabel, d, est, base, act });
    }
    datePairs.sort((a, b) => a.d.localeCompare(b.d));
    const nkd = computeNkd(datePairs);

    const mp = {};
    for (const sr of (stakeholdersByProject[id] || [])) {
      const roles     = sr.sfc079d5e5 || [];
      const peopleIds = sr.s9b0ef21d0 || [];
      for (const roleVal of roles) {
        const roleLabel = ROLE_MAP[roleVal] || roleVal;
        if (!mp[roleLabel]) mp[roleLabel] = [];
        for (const pid of peopleIds) {
          const name = peopleById[pid];
          if (name && !mp[roleLabel].includes(name)) mp[roleLabel].push(name);
        }
      }
    }

    const rows = [];
    let inv_b = 0, inv_c = 0, inv_x = 0;
    let op_b  = 0, op_c  = 0, op_x  = 0;
    let fin_b = 0, fin_c = 0, fin_x = 0;

    for (const br of (budgetByProject[id] || [])) {
      const secRaw = br.s8ee35f579;
      const s      = SECTION_MAP[secRaw] || 'op';
      const t      = TRACK_MAP[br.sb54d9092a] || '';
      const e      = parseFloat(br.sc507e6b54)  || 0;
      const b      = parseFloat(br.s818f40f1d)  || 0;
      const co     = parseFloat(br.s432af3d33)  || 0;
      const adj    = parseFloat(br.s531f1d6ab)  || 0;
      const ctd    = parseFloat(br.sb0927b194)  || 0;
      const act    = parseFloat(br.scfca058ab)  || 0;
      const btf    = parseFloat(br.s6506ec407)  || 0;
      const pct    = parseFloat(br.s3636482e0)  || 0;

      rows.push({ a: br.s32eed8560 || '', s, t, e, b, co, adj, ctd, act, btf, pct, mo: {} });

      if (s === 'inv') { inv_b += b; inv_c += co; inv_x += adj; }
      if (s === 'op')  { op_b  += b; op_c  += co; op_x  += adj; }
      if (s === 'fin') { fin_b += b; fin_c += co; fin_x += adj; }
    }

    result.push({ id, n, sg: stage, co, url, nkd, dates: datePairs, mp, rows,
      inv_b, inv_c, inv_x, op_b, op_c, op_x, fin_b, fin_c, fin_x });
  }

  console.log(`Transformed ${result.length} active projects`);
  return result;
}

module.exports = { fetchSmartSuiteData };

// ── CLI wrapper (bakes data into index.html) ───────────────────────────────
if (require.main === module) {
  const API_KEY    = process.env.SMARTSUITE_API_KEY;
  const INDEX_HTML = path.join(__dirname, 'index.html');

  if (!API_KEY) {
    console.error('Error: SMARTSUITE_API_KEY env var is required');
    process.exit(1);
  }

  fetchSmartSuiteData(API_KEY).then(result => {
    const html    = fs.readFileSync(INDEX_HTML, 'utf8');
    const appJson = JSON.stringify({ projects: result });
    const updated = html.replace(/let APP=\{projects:\[\]\};/, `let APP=${appJson};`);

    if (updated === html) {
      console.error('Could not locate data placeholder in index.html');
      process.exit(1);
    }
    fs.writeFileSync(INDEX_HTML, updated, 'utf8');
    console.log(`✓ index.html updated with ${result.length} projects`);
  }).catch(err => { console.error(err); process.exit(1); });
}
