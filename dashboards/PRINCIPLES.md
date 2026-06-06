# Stitser BUILT — Dashboard System: Foundational Principles
**Version:** 2.0  
**Date:** June 4, 2026  
**Author:** Clint Stitser  
**Location:** `/dashboards/PRINCIPLES.md` in `sb-planning-tools` repo  
**Purpose:** Define-first specification for all product-line dashboards. Claude Code builds from this. No exceptions.

> **How to use this document:** Before building or modifying any dashboard, read this document in full. Every design decision, data source, and UI pattern is governed here. The Construction dashboard (`/dashboards/construction-scorecard.html`) is the reference implementation — all new dashboards follow the patterns proven there. Deviations require Principal approval.

---

## What This Is

A unified set of non-negotiable design principles that govern every scorecard/dashboard built across the Stitser BUILT platform. Each dashboard is **organized by product line** — the type of business being conducted — listed here in build priority order:

| Priority | Product Line Dashboard | Description | Status |
|---|---|---|---|
| ① | **Construction** | Full lifecycle of construction-type projects. Reference at `/dashboards/construction-scorecard.html` | **Live** |
| ② | **Asset Disposition** | Full lifecycle of disposition-type projects | Planned |
| ③ | **Asset Management** | Stabilized assets under active management | Planned |
| ④ | **Development** | Ground-up and value-add development projects | Planned |
| ⑤ | **Brokerage** | Stand-alone brokerage activity | Planned |

**Key architectural point:** Each dashboard covers its product line **across all lifecycle stages**. The lifecycle stages (Biz Dev, Pipeline, WIP, Closeout) appear as **situations** within the dashboard — they are not separate dashboards. A project's S-BOS status determines which situation it belongs to.

Every dashboard shares the same structural DNA: 4 Core Questions, 9 Universal Principles, the 3-Bucket Score Model, Pillar Completeness, Dual Freshness Display, and weekly GYR Integration.

---

## The Hierarchy of Data

```
Product Line (e.g., Construction)
  └── Key Situation (S-BOS status stage: Biz Dev / Pipeline / WIP / Closeout)
        └── Projects (individual jobs tagged with this product type + at this stage)
              └── Project Pillars: Budget / Schedule / Checklists / Alignment
```

- **Product Line** — the business function being tracked
- **Key Situation** — the S-BOS status stage a project is currently in. Situations appear as cards on the dashboard. Each situation is independently scored. **Use S-BOS vocabulary exactly — no invented stage labels.**
- **Projects** — the individual jobs, deals, or assets belonging to that situation
- **Project Pillars** — the four named infrastructure categories: **Budget, Schedule, Checklists, Alignment**. Each contains specific record-level checks that must be in place before a project contributes to the score.

The game score rolls up from Pillars → Projects → Situations → Product Line.

**Critical:** A dashboard score is only as accurate as the pillars behind it. See **Pillar Completeness** section.

---

## The 4 Core Questions Every Dashboard Must Answer

### 1. How do you win the game?
A single, unambiguous **total target** — the number that defines a win for this period. Not a list. One headline condition.

> *Construction:* $4,500,000 Revenue at 9% GP — June 1 through December 31, 2026  
> *Disposition:* 30 homes closed — January 1 through December 31, 2026

### 2. How much time is left?
**Days remaining AND % of scoring period elapsed** — side by side. The user must feel urgency without doing math.

- Calculate from actual `startDate` and `endDate` — **no hardcoded values**
- Source: S-BOS Goals/Targets record (not hardcoded in dashboard JS — currently hardcoded in `server.js` as a temporary measure; TODO: wire to S-BOS)
- Show the scoring arc: elapsed bar, days left, projected gap, required run rate per week

### 3. What is the current score?
**The 3-Bucket Projected Score** (see full section below). Not a simple "billed to date" — a model that distinguishes hard actuals, firm estimates, and soft projections.

- Always period-specific — never cumulative project totals (see Period-Specific Scoring)
- Shows gap: `Target − Projected Score = Remaining`
- Shows implied run rate: `Remaining ÷ Days Remaining = weekly commitment needed`
- Color is **coverage-based**: Green ≥ 90% of goal covered / Yellow 75–89% / Red < 75%

### 4. How do you win the situations?
Each situation card surfaces its own score and contribution to the game total:
- **Target** — what does winning this situation look like?
- **Current** — count of jobs, period contribution (dollars)
- **Time** — how much time does this situation have left?
- **Delay cost** — for progress-billing: what does waiting one more month cost in additional jobs needed?

---

## The 3-Bucket Projected Score

**This is the core scoring model for all progress-billing dashboards. Event-based dashboards (Disposition) use a simpler model — see product line specs.**

The projected score answers the question the headline metrics never could: *not just what's been billed, but what will realistically land before the period ends.*

```
Projected Score = [A] + [B] + [C]
```

| Bucket | Name | Source | Nature |
|---|---|---|---|
| **[A]** | Billed Actuals | G-702 pay apps within scoring window | Hard — already happened |
| **[B]** | WIP Capturable | BTF × time proration to period end | Firm — in-flight, time-adjusted |
| **[C]** | Pipeline Projected | Contract value × billing fraction × confidence | Soft — probability-weighted |

### [A] — Billed Actuals
```
SUM of G-702.s0592aef02 ("Amount Due this Period")
  WHERE G-702.s0996cf591 ("Pay App Date") ∈ [period.start, period.end]
```
This is the only hard number. It requires G-702 pay applications to be linked to budget rows and submitted within the scoring window.

### [B] — WIP Capturable BTF
```
For each WIP/Closeout job:
  capturableBTF = BTF × min(1, daysUntilPeriodEnd / daysUntilProjectComplete)
```
If the project finishes before the period ends → 100% of BTF is capturable.  
If the project extends past the period end → prorate by time remaining in period vs. project.

### [C] — Pipeline Projected
**Only applies to progress-billing product lines.** For event-based (Disposition), revenue is $0 until the close event.

```
For each Pipeline or Hot job:
  pipelineProjected = contractRevenue × billingFraction × conversionRate

  billingFraction = min(1, daysRemainingInPeriod / estimatedDuration)
  conversionRate  = confidenceRating / 10  (or default: Pipeline=30%, Hot=55%)
```

**No hard deadline cutoff.** A job mobilizing November 1 still earns billing for November and December. Every day of delay costs jobs, not a hard zero. The Sep 2 mobilization deadline is a **visibility marker** for full billing — not a formula cutoff.

**What is included in [C]:**
- Active Pipeline jobs (all) — at their confidence-weighted conversion rate
- Biz Dev — Hot jobs with confidence ≥ 5/10 (≥50%) — at their confidence rate
- Biz Dev — Warm / Nurture / New Opportunity — **excluded** (too early, too speculative)

### Confidence Rating
Field: `sl14xzgf` on Projects app. Scale: **1–10** (numeric display, confirmed from live schema June 2026).

| Rating | Conversion Rate | Meaning |
|---|---|---|
| 1–4 | 10–40% | Low confidence — unlikely to convert in time |
| 5–6 | 50–60% | Moderate — include in [C] at face value |
| 7–8 | 70–80% | High confidence — strong inclusion |
| 9–10 | 90–100% | Near certain |
| 0 (unrated) | 30% (Pipeline) / 55% (Hot) default | Prompt team to rate |

**Action implication:** Unrated jobs in Pipeline or Hot stage display a "needs rating" indicator. Updating the confidence rating in S-BOS directly shifts the [C] projection.

### Monthly Ramp Plan
The production targets section uses this formula to show the **delay cost** of waiting:

```
For each remaining month M:
  billingMonths    = min(avgDuration, monthsUntilPeriodEnd from M)
  revenuePerJob    = avgMonthlyRevenue × billingMonths
  jobsNeeded       = gap ÷ revenuePerJob   (rounded up)
  costOfWaiting    = jobsNeeded - jobsNeededIfActingNow
```

Where `avgMonthlyRevenue = avgContractValue ÷ avgDurationMonths` computed from live job data.

This makes the urgency concrete and quantified: acting in July might require 2 jobs; waiting until October requires 5.

---

## Period-Specific Scoring

All financial metrics on the scoreboard reflect only activity within the scoring window. Cumulative project-to-date totals are **never used** as the headline score.

### Progress-Based Billing (Construction)
Revenue accrues daily from mobilization through period end. The correct source is G-702 pay applications:

```
Revenue this period = SUM of G-702.s0592aef02
  WHERE G-702.s0996cf591 (Pay App Date) ∈ [period.start, period.end]
```

**Wrong:** `s160aa943b` (Completed to Date from Budget Items) — cumulative, includes prior periods.

### Event-Based Billing (Asset Disposition)
Revenue is recognized on a single event (close of sale). A home that closed in Q1 contributes $0 to a Q2 score regardless of prior billing. Score = count of closes + associated revenue within the window only.

### Cumulative Fields — When Valid
Cumulative totals are valid for:
- Per-project progress % (how far along overall)
- Balance to Finish calculations
- Pillar status checks

Never as the headline game score for a period-bound dashboard.

---

## 9 Universal Design Principles

### PRINCIPLE 1 — Time-Aware Progress
Progress bars and completion percentages are anchored to each project's actual start and end date — read from S-BOS Project Dates records. No hardcoded dates. No assumptions about calendar year = scoring period.

Individual project timelines govern project cards. The product-line scoring period governs the game header only.

### PRINCIPLE 2 — Live, Automatic Scoring
The scoreboard updates automatically. No manual data entry.

- Data pulled via Railway backend (`sb-planning-tools-production.up.railway.app/api/*`) — SmartSuite API key stays server-side
- Page load + 5-minute polling interval
- "Last updated" timestamp always visible in header
- Graceful degraded state if API is unreachable
- **Kompass MCP** (`earnest-vitality-production.up.railway.app`) is Claude's agent tool server — **not a browser REST API**. Never reference it in dashboard HTML.

### PRINCIPLE 3 — Product-Line Relevant Statistics
Each product line measures what matters for its game:
- **Construction:** GP%, WIP aging, billing velocity, retention held, monthly ramp plan
- **Asset Disposition:** homes closed, commission + repair revenue, days in stage
- **Asset Management:** occupancy %, NOI, OpEx vs. budget, lease expirations
- **Brokerage:** property sales volume, commission revenue, pipeline by stage

### PRINCIPLE 4 — Snapshot Capture
Every dashboard supports point-in-time capture. Two independent outputs:

**Stats record (numeric ledger):**  
`POST /api/snapshot` — small JSON payload (metrics only, no HTML). Creates one Stats record per measurable in the Stats app (`6840927ebcfa2d2bfef039e2`). Required fields: `title` (recordtitlefield, required), `s6471266f2` (Amount, required), linked record fields as arrays. Max body: `express.json({ limit: '10mb' })`.

**HTML snapshot (human-readable):**  
Generated entirely client-side as a Blob and downloaded directly. **Not sent to the server.** This avoids body size limits that would fail on large DOM captures.

| Stats Field | Slug |
|---|---|
| Associated Goal | `sd6cc86075` (array) |
| Associated Priority | `s38ac950e1` (array) |
| Associated Project | `s5e8a7ac82` (array) |
| Begin Date | `s793df2063` |
| End Date | `sb5657209d` |
| Period Type | `sfa08338c5` (Weekly=`LGtGZ` / Monthly=`kwIw9`) |
| Amount for Period | `s6471266f2` (required) |
| Attachments | `sc05da1445` |

### PRINCIPLE 5 — Consistent Visual Grammar
All dashboards use the same zone layout:

- **Scoring arc** — days remaining, % elapsed arc bar, projected score, gap, pipeline coverage badge, run rate
- **Goal tiles** — 4 tiles: [A] Billed / [B] WIP Capturable / [C] Pipeline Projected / Projected Score
- **Deadline banners** — key deadline countdowns with urgency color
- **Situation cards** — one per S-BOS status group (Biz Dev / Pipeline / WIP / Closeout), showing count, period contribution, deadline
- **Production targets** — monthly ramp plan (progress-billing) or stage-gate targets (event-based)
- **Revenue Recognition Ledger** — filterable, sortable, groupable table with toolbar and per-group aggregate rows

**Shared components (in `dashboards/css/dashboard-shared.css` and `dashboards/js/dashboard-shared.js`):**
- CSS design tokens, progress bars, countdown badges, stage cards, ledger table, skeleton loaders
- Tooltip system: `data-tip="..."` attribute on any element + `<span class="explainer">?</span>` for click affordance
- Universal tooltip JS: **click-only** on `.explainer` badges (not hover). Popup follows cursor, stays in viewport, dismisses on click elsewhere or Escape.
- Fuzzy title search on ledger

**Color system (coverage-based):**
- Green — pipeline covers ≥ 90% of goal
- Yellow — pipeline covers 75–89% of goal (gap needs attention)
- Red — pipeline covers < 75% of goal (significant gap)
- Gray — pillar incomplete, excluded from score

Coverage = Projected Total (A+B+C) ÷ Goal. Time-aware because [B] and [C] both use
days-remaining math — the same pipeline covers less as December approaches.

### PRINCIPLE 6 — Implied Pipeline Coverage
```
Coverage % = Projected Score (A+B+C) ÷ Goal
```

This answers: "Does the current pipeline cover the goal?" Not "are we billing fast enough
right now?" Coverage is time-aware through [B] and [C]'s days-remaining formulas — no
separate time-elapsed comparison needed, and no misleading thousands-of-percent readings
early in the period.

**Do not use time-elapsed pace** for the headline G/Y/R signal. Pace = Projected ÷ (Goal × %elapsed)
produces values like 3,480% on Day 4 when projected is only 65% of goal — correct math,
completely useless signal. Coverage is the right metric.

### PRINCIPLE 7 — Role-Appropriate Visibility
Managed through Softr user group controls and separate homepages — not URL parameters or client-side logic.

- **Team homepage:** Construction, Closeout, Pipeline dashboards — no executive financials
- **Executive homepage:** All dashboards + Portfolio Planner + principal-level views
- **Current status:** Not yet implemented. Next: ① Team homepage ② Executive homepage ③ User groups ④ Control menu. Claude Code builds pages; Softr config done in Softr Studio by Andi.

### PRINCIPLE 8 — Zero Manual Scoring
If a metric requires a human to manually update a number, it must be automated or removed. Exceptions: qualitative notes, snapshot labels, confidence ratings.

The PM or Super never opens SmartSuite to update the scoreboard. Their work in S-BOS (submitting pay apps, changing project status, updating confidence ratings) **is** the update.

### PRINCIPLE 9 — Data Freshness: Dual-Source Display Per Project
Every project row displays two independent freshness indicators:

```
Budget:   [date / days ago]    ← Green ≤7d / Yellow 8–21d / Red >21d
Schedule: [date / days ago]    ← Green ≤7d / Yellow 8–21d / Red >21d
```

**Budget Freshness:**
- Primary: `s4975ef4d4` on Baseline Budget Items — formula field "Last 702/703/manual update" (confirmed field #34 in live schema)
- Fallback: `MAX(last_updated)` across all budget rows for the project (system field, always present — tells you when any budget row was last touched)

**Schedule Freshness:**
- Source: Smartsheet `modifiedAt` via `get_sheet_summary`
- Sheet ID stored on Project record: `s4ec74af74` or `sa1de44e85`
- **Status (June 2026):** Deferred — requires Smartsheet API key in Railway env vars. Column shows `—` until integrated.

---

## Pillar Completeness — Project Readiness for Scoring

**Current status (June 2026): Option B active.** Incomplete projects are displayed with ⚠️ but remain inclusive in scoring. Calendar reminder set for June 16, 2026 to activate full gating (Option A — incomplete projects excluded from score).

**Pillars-In-Place indicator on every project row:**
- ✅ All 10 checks pass — project counts toward game total
- ⚠️ One or more missing — project shown in "Pending Setup" section

The Pending Setup section is collapsible, appears above the ledger, lists each incomplete project with its missing items and a link to the S-BOS record.

### Construction — Required Pillars (10 checks)

| Pillar | Check | S-BOS Field |
|---|---|---|
| Budget — Inflow | ≥1 Budget Item (Operating Cash-Income) | CF Lookup `s40ca9cdee` = "Operating Cash-Income" |
| Budget — Outflow | ≥1 Budget Item (Operating Cash-COGS) | CF Lookup `s40ca9cdee` = "Operating Cash-COGS" |
| Budget — G-702 or Drive | G-702 linked OR Drive folder present | `sfiz2vvh` count > 0 OR `s561f1796b` populated |
| Schedule — Start | Construction Start date populated | `s7e23170f2` on Project |
| Schedule — End | Construction End date populated | `scc0298307` on Project |
| Schedule — Smartsheet | Smartsheet schedule linked | `s4ec74af74` or `sa1de44e85` on Project |
| Checklists — Drive | Google Drive folder linked | `s561f1796b` on Project |
| Checklists — Assigned | ≥1 Checklist record linked | `synemrwc` count > 0 |
| Alignment — GYR | GYR Status Report linked | `s0dm3fca` count > 0 |
| Alignment — Stakeholders | ≥4 Stakeholder Bridge records | `sw6mypea` count ≥ 4 |

**4-stakeholder floor rationale:** By WIP entry, the full cast should be in place: vendors, customers, product line leads, investors, lenders, owner/rep. Four is a minimum floor, not a role prescription.

### Biz Dev — Required Pillars

| Pillar | Check |
|---|---|
| Budget — Estimated Value | ≥1 Baseline Budget Item linked |
| Schedule — Expected Close | Expected Close date populated |
| Alignment — Stakeholders | ≥2 records: one Product Lead + one Decision-Maker/Owner/Owner's Rep |

### Pipeline — Required Pillars

| Pillar | Check |
|---|---|
| Budget — Estimated Value | ≥1 Baseline Budget Item linked |
| Budget — Estimating Package | Estimating document in Google Drive folder |
| Schedule — Deadline | Due Diligence / Estimating deadline populated |
| Alignment — Stakeholders | ≥1 record (Owner/Owner's Rep or Decision-Maker role) |

### Closeout & Warranty — Required Pillars

| Pillar | Check |
|---|---|
| Budget — Final G-702 | Final G-702 linked |
| Schedule — Substantial Completion | Substantial Completion date populated |
| Checklists — Drive | Closeout Drive folder linked |
| Checklists — Punch List | Checklist (punch list) assigned |
| Alignment — Stakeholders | ≥2 records (Warranty Admin + Occupant/Owner Contact) |

### Asset Management — Required Pillars

| Pillar | Check |
|---|---|
| Budget — NOI Target | Baseline Budget Items (NOI target) linked |
| Schedule — Lease Dates | Lease term start + end populated |
| Checklists — Drive | Asset Drive folder linked |

### Pillar Remediation

| Missing Pillar | Action |
|---|---|
| Baseline Budget Items | Auto-create via `smartsuite_create_record`, patch project link |
| Project Dates | Auto-create with known dates, patch project link |
| Stakeholder Bridge | Auto-create bridge record, patch project link |
| GYR Status Report | Auto-create initial record, patch project link |
| G-702 | Flag for PM action — cannot auto-create without billing data |
| Drive / Smartsheet link | Flag for PM action — human must supply URL/sheet ID |

---

## Weekly GYR Integration

Every product line dashboard connects to the S-BOS goal tracking system via a weekly automated CoWork plugin that creates GYR Status Report records.

**See:** `SBos-Knowledge-Base/workflows/weekly-goal-review-product-line.md` for the full workflow spec.

### How It Works
Each Monday:
- **12 PM PT** — Reminder email to product line team: complete S-BOS updates before 2 PM
- **2 PM PT** — CoWork runs the full GYR workflow:
  1. Fetch live dashboard data
  2. Compute GYR status from pipeline coverage
  3. Pull S-BOS activity from past 7 days
  4. Write Claude narrative (on track / needs attention / critical)
  5. Generate HTML snapshot
  6. Upload to Google Drive: `Goal Tracking / {Product Line} / GYR Reports /`
  7. Create GYR Status Report in SmartSuite linked to goal + priority
  8. Log to Activity Log

### GYR Status Values (SmartSuite field `s3638e84d5` and `s8ow7due`)

Status is determined by **Pipeline Coverage** = projectedTotal ÷ goal.
**Do not use time-elapsed pace** — it produces misleading readings early in the period
(e.g., 3,480% on Day 4 when the actual pipeline only covers 65% of the goal).

Coverage is time-aware: [B] and [C] both use days-remaining math, so the same pipeline
naturally covers less of the goal as December approaches.

| Coverage | Status Value | Label |
|---|---|---|
| ≥ 110% | `complete` | Exceeding Target |
| 90–109% | `backlog` | On Track |
| 75–89% | `in_progress` | At Risk |
| < 75% | `ready_for_review` | Critical |

### Construction GYR Records (live)
- Goal record: `698b7239aac6a0dc52279428` (Goals app `6824d4d1885a8769bd2dfc0d`)
- Construction priority: `698b72593f3ed73d2981c738` (Priorities app `68216f48f98789b5bb095a4b`)
- GYR Reports app: `68216f48f98789b5bb095a51`

### Key GYR Report Fields
| Field | Slug | Content |
|---|---|---|
| GYR Status | `s3638e84d5` | G/Y/R status value |
| System GYR | `s8ow7due` | Same — machine-computed |
| System GYR Evidence | `s675abeba3` | Claude-written narrative |
| System GYR Date | `se3873553c` | Today |
| Link to Goals | `sfwf9528` | Goal record (array) |
| Current Priority | `s3511304b0` | Priority record (array) |

---

## Product Line Specifications

### ① CONSTRUCTION

**Game target:** $4,500,000 revenue at 9% GP — June 1 through December 31, 2026  
**Scoring model:** Progress-based billing (revenue accrues daily)  
**Score:** [A] G-702 actuals + [B] WIP capturable BTF + [C] Pipeline projected

**S-BOS Status → Situation Mapping (use exact status slugs):**

| Status Value | S-BOS Label | Dashboard Situation | Score Role |
|---|---|---|---|
| `ready_for_review` | New Opportunity | Biz Dev | $0 in [C] |
| `complete` | Nurture | Biz Dev | $0 in [C] |
| `21c0705b-0c3b-45cd-9e93-07672fac949d` | Warm | Biz Dev | $0 in [C] |
| `fb5677b7-3e68-4705-86af-abb8745a43f7` | Hot | Biz Dev | Included in [C] if confidence ≥ 5/10 |
| `backlog` | Active in Pipeline | Pipeline | Included in [C] |
| `zOlNR` | Active in WIP | WIP | Included in [B] |
| `Swowl` | Closeout & Warranty | Closeout | Included in [B] |
| `Dio3d` | Closed Job | Closed | Historical only |
| `3ae0dcac-d82c-4171-95cd-3f40eed714d7` | Declined | **Excluded** | Hidden from dashboard |
| `41590c12-77e8-494b-878e-2dbb27012ca4` | Job Lost | **Excluded** | Hidden from dashboard |

**Multi-type project rule:**  
When a project is tagged with Construction **and** another product type (e.g., 2nd Home), filter Baseline Budget Items to rows where `s2f27d033f` (SB Company) = KCS Homes LLC (`6914fe61e127b5f69fb770da`). Single-type Construction projects use all their budget rows. Realm Constructors (entity 1200) operates under a separate product line — excluded from Construction.

**Budget data reality:**  
Financial fields on the Project record (`sce63122c3`, `s2djrcac`) are **not populated** for construction projects. Revenue/cost data lives entirely in Baseline Budget Items rows. The budget rows have a 3-state model:
- `estimate` — only `sc507e6b54` (Estimated Budget) filled
- `baseline` — `sed808550d` / `s531f1d6ab` populated (contract signed, no G-702 yet)
- `billing` — `s0f7c08530` / `s160aa943b` populated (G-702 pay apps flowing)

**Budget row contract value priority:** `s531f1d6ab` (Adjusted) → `sed808550d` (Baseline formula) → `sc507e6b54` (Estimate)

**Sub-views within Active in WIP** (drill-down, not top-level situations):
- **Billing Velocity** — G-702s submitted this period vs. target cadence
- **GP% Watch** — jobs trending below 9% GP
- **Aged WIP** — `s4975ef4d4` (last billing action) > 30 days ago

**Project measurables:**

| Measurable | Source | Period-Specific? |
|---|---|---|
| Revenue this period | G-702 `s0592aef02` filtered by pay app date | ✅ Yes |
| GP this period | Revenue × GP% or G-703 period amounts | ✅ Yes |
| Contract Revenue | Budget Items `s531f1d6ab` (Inflow rows) | No — project total |
| Contract Cost | Budget Items `s531f1d6ab` (Outflow rows) | No — project total |
| Billed to Date | G-702 `s6ce9e1881` (Completed & Stored) | No — project total |
| BTF | G-702 `sf1daf8d5a` | No — project total |
| GP% | Contract GP ÷ Contract Revenue | No — project total |
| Retention Held | G-702 `s2ce3db8ed` | No — project total |
| % Complete | Budget Items `s3636482e0` | No — project total |
| Budget Freshness | Budget Items `s4975ef4d4` (fallback: `last_updated`) | Rolling |
| Schedule Freshness | Smartsheet `modifiedAt` (deferred) | Rolling |
| Confidence Rating | Project `sl14xzgf` ÷ 10 | Per project |
| Est. Duration | Project `s399940ae0` (validate ≥ 14 days, default 90) | Per project |
| Capturable BTF | BTF × min(1, daysToEnd / daysToProjectComplete) | Derived |

**Primary data sources:**
- Projects: `68216a706900e8eaf75a05a7`
- G-702: `68a8c3d2bba73ca6e62d0cb5`
- G-703: `68db71a363e88ace0bd45439`
- Baseline Budget Items: `69bb89ebf6a195c2c73a3b3e`
- Project Dates: `69bb7d64740e0e696d88c47f`
- Stakeholder Bridge: `6996a3079f04b5f34a06ad88`

---

### ② ASSET DISPOSITION

**Game target:** Total homes closed within scoring period  
**Scoring model:** Event-based — revenue recognized on single close event only  
**Score:** Count of closes + revenue (commission + repair markup) within window

**Key distinction from Construction:** No [B] capturable BTF (progress billing does not apply). [C] pipeline estimate based on probability of close, not billing fraction. A home under contract either closes in the period or it doesn't — no proration.

**Situations:** Biz Dev → Referral Secured → Contract Signed → Active Listing → Under Contract → Closed

*(Full spec to be completed when dashboard is built)*

---

### ③ ASSET MANAGEMENT

**Game target:** Portfolio NOI target for the period  
**Scoring model:** Periodic — NOI recognized monthly  
**Situations:** Occupancy / Rent Collection / Lease Expirations / CapEx / OpEx

*(Full spec to be completed when dashboard is built)*

---

### ④ DEVELOPMENT

*(To be specified when dashboard is built)*

---

### ⑤ BROKERAGE

*(To be specified when dashboard is built)*

---

## Data Architecture

### Server Architecture
- **Railway planning tools backend** (`sb-planning-tools-production.up.railway.app`) — serves all dashboard HTML + `/api/*` endpoints
- **SmartSuite API key** in Railway env vars — never exposed to browser
- **Server fetches from SmartSuite**, applies filtering/aggregation, returns lean JSON
- **5-minute stale-while-revalidate cache** — dashboard gets data instantly, background refresh keeps it fresh
- **Kompass MCP** (`earnest-vitality-production.up.railway.app`) — Claude's agent tool server. **Not a browser REST API. Never use in dashboard HTML.**

### Construction API Endpoint
```
GET /api/construction-data

Response:
{
  projects: [...],                     // annotated project records
  scoringPeriod: { start, end, label },
  periodRevenue: number,               // bucketA (legacy compat)
  score: {
    bucketA: number,                   // [A] G-702 actuals in period
    bucketB: number,                   // [B] WIP capturable BTF
    bucketC: number,                   // [C] Pipeline projected
    projectedTotal: number             // A + B + C
  },
  lastUpdated: ISO string,
  stale: boolean
}
```

### Data Sources by Dashboard
| Dashboard | Primary App | Supporting Apps |
|---|---|---|
| Construction | Projects + G-702 + Budget Items | G-703, Project Dates, Stakeholder Bridge |
| Asset Disposition | Projects | Budget Items, Stakeholder Bridge |
| Asset Management | Projects | Budget Items, Loans (`69aba52da3fa0e7ebb7424f7`) |
| Development | Projects | Budget Items, G-702, Project Dates |
| Brokerage | Projects | Stakeholder Bridge, Budget Items |

### Snapshot Architecture (correct implementation)
```
Client side (no server needed):
  1. Dashboard computes current state from _projects and _score
  2. Generates clean HTML string (structured report, not DOM capture)
  3. Creates Blob → <a download> → file downloads to user's machine

Server side (small POST, no HTML in body):
  POST /api/snapshot  { dashboardType, periodStart, periodEnd, metrics[] }
    express.json({ limit: '10mb' })   ← increased from 100KB default
    → Create Stats records (one per measurable, title field required)
    → Return: { ok, statsRecordsCreated }
```

**Stats record requirements:**
- `title` is a required `recordtitlefield` — must be set. Format: `"{periodCode}-{label}"`
- Linked record fields (`sd6cc86075`, `s38ac950e1`, `s5e8a7ac82`) must be arrays: `["id"]` not `"id"`
- `s6471266f2` (Amount for Period) is required — never pass null

---

## Scoring Period Configuration

**Current (June 2026):** Hardcoded in `server.js` as `SCORING_PERIOD = { start: 2026-06-01, end: 2026-12-31 }`.

**TODO:** Source from S-BOS Goals/Targets record so non-developers can update it. Calendar reminder set June 16, 2026 to also activate full pillar gating (Option A).

When a new scoring period begins: update the two date constants in `server.js` and redeploy to Railway. All date math in both server and dashboard is dynamic from those constants — no other changes needed.

---

## Version History

| Version | Date | Notes |
|---|---|---|
| 1.0 | June 1, 2026 | Initial definition |
| 1.1 | June 1, 2026 | Project hierarchy; async update handling; Stats ledger; field map; write/read patterns |
| 1.2 | June 1, 2026 | Principle 9 (Dual-Source Freshness); Pillar Completeness; gray color state; Pillar Matrix reference |
| 1.3 | June 2, 2026 | Pipeline as separate product line; build priority order; Pillar categories; Yellow color; Principle 7 (Softr); Principle 9 rewritten; Snapshot Layer 2 HTML; Construction budget classification note; Asset Management OpEx |
| 1.4 | June 2, 2026 | Construction WIP: 4-minimum Stakeholder Bridge; Biz Dev: 2 records; Closeout & Warranty alignment added |
| 1.5 | June 2, 2026 | Placed in repo. Fixed dashboard scope (product-line-based). Fixed Construction situations (S-BOS labels). Period-Specific Scoring section. API architecture correction. Sub-views within WIP. Multi-type project rule. `s4975ef4d4` confirmed. |
| 2.0 | June 4, 2026 | **Major update incorporating full Construction dashboard build.** Added: 3-Bucket Projected Score model ([A]/[B]/[C]) as core scoring framework. Progress-based vs. event-based billing distinction. Confidence Rating (`sl14xzgf`, 1–10 scale, confirmed) with inclusion rules for Hot/Pipeline. No hard deadline cutoff — continuous billing proration. Monthly Ramp Plan for production targets. Full S-BOS status slug map for Construction. Budget data reality (project-level financial fields unpopulated; data in Budget rows). Budget 3-state model (estimate/baseline/billing). Pillar Option B active (display-only until June 16). Budget freshness fallback (`last_updated`). Snapshot architecture corrected (HTML = client-side Blob; Stats = separate small POST; `express.json` limit = 10mb; linked fields must be arrays; `title` required). Tooltip system (click-only on `.explainer`). Weekly GYR Integration section. GYR status values, field slugs, Construction goal/priority record IDs. Construction API response shape documented. Scoring period configuration note. Disposition confirmed as event-based (no proration). |
