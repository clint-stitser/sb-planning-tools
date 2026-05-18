'use strict';
require('dotenv').config();

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { fetchSmartSuiteData } = require('./refresh-data');

const app     = express();
const PORT    = process.env.PORT || 3000;
const API_KEY = process.env.SMARTSUITE_API_KEY;

if (!API_KEY) {
  console.error('Error: SMARTSUITE_API_KEY is not set. Add it to .env or your environment.');
  process.exit(1);
}

// ── In-memory cache ────────────────────────────────────────────────────────
let cache        = null;
let cacheTime    = null;
let fetchPromise = null;
const CACHE_TTL  = 30 * 60 * 1000; // 30 minutes

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

// POST /api/entity-reporting/config   — save entity list + due-day settings
app.post('/api/entity-reporting/config', express.json(), (req, res) => {
  const { entities } = req.body || {};
  if (!Array.isArray(entities)) return res.status(400).json({ error: 'entities array required' });
  const data = loadReporting();
  data.config.entities = entities;
  saveReporting(data);
  res.json({ ok: true });
});

// ── Routes ─────────────────────────────────────────────────────────────────
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
