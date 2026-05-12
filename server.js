'use strict';
require('dotenv').config();

const express = require('express');
const path    = require('path');
const { fetchSmartSuiteData } = require('./refresh-data');

const app     = express();
const PORT    = process.env.PORT || 3000;
const API_KEY = process.env.SMARTSUITE_API_KEY;

console.log('ENV KEYS:', Object.keys(process.env).filter(k => !k.includes('npm')).join(', '));
console.log('SMARTSUITE_API_KEY present:', !!API_KEY);

if (!API_KEY) {
  console.error('Error: SMARTSUITE_API_KEY is not set. Add it to .env or your environment.');
  process.exit(1);
}

// ── In-memory cache ────────────────────────────────────────────────────────
let cache        = null;
let cacheTime    = null;
let fetchPromise = null;
const CACHE_TTL  = 5 * 60 * 1000; // 5 minutes

async function getData(force) {
  const now = Date.now();
  if (!force && cache && cacheTime && (now - cacheTime) < CACHE_TTL) {
    return { projects: cache, lastUpdated: new Date(cacheTime).toISOString(), cached: true };
  }
  // Deduplicate concurrent requests — only one SmartSuite fetch at a time
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
  const projects = await fetchPromise;
  return { projects, lastUpdated: new Date(cacheTime).toISOString(), cached: false };
}

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
  // Warm the cache on startup
  getData(false).catch(err => console.error('Startup cache warm failed:', err.message));
});
