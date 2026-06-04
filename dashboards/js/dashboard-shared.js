/* ── Stitser BUILT — Dashboard Shared Utilities ─────────────────────── */
'use strict';

// ── Constants ──────────────────────────────────────────────────────────────
// Data comes from the local planning-tools Railway backend (same origin).
// No external proxy needed — server.js fetches SmartSuite server-side.
const API_BASE = ''; // same-origin: /api/dashboard-projects
const PROJECTS_APP_ID = '68216a706900e8eaf75a05a7'; // kept for reference

// Product Type record IDs
const PRODUCT_TYPE_IDS = {
  DISPOSITION_CM:   '6a0629f81c9e28015cf0e856',  // Turnkey Disposition Services (CM & Brokerage)
  DISPOSITION_ONLY: '6a0655d2d3d9287b9a07591b',  // Turnkey Disposition Services (Brokerage Only)
  CONSTRUCTION_3P:  '6a0629f81c9e28015cf0e85b',  // 3rd party GC-Precon & Construct
};

// Field slugs (confirmed from live SmartSuite schema)
const F = {
  TITLE:          'title',
  STATUS:         'status',
  PROJECT_TYPE:   's4687ad08c',   // linkedrecordfield → Project Type
  PIPELINE_DATE:  'sfa6ec0fec',   // Date ACTUALLY Sent To Pipeline (S2 entry)
  AWARD_DATE:     's8227b8fc4',   // Date Project Awarded (S3a entry / bid award)
  WIP_DATE:       's7e23170f2',   // Date Formally Transferred to WIP (S3b / mobilization)
  OUT_WIP_DATE:   's695a5c195',   // Date Formally Out of WIP (S4 / completion)
  EST_CLOSE_DATE: 'secceac461',   // Estimated Sale/Refi COE Date
  ACT_CLOSE_DATE: 's17kv07k',     // Actual Sale/Refi COE Date (closed)
  BTF_REVENUE:    'sce63122c3',   // BTF-Revenue (contract/total revenue)
  BTF_GP:         's2djrcac',     // BTF-GP (gross profit)
  EST_GP:         'sd22575e83',   // Estimated Project GP
  BASE_GP:        'svs6xrqj',     // Baseline Project GP
  OWNERS:         'sacaa33d0f',   // Project Owners
  PROJ_NUM:       's5efff6ee9',   // Project number/ID
};

const YEAR_END = new Date('2026-12-31T23:59:59');

const CONSTANTS = {
  TODAY: new Date(),
  YEAR_END,
  get DAYS_REMAINING() {
    return Math.max(0, Math.ceil((YEAR_END - new Date()) / (1000 * 60 * 60 * 24)));
  },

  DISPOSITION: {
    GOAL_HOMES: 30,
    GOAL_REVENUE: 937500,
    GOAL_GP: 457500,
    GOAL_ASSETS_SOLD: 13500000,
    REV_PER_HOME: 31250,
    GP_PER_HOME: 15250,
    ASSET_VALUE_PER_HOME: 450000,
    REQUIRED_PACE_PER_MONTH: 4.1,

    STAGE_DEADLINES: {
      S2:  new Date('2026-08-03'),
      S3A: new Date('2026-09-02'),
      S3B: new Date('2026-10-02'),
      S4:  new Date('2026-11-16'),
    },
    OWNER: 'Kaylee',
  },

  CONSTRUCTION: {
    GOAL_REVENUE: 4500000,
    GOAL_GP: 405000,
    GP_RATE: 0.09,
    AVG_JOB_SIZE: 750000,
    JOBS_NEEDED: 6,
    BILLING_RATE_PER_MONTH: 250000,

    STAGE_DEADLINES: {
      S2_BID_READY: new Date('2026-07-04'),
      S3_MOBILIZE:  new Date('2026-09-02'),
      S4_CLOSEOUT:  new Date('2026-12-01'),
    },
    OWNER: 'Key Clients / Clint',
  },
};

// ── Date Utilities ──────────────────────────────────────────────────────────
function parseDate(dateObj) {
  if (!dateObj || !dateObj.date) return null;
  return new Date(dateObj.date);
}

function daysRemaining(deadline) {
  return Math.ceil((new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24));
}

function daysAgo(dateObj) {
  const d = parseDate(dateObj);
  if (!d) return null;
  return Math.floor((new Date() - d) / (1000 * 60 * 60 * 24));
}

function formatDate(dateObj) {
  const d = parseDate(dateObj);
  if (!d) return '--';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateShort(dateObj) {
  const d = parseDate(dateObj);
  if (!d) return '--';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isIn2026(dateObj) {
  const d = parseDate(dateObj);
  return d && d.getFullYear() === 2026;
}

// ── Formatting Utilities ────────────────────────────────────────────────────
function fmtMoney(val, compact = false) {
  if (val == null || val === 0) return '$0';
  if (compact) {
    if (Math.abs(val) >= 1_000_000) return '$' + (val / 1_000_000).toFixed(1) + 'M';
    if (Math.abs(val) >= 1_000)     return '$' + (val / 1_000).toFixed(0) + 'K';
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}

function fmtPct(num, denom) {
  if (!denom || denom === 0) return '0%';
  return Math.round((num / denom) * 100) + '%';
}

// ── Urgency Logic ───────────────────────────────────────────────────────────
function urgencyColor(days) {
  if (days == null) return 'var(--status-gray)';
  if (days > 60)  return 'var(--status-green)';
  if (days >= 30) return 'var(--status-yellow)';
  return 'var(--status-red)';
}

function urgencyLabel(days) {
  if (days == null) return 'No Deadline';
  if (days < 0)   return 'OVERDUE';
  if (days > 60)  return 'On Track';
  if (days >= 30) return 'Watch';
  return 'Critical';
}

function urgencyClass(days) {
  if (days == null || days < 0) return 'expired';
  if (days > 60)  return 'on-track';
  if (days >= 30) return 'watch';
  return 'urgent';
}

function urgencyChipClass(days) {
  if (days == null || days < 0) return 'chip chip-gray';
  if (days > 60)  return 'chip chip-green';
  if (days >= 30) return 'chip chip-yellow';
  return 'chip chip-red';
}

// ── Progress Bar ────────────────────────────────────────────────────────────
function renderProgressBar(pct, color) {
  const clampedPct = Math.min(Math.max(pct, 0), 100);
  return `
    <div class="progress-track">
      <div class="progress-fill" style="width:${clampedPct}%;background:${color || urgencyColor(100)}"></div>
    </div>
    <div class="db-tile-pct">${clampedPct.toFixed(0)}% to goal</div>
  `;
}

// ── Countdown Badge ─────────────────────────────────────────────────────────
function renderCountdown(deadline, label) {
  const days = daysRemaining(deadline);
  const color = urgencyColor(days);
  const displayDays = days < 0 ? 'PAST' : days;
  return `
    <div class="countdown-badge" style="border-color:${color}">
      <span class="countdown-days" style="color:${color}">${displayDays}</span>
      <span class="countdown-label">${label}</span>
    </div>
  `;
}

// ── Stage Inference — Disposition ───────────────────────────────────────────
/*
 * Infers the current pipeline situation for a Disposition project.
 * Returns: { id, label, sublabel, stageDeadline }
 *
 * S5 — Closed        : Actual COE date filled (s17kv07k)
 * S4 — Under Contract: Estimated COE OR Out-of-WIP filled, not yet closed
 * S3b— Active Listing: Transferred to WIP, not yet out
 * S3a— Contract Signed: Awarded, not yet in WIP
 * S2 — Referral Secured: In pipeline, not yet awarded
 * S1 — Biz Dev       : No dates filled
 */
function inferDispositionStage(p) {
  const D = CONSTANTS.DISPOSITION.STAGE_DEADLINES;
  if (parseDate(p[F.ACT_CLOSE_DATE])) {
    return { id: 'S5', label: 'S5 — Closed', sublabel: 'Actual COE', stageDeadline: null, color: 'var(--status-gray)' };
  }
  if (parseDate(p[F.OUT_WIP_DATE]) || parseDate(p[F.EST_CLOSE_DATE])) {
    return { id: 'S4', label: 'S4 — Under Contract', sublabel: 'Est. Close Set', stageDeadline: D.S4, color: 'var(--status-blue)' };
  }
  if (parseDate(p[F.WIP_DATE])) {
    return { id: 'S3B', label: 'S3b — Active Listing', sublabel: 'Listed / In WIP', stageDeadline: D.S3B, color: 'var(--sb-gold)' };
  }
  if (parseDate(p[F.AWARD_DATE])) {
    return { id: 'S3A', label: 'S3a — Contract Signed', sublabel: 'Listing Contract', stageDeadline: D.S3A, color: 'var(--status-yellow)' };
  }
  if (parseDate(p[F.PIPELINE_DATE])) {
    return { id: 'S2', label: 'S2 — Referral Secured', sublabel: 'In Pipeline', stageDeadline: D.S2, color: 'var(--status-green)' };
  }
  return { id: 'S1', label: 'S1 — Biz Dev', sublabel: 'Nurturing', stageDeadline: null, color: 'var(--text-muted)' };
}

// ── Stage Inference — 3P Construction ──────────────────────────────────────
/*
 * S4 — Closeout    : Out-of-WIP filled, not yet closed
 * S3 — WIP         : In WIP date filled, not out
 * S2 — Bidding     : In pipeline (or awarded), not in WIP yet
 * S1 — Biz Dev     : No pipeline date
 * Closed           : Actual close date filled
 */
function inferConstructionStage(p) {
  const D = CONSTANTS.CONSTRUCTION.STAGE_DEADLINES;
  if (parseDate(p[F.ACT_CLOSE_DATE])) {
    return { id: 'CLOSED', label: 'Closed', sublabel: 'Final billing done', stageDeadline: null, color: 'var(--status-gray)' };
  }
  if (parseDate(p[F.OUT_WIP_DATE])) {
    return { id: 'S4', label: 'S4 — Closeout', sublabel: 'Final billing', stageDeadline: D.S4_CLOSEOUT, color: 'var(--status-blue)' };
  }
  if (parseDate(p[F.WIP_DATE])) {
    return { id: 'S3', label: 'S3 — In Progress', sublabel: 'Construction / WIP', stageDeadline: D.S3_MOBILIZE, color: 'var(--sb-gold)' };
  }
  if (parseDate(p[F.AWARD_DATE]) || parseDate(p[F.PIPELINE_DATE])) {
    return { id: 'S2', label: 'S2 — Bidding', sublabel: 'Bid / Award pending', stageDeadline: D.S2_BID_READY, color: 'var(--status-green)' };
  }
  return { id: 'S1', label: 'S1 — Biz Dev', sublabel: 'Relationship stage', stageDeadline: null, color: 'var(--text-muted)' };
}

// ── Financial Helpers ───────────────────────────────────────────────────────
function getRevenue(p) {
  return p[F.BTF_REVENUE] || p[F.EST_GP] || 0;
}

function getGP(p) {
  return p[F.BTF_GP] || p[F.EST_GP] || p[F.BASE_GP] || 0;
}

// Construction: prorate how much revenue is capturable in 2026 from an in-flight S3 job
function prorateCapturable(p) {
  const mobilizeDate = parseDate(p[F.WIP_DATE]);
  if (!mobilizeDate) return { rev: 0, gp: 0, fullBills: 'N/A' };

  const contractValue = getRevenue(p);
  const stage = inferConstructionStage(p);

  if (stage.id === 'CLOSED') {
    return { rev: contractValue, gp: contractValue * CONSTANTS.CONSTRUCTION.GP_RATE, fullBills: 'Closed' };
  }
  if (stage.id === 'S4') {
    // In closeout — most revenue should be billed
    return { rev: contractValue * 0.95, gp: contractValue * 0.95 * CONSTANTS.CONSTRUCTION.GP_RATE, fullBills: 'Yes' };
  }
  if (stage.id === 'S3') {
    const daysInS3 = Math.max(0, Math.floor((new Date() - mobilizeDate) / (1000 * 60 * 60 * 24)));
    const S3_DAYS = 90;
    const daysRemS3 = Math.max(0, S3_DAYS - daysInS3);
    // How many days of S3 are left before year end?
    const yearEndDays = daysRemaining(YEAR_END);
    const daysUsable = Math.min(daysRemS3, yearEndDays);
    const pctRemaining = daysRemS3 > 0 ? daysUsable / S3_DAYS : 0;
    const rev = contractValue * pctRemaining;
    const gp = rev * CONSTANTS.CONSTRUCTION.GP_RATE;
    const closeDate = new Date(mobilizeDate.getTime() + (S3_DAYS + 30) * 86400000); // S3+S4 = ~120 days
    const fullBills = closeDate <= YEAR_END ? 'Yes' : (rev > 0 ? 'Partial' : 'No');
    return { rev, gp, fullBills, daysInS3, daysRemS3 };
  }
  if (stage.id === 'S2') {
    // Must mobilize before Sep 2 to generate any 2026 revenue
    const deadlineDays = daysRemaining(CONSTANTS.CONSTRUCTION.STAGE_DEADLINES.S3_MOBILIZE);
    if (deadlineDays <= 0) {
      return { rev: 0, gp: 0, fullBills: 'No — window closed' };
    }
    // Assume mobilize immediately — prorate S3+S4 against year end
    const assumedMobilize = new Date();
    const assumedComplete = new Date(assumedMobilize.getTime() + 120 * 86400000);
    const fullBills = assumedComplete <= YEAR_END ? 'Yes (if awarded now)' : 'Partial';
    const daysRem = Math.min(120, daysRemaining(YEAR_END));
    const rev = contractValue * (daysRem / 120);
    return { rev, gp: rev * CONSTANTS.CONSTRUCTION.GP_RATE, fullBills };
  }
  return { rev: 0, gp: 0, fullBills: 'No' };
}

// ── Data Fetch — local Planning Tools backend ────────────────────────────────
// Server-side SmartSuite proxy at /api/dashboard-projects?type=disposition|construction
// Returns pre-filtered records; server handles auth + caching.

async function fetchProjectsByType(type, force = false) {
  const url = `/api/dashboard-projects?type=${type}${force ? '&force=true' : ''}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.items || [];
}

// Legacy compat — kept so existing dashboard code that calls fetchAllProjects still works
// Pass type as second arg for filtered fetch; omit for all projects.
async function fetchAllProjects(force = false, type = null) {
  if (type) return fetchProjectsByType(type, force);
  const url = `/api/dashboard-projects${force ? '?force=true' : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  return data.items || [];
}

function filterByProductType(projects, typeIds) {
  // When using fetchProjectsByType the server already filtered, but keep this
  // as a safety net in case fetchAllProjects is called without a type.
  return projects.filter(p => {
    const types = p[F.PROJECT_TYPE] || [];
    return typeIds.some(id => types.includes(id));
  });
}

// ── Skeleton Screens ─────────────────────────────────────────────────────────
function skeletonTiles(n = 4) {
  return Array(n).fill('<div class="skeleton skeleton-tile"></div>').join('');
}

function skeletonRows(n = 6) {
  return Array(n).fill('<div class="skeleton skeleton-row"></div>').join('');
}

// ── Last Updated Timestamp ───────────────────────────────────────────────────
function setLastUpdated(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const now = new Date();
  el.textContent = 'Updated ' + now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ── Auto-refresh ─────────────────────────────────────────────────────────────
function startAutoRefresh(refreshFn, intervalMs = 5 * 60 * 1000) {
  setInterval(() => refreshFn(true), intervalMs);
}

// ── Universal Tooltip System ──────────────────────────────────────────────────
// Tooltips are CLICK-triggered on .explainer (?) badge elements only.
// Click the ? to show — click ? again or anywhere else to dismiss.
// No hover sensitivity.
//
// Usage: add data-tip="Explanation\nLine 2" to any ancestor element,
// then place <span class="explainer">?</span> inside it as the click target.
// The popup reads data-tip from the nearest ancestor with that attribute.
//
// Safe to call from multiple dashboards — guards against double-init.
(function initTooltips() {
  if (window.__tipsInited) return;
  window.__tipsInited = true;

  const tip = document.createElement('div');
  tip.className = 'tip-popup';
  tip.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tip);

  let activeExplainer = null;

  function showAt(explainerEl, clientX, clientY) {
    const container = explainerEl.closest('[data-tip]');
    const text = container?.dataset.tip || explainerEl.dataset.tip || '';
    if (!text) return;

    tip.innerHTML = text.replace(/\n/g, '<br>');
    tip.style.display = 'block';
    activeExplainer = explainerEl;

    // Position: avoid viewport edges; flip above cursor if near bottom
    requestAnimationFrame(() => {
      const w  = tip.offsetWidth  || 280;
      const h  = tip.offsetHeight || 60;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const left = Math.min(clientX + 12, vw - w - 12);
      const top  = (clientY + h + 20 > vh) ? clientY - h - 8 : clientY + 14;
      tip.style.left = Math.max(8, left) + 'px';
      tip.style.top  = Math.max(8, top)  + 'px';
    });
  }

  function hide() {
    tip.style.display = 'none';
    activeExplainer = null;
  }

  // Click on .explainer → toggle
  document.addEventListener('click', e => {
    const explainer = e.target.closest('.explainer');
    if (explainer) {
      e.stopPropagation();
      if (activeExplainer === explainer) {
        hide();
      } else {
        showAt(explainer, e.clientX, e.clientY);
      }
      return;
    }
    // Click anywhere else (not inside the tip itself) → dismiss
    if (activeExplainer && !e.target.closest('.tip-popup')) {
      hide();
    }
  });

  // Escape key dismisses
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') hide();
  });
})();
