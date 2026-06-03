# Stitser BUILT — Dashboard System: Foundational Principles
**Version:** 1.5  
**Date:** June 2, 2026  
**Author:** Clint Stitser  
**Location:** `/dashboards/PRINCIPLES.md` in `sb-planning-tools` repo  
**Purpose:** Define-first specification for all product-line dashboards. Claude Code builds from this. No exceptions.

> **How to use this document:** Before building or modifying any dashboard, read this document in full. Every design decision, data source, and UI pattern is governed here. Deviations require Principal approval.

---

## What This Is

A unified set of non-negotiable design principles that govern every scorecard/dashboard built across the Stitser BUILT platform. Each dashboard is **organized by product line** — the type of business being conducted — listed here in build priority order:

| Priority | Product Line Dashboard | Description | Status |
|---|---|---|---|
| ① | **Construction** | Full lifecycle of construction-type projects. Reference implementation at `/dashboards/construction-scorecard.html` | **Live** |
| ② | **Asset Disposition** | Full lifecycle of disposition-type projects | Planned |
| ③ | **Asset Management** | Stabilized assets under active management | Planned |
| ④ | **Development** | Ground-up and value-add development projects | Planned |
| ⑤ | **Brokerage** | Stand-alone brokerage activity | Planned |

**Key architectural point:** Each dashboard covers its product line **across all lifecycle stages**. The lifecycle stages (Biz Dev, Pipeline, WIP, Closeout) appear as **situations** within the dashboard — they are not separate dashboards. A project's S-BOS status determines which situation it belongs to on a given dashboard.

Every dashboard shares the same structural DNA: 4 Core Questions, 9 Universal Principles, Pillar Completeness, and Dual Freshness Display.

---

## The Hierarchy of Data

Every dashboard is organized by this four-level hierarchy. Build the data model and UI to reflect it.

```
Product Line (e.g., Construction)
  └── Key Situation (S-BOS status stage: Biz Dev / Pipeline / WIP / Closeout)
        └── Projects (individual jobs tagged with this product type + at this stage)
              └── Project Pillars: Budget / Schedule / Checklists / Alignment
```

- **Product Line** — the business function being tracked (Construction, Disposition, Asset Management, etc.)
- **Key Situation** — the S-BOS status stage a project is currently in. Situations are the lifecycle stages of that product line; they appear as cards on the dashboard. Each situation is independently scored.
- **Projects** — the individual jobs, deals, or assets that belong to that situation
- **Project Pillars** — the four named infrastructure categories: **Budget, Schedule, Checklists, Alignment**. Each pillar contains specific record-level checks that must be in place before a project contributes to the score.

The game score rolls up from Pillars → Projects → Situations → Product Line. Each level is independently visible on the dashboard.

**Critical:** A dashboard score is only as accurate as the pillars behind it. Before any project contributes to the game score, its pillars must be verified as complete. See **Pillar Completeness** section below.

---

## The 4 Core Questions Every Dashboard Must Answer

These are the universal truths. Every dashboard answers all four, always visible, at a glance.

### 1. How do you win the game?
Every dashboard must show a single, unambiguous **total target** — the number, outcome, or condition that defines a win for this period. Not a list of goals. One headline game-winning condition.

> *Construction example:* $4,500,000 Revenue at 9% GP — June 1 through December 31, 2026  
> *Asset Disposition example:* 30 homes closed — January 1 through December 31, 2026

### 2. How much time is left?
Every dashboard must display **time remaining** in context — not just a date, but a sense of where we are in the arc. Days remaining AND % of scoring period elapsed. The user should be able to feel the urgency without doing math.

- Show: days remaining AND % of period elapsed side by side
- Calculate from actual scoring period `startDate` and `endDate` — **no hardcoded values**
- If the start date is in the past and the end date is in the future, the system auto-positions itself correctly
- Source for scoring period dates: S-BOS Goals/Targets record (not hardcoded in dashboard JS)

### 3. What is the current score?
**Progress within the scoring period** expressed in the same unit as the target.

- Current score is always live (pulled from S-BOS data — not manually entered)
- **Period-specific, not cumulative:** Score reflects only activity that occurred within the scoring window (start date to end date). A project that billed revenue in Q1 does not contribute that Q1 revenue to a Q2 score. See **Period-Specific Scoring** below.
- Must show the gap: `Target − Current Score = Remaining`
- Must show implied run rate: `Remaining ÷ Days Remaining = Daily/Weekly pace required to win`
- **Only projects with all pillars in place contribute to the aggregate score.** Projects with incomplete pillars are displayed separately as "Pending Setup" and excluded from the game total until resolved.

### 4. How do you win the situations?
Below the headline game score, each dashboard surfaces **situation-level scores** — the sub-components that, when won together, add up to winning the game. Each situation card displays:

- **Target** — what does winning this situation look like?
- **Current score** — where are we right now?
- **Time** — how much time does this situation have left?
- **Remaining** — what's still needed?

Situations are product-line specific (see Product Line Specifications section below).

---

## Period-Specific Scoring

**This principle governs all revenue and financial metrics on every dashboard.**

A scoring period is a defined date window (e.g., June 1 – December 31, 2026). All financial metrics on the scoreboard reflect only activity that occurred within this window. Cumulative project-to-date totals are **never used** as the headline score unless the project's entire life falls within the scoring period.

### Construction Revenue — How to Calculate

**Wrong:** Using `s160aa943b` (Completed to Date) from Baseline Budget Items. This is a cumulative total from the first day of the project — it includes all prior periods.

**Correct:** Using G-702 pay applications filtered by date.

```
Revenue this period = SUM of G-702.s0592aef02 ("Amount Due this Period")
  WHERE G-702.s0996cf591 ("Pay App Date") ∈ [scoringPeriod.start, scoringPeriod.end]
  AND G-702 is linked to a Construction-type project

GP this period = Revenue this period × project GP% (from G-703 line items)
  OR = Revenue this period − COGS this period (if COGS tracked separately by period)
```

**Key G-702 fields (app: `68a8c3d2bba73ca6e62d0cb5`):**
| Field | Slug | Use |
|---|---|---|
| Amount Due this Period | `s0592aef02` | Revenue billed on THIS pay application |
| Pay App Date | `s0996cf591` | Date filter — must fall within scoring window |
| Completed & Stored to Date | `s6ce9e1881` | Cumulative — use for project-level progress % only |
| Net Change by Change Orders | `s5a0e0a7b0` | Change order delta on this pay app |
| Total Retention Held | `s2ce3db8ed` | Retention held as of this pay app |
| Balance to Finish | `sf1daf8d5a` | Remaining contract value from G-702 perspective |
| Previously Completed | `sc73a3aabe` | Prior-period cumulative — use to understand starting point only |
| Project (link) | `s12698a7c3` | Join to Projects app |

### Cumulative Fields — When to Use Them
Cumulative totals (`s160aa943b`, `s0f7c08530` from Budget Items, `s6ce9e1881` from G-702) are valid for:
- Project-level progress % (how far along is this project overall)
- Balance to Finish calculations
- Per-project pillar status checks

They are **not valid** as the headline game score metric for any period-bound dashboard.

---

## 9 Universal Design Principles

### PRINCIPLE 1 — Time-Aware Progress
Progress bars and completion percentages must be **anchored to each project's actual start date and end date.** The system reads these dates per project from S-BOS and calculates elapsed/remaining dynamically.

Projects have independent timelines. A project that started February 1 and ends December 31 is evaluated against its own arc — not the product-line scoring period. The product-line scoring period governs the game header. Individual project timelines govern each project card.

**Implementation requirement:** All date math uses configurable `startDate` and `endDate` sourced from S-BOS Project Dates records (`69bb7d64740e0e696d88c47f`). No hardcoded dates. No assumptions about calendar year = scoring period.

### PRINCIPLE 2 — Live, Automatic Scoring
The scoreboard must **update automatically.** No manual data entry to update the score. No friction in counting. A scoreboard that requires human updates will be abandoned.

- Data pulled from S-BOS / SmartSuite via the Railway backend (`/api/construction-data` or equivalent per product line). The Railway server calls SmartSuite server-side using the API key stored in Railway environment variables — never exposed to the browser.
- Refresh triggers: on page load + configurable polling interval (default: every 5 minutes)
- Every dashboard shows a "last updated" timestamp at the header level
- Every project card shows its own **dual data freshness display** — Budget and Schedule freshness shown separately (see Principle 9)
- If the API is unreachable, show a graceful degraded state with the timestamp of last successful data pull

**Note on API architecture:** The Kompass MCP server (`earnest-vitality-production.up.railway.app`) is Claude's agent tool server — it is not a browser-callable REST API and must not be referenced as a data endpoint in dashboard HTML. All browser-facing data calls go to the Railway planning tools backend (`sb-planning-tools-production.up.railway.app`).

**Handling asynchronous project updates:** Projects update on their own schedules. The dashboard scores each project against its most recent available data. The aggregate score is the honest sum of the most recent data per project — not a stale consolidated total.

### PRINCIPLE 3 — Product-Line Relevant Statistics
Each product line measures what actually matters for **that game** — not a generic financial summary.

- Construction measures GP%, WIP aging, billing velocity, retention held
- Asset Disposition measures homes closed, revenue earned (commission + repair markup), days in stage
- Asset Management measures occupancy, NOI, OpEx vs. budget, lease expirations
- Brokerage measures property sales volume, commission revenue, pipeline by stage

See Product Line Specifications below for the full stat sheet per line.

### PRINCIPLE 4 — Snapshot Capture (Point-in-Time Record)
Every dashboard must support being **frozen at a point in time** via a "Capture Snapshot" button.

**Layer 1 — Stats Table as the Numeric Ledger** (`6840927ebcfa2d2bfef039e2`)  
The Stats table stores one record per measurable per reporting period. This is the machine-readable time-indexed ledger used to render trend lines in the History view. Do NOT create a separate snapshots table.

**Layer 2 — HTML Snapshot File for Human-Readable History**  
On "Capture Snapshot," the dashboard also generates a static `.html` file — a complete visual render of the dashboard state at that moment. This file:
- Is named: `snapshot-[dashboard-type]-[YYYY-MM-DD]-[period-code].html`
- Is stored in the project's linked Google Drive `/snapshots/` subfolder
- Can be opened by any team member in a browser — no login, no API dependency
- The Drive file link is written back to the master Stats record (`sc05da1445` Attachments field)

**Snapshot workflow (on button click):**
1. Dashboard computes current state across all projects and situations
2. One Stats record written per measurable per situation
3. Each Stats record tagged with: period code, begin/end date, amount, measure type, Goal link, Project link (`s5e8a7ac82`)
4. Static HTML file generated and uploaded to Google Drive
5. Drive link written back to master Stats record
6. Dashboard confirms: "Snapshot captured — W22, June 2, 2026 · [View Snapshot]"

**Stats record field map:**
| Field | Slug |
|---|---|
| Associated Goal | `sd6cc86075` |
| Associated Priority | `s38ac950e1` |
| Associated Project | `s5e8a7ac82` |
| Begin Date | `s793df2063` |
| End Date | `sb5657209d` |
| Period Type | `sfa08338c5` (Monthly=`kwIw9` / Weekly=`LGtGZ`) |
| Amount for Period | `s6471266f2` |
| Attachments (Drive link) | `sc05da1445` |

**Stats App ID:** `6840927ebcfa2d2bfef039e2`

### PRINCIPLE 5 — Consistent Visual Grammar
All dashboards use the same layout language.

- **Header zone:** Game target + time remaining (days + % elapsed) + current score + gap + run rate
- **Situation zone:** Situation cards with their own mini-scorecard, count, revenue, and deadline
- **Project zone:** Per-project rows/cards with pillars + dual freshness display + pillar completeness indicator
- **Detail zone:** Revenue Recognition Ledger with filter/sort/group/aggregate toolbar

**Color system (urgency is pace-based, not absolute):**
- **Green** — on pace or ahead (current ≥ expected progress given elapsed time)
- **Yellow** — at risk (current = 75–99% of expected progress)
- **Red** — behind pace (current < 75% of expected progress)
- **Gray** — pillar incomplete — project excluded from score

Where `expected progress = Target × (days elapsed ÷ total days in scoring period)`

### PRINCIPLE 6 — Implied Pace Visibility
At any moment, the dashboard must answer: **"Are we winning the time race?"**

```
Pace % = Current Score ÷ Expected Score at this point in time
Expected Score = Target × (days elapsed ÷ total scoring period days)
```

Applied at every level:
- **Game level:** Is the product line on pace?
- **Situation level:** Is this situation on pace?
- **Project level:** Is this project on pace against its own start/end dates?

A project at 60% revenue completion when 80% of its period has elapsed is **behind pace** — even though "60% complete" sounds okay in isolation. The dashboard makes this visible without the user doing math.

### PRINCIPLE 7 — Role-Appropriate Visibility (via Softr Access Control)
Role-based visibility is managed through **Softr user group controls and separate homepages** — not URL parameters or client-side logic.

- **Team homepage:** Construction WIP, Closeout, Pipeline dashboards. No executive financials.
- **Executive homepage:** All dashboards including Portfolio Planner, Financials, and principal-level views.
- Railway serves all HTML files; Softr controls which links appear per user group.

**Current status:** Not yet implemented. Next: ① Team Softr homepage ② Executive Softr homepage ③ User group assignment ④ Cross-group control menu. Claude Code builds dashboard pages; Softr navigation is configured in Softr Studio.

### PRINCIPLE 8 — Zero Manual Scoring
If a metric requires a human to manually enter or update a number for the scoreboard to reflect reality, that metric must either be automated or removed. Exceptions: qualitative notes and snapshot labels.

The PM or Super should never have to open SmartSuite to update the scoreboard. Their work in S-BOS (submitting pay apps, updating project status, updating the Smartsheet schedule) **IS** the update.

### PRINCIPLE 9 — Data Freshness: Dual-Source Display Per Project
Every project card/row on every dashboard must display **two separate freshness indicators** — one for Budget activity, one for Schedule activity.

```
Budget:   [date]    ← Green ≤7d / Yellow 8–21d / Red >21d
Schedule: [date]    ← Green ≤7d / Yellow 8–21d / Red >21d
```

**Budget Freshness Source:** `s4975ef4d4` on the Baseline Budget Items app (`69bb89ebf6a195c2c73a3b3e`). This is a formula field labeled "Last 702/703/manual update" — it reflects when the most recent G-702, G-703, or manual budget entry was made.

**Budget Freshness Fallback:** For projects without live G-702 data, use the most recently modified file date in the project's Google Drive folder. `MAX(s4975ef4d4, Drive folder most recent file modifiedTime)`.

**Schedule Freshness Source:** Smartsheet `modifiedAt` via `get_sheet_summary`. Project's Smartsheet sheet ID stored on the Project record (`s4ec74af74` or `sa1de44e85`).

---

## Pillar Completeness — Project Readiness for Scoring

A project missing critical pillars produces a misleading score. Before any project contributes to the game score, its data infrastructure must be in place.

**Pillars-In-Place indicator (on every project row/card):**
- ✅ **Complete** — all required pillars present. Project counts toward game total.
- ⚠️ **Incomplete** — one or more missing. Project shown in "Pending Setup." Excluded from game score.

The indicator links to the Pillar Matrix (`/pillar-matrix.html`) filtered to that project.

### Construction — Required Pillars

| Pillar | Check | S-BOS Field |
|---|---|---|
| **Budget — Inflow** | ≥1 Budget Item with CF Direction = Inflow | `s9be09b673` = `Wr0tD` on Baseline Budget Items |
| **Budget — Outflow** | ≥1 Budget Item with CF Direction = Outflow | `s9be09b673` = `oGjmd` on Baseline Budget Items |
| **Budget — G-702 or Drive** | G-702 linked OR Google Drive Pay App folder present | `sfiz2vvh` count > 0 OR `s561f1796b` populated |
| **Schedule — Start** | Construction Start date populated | `s7e23170f2` on Project (Date Formally Transferred to WIP) |
| **Schedule — End** | Construction End date populated | `scc0298307` on Project (Estimated Construction End Date) |
| **Schedule — Smartsheet** | Smartsheet schedule linked | `s4ec74af74` or `sa1de44e85` on Project |
| **Checklists — Drive** | Google Drive folder linked | `s561f1796b` on Project |
| **Checklists — Assigned** | ≥1 Checklist record linked | `synemrwc` count > 0 on Project |
| **Alignment — GYR** | GYR Status Report linked | `s0dm3fca` count > 0 on Project |
| **Alignment — Stakeholders** | ≥4 Stakeholder Bridge records | `sw6mypea` count ≥ 4 on Project |

**Rationale for 4-stakeholder floor:** By the time a project enters WIP, the full cast is expected to be in place: vendors, customers, product line leads, investors, lenders, and owner/owner's rep. Four is a minimum floor — not a role prescription.

### Biz Dev — Required Pillars

| Pillar | Check |
|---|---|
| Budget — Estimated Value | ≥1 Baseline Budget Item linked |
| Schedule — Expected Close | Expected Close date populated on Project Dates |
| Alignment — Stakeholders | ≥2 Stakeholder Bridge records: one Product Lead + one Decision-Maker/Owner/Owner's Rep |

### Pipeline — Required Pillars

| Pillar | Check |
|---|---|
| Budget — Estimated Value | ≥1 Baseline Budget Item linked |
| Budget — Estimating Package | Estimating document in Google Drive folder |
| Schedule — Deadline | Due Diligence / Estimating deadline populated |
| Alignment — Stakeholders | ≥1 Stakeholder Bridge record (Owner/Owner's Rep or Decision-Maker role) |

### Closeout & Warranty — Required Pillars

| Pillar | Check |
|---|---|
| Budget — Final G-702 | Final G-702 linked |
| Schedule — Substantial Completion | Substantial Completion date populated |
| Checklists — Drive | Google Drive closeout folder linked |
| Checklists — Punch List | Checklist (punch list) assigned |
| Alignment — Stakeholders | ≥2 Stakeholder Bridge records (Warranty Admin + Occupant/Owner Contact) |

### Asset Management — Required Pillars

| Pillar | Check |
|---|---|
| Budget — NOI Target | Baseline Budget Items (NOI target) linked |
| Schedule — Lease Dates | Lease term start + end populated |
| Checklists — Drive | Google Drive asset folder linked |

### Pillar Remediation — System-Assisted

| Missing Pillar | Claude Action |
|---|---|
| Baseline Budget Items | Auto-create via `smartsuite_create_record`, patch project link |
| Project Dates | Auto-create via `smartsuite_create_record` with known dates, patch project link |
| Stakeholder Bridge | Auto-create bridge record, patch project link |
| GYR Status Report | Auto-create initial record, patch project link |
| G-702 | Flag for PM action — cannot auto-create without billing data |
| Google Drive / Smartsheet link | Flag for PM action — requires human to supply URL/sheet ID |

---

## Product Line Specifications

### ① CONSTRUCTION
**Game target:** Total construction revenue at target GP% for the scoring period  
**Scoring period:** Configurable. Current: June 1 – December 31, 2026  
**Revenue metric:** Period-specific (G-702 `s0592aef02` filtered by `s0996cf591` within scoring window — NOT cumulative `s160aa943b`)

**Situations (S-BOS status stages):**

| Situation | S-BOS Status(es) | Dashboard Role |
|---|---|---|
| **Biz Dev** | New Opportunity · Nurture · Warm · Hot | Pipeline context only — not counted in game score |
| **Active Pipeline** | Active in Pipeline | Pre-contract; counts toward pipeline revenue estimate |
| **Active in WIP** | Active in WIP | Primary scoring situation |
| **Closeout & Warranty** | Closeout & Warranty | Final billing; counts toward game score |

**Multi-type project rule:** When a project is tagged with both Construction and another product type (e.g., 2nd Home), filter Baseline Budget Items to rows where `s2f27d033f` (SB Company) = KCS Homes LLC (`6914fe61e127b5f69fb770da`). Single-type Construction projects use all their budget rows.

**Sub-views within Active in WIP** (drill-down, not top-level situations):
- **Billing Velocity** — G-702s submitted this period vs. target cadence
- **GP% Watch** — jobs where GP% is trending below target (risk flag)
- **Aged WIP** — jobs where `s4975ef4d4` (last billing action) > 30 days ago

**Project measurables (period-specific where noted):**

| Measurable | Source | Period-Specific? |
|---|---|---|
| Revenue this period | G-702 `s0592aef02` filtered by pay app date | ✅ Yes |
| GP this period | Revenue × GP% or G-703 period amounts | ✅ Yes |
| Contract Revenue (total) | Baseline Budget Items `s531f1d6ab` (Adjusted Budget, Inflow rows) | No — project total |
| Contract Cost (total) | Baseline Budget Items `s531f1d6ab` (Adjusted Budget, Outflow rows) | No — project total |
| Billed to Date (cumulative) | G-702 `s6ce9e1881` (Completed & Stored to Date) | No — project total |
| Balance to Finish | G-702 `sf1daf8d5a` | No — project total |
| GP% | Contract GP ÷ Contract Revenue | No — project total |
| Retention Held | G-702 `s2ce3db8ed` | No — project total |
| % Complete | Budget Items `s3636482e0` | No — project total |
| Days since last billing | Budget Items `s4975ef4d4` | Rolling |
| Est. Completion Date | Project `scc0298307` | — |
| Est. Completion vs. Original | Project `scc0298307` vs. Dates app baseline | — |
| Budget Freshness | Budget Items `s4975ef4d4` | Rolling |
| Schedule Freshness | Smartsheet `modifiedAt` | Rolling |

**Key stats:** GP%, WIP aging, retention held, change order volume, billing velocity

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
**Situations (S-BOS status stages):** Biz Dev → Referral Secured → Contract Signed → Active Listing → Under Contract → Closed  
**Revenue metric:** Commission revenue + repair markup, per closed transaction within scoring window

*(Full spec to be completed when dashboard is built)*

---

### ③ ASSET MANAGEMENT
**Game target:** Portfolio NOI target for the period  
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
- **Railway planning tools backend** (`sb-planning-tools-production.up.railway.app`) serves all dashboard HTML and provides product-line-specific API endpoints (e.g., `/api/construction-data`, `/api/disposition-data`)
- **SmartSuite API key** stored in Railway environment variables — never exposed to browser
- **Server fetches from SmartSuite**, applies filtering/aggregation server-side, returns lean JSON
- **5-minute stale-while-revalidate cache** per endpoint — dashboard receives data instantly, background refresh keeps it fresh
- **Kompass MCP** (`earnest-vitality-production.up.railway.app`) is Claude's agent tool server — NOT a browser-callable REST API

### Data Sources by Dashboard
| Dashboard | Primary App | Supporting Apps |
|---|---|---|
| Construction | Projects + G-702 + Budget Items | G-703, Project Dates, Stakeholder Bridge |
| Asset Disposition | Projects | Budget Items, Stakeholder Bridge |
| Asset Management | Projects | Budget Items, Loans (`69aba52da3fa0e7ebb7424f7`) |
| Development | Projects | Budget Items, G-702, Project Dates |
| Brokerage | Projects | Stakeholder Bridge, Budget Items |

### Snapshot Write Pattern
```
POST /api/snapshot  {dashboardType, periodStart, periodEnd, metrics[]}
  → Server: create Stats records in SmartSuite (one per measurable)
  → Server: generate static HTML from current dashboard state
  → Server: upload HTML to Google Drive /snapshots/ folder
  → Server: write Drive link back to master Stats record (sc05da1445)
  → Response: {ok, snapshotUrl, periodCode}
```

### Stats Table — Time-Indexed Snapshot Ledger (`6840927ebcfa2d2bfef039e2`)
| Field | Slug |
|---|---|
| Associated Goal | `sd6cc86075` |
| Associated Priority | `s38ac950e1` |
| Associated Project | `s5e8a7ac82` |
| Begin Date | `s793df2063` |
| End Date | `sb5657209d` |
| Period Type | `sfa08338c5` |
| Amount for Period | `s6471266f2` |
| Attachments (Drive link) | `sc05da1445` |

---

## Version History
| Version | Date | Notes |
|---|---|---|
| 1.0 | June 1, 2026 | Initial definition |
| 1.1 | June 1, 2026 | Added: Project hierarchy; async update handling; Stats as snapshot ledger; field map; write/read patterns; Projects link field `s5e8a7ac82` |
| 1.2 | June 1, 2026 | Added: Principle 9 (Dual-Source Freshness); Pillar Completeness section; gray color state; Pillar Matrix reference; incomplete-pillar projects excluded from score |
| 1.3 | June 2, 2026 | Pipeline added as separate product line; build priority order established; Pillar categories named; Amber renamed Yellow; Principle 7 updated (Softr homepage architecture); Principle 9 rewritten (dual Budget/Schedule freshness); Snapshot Capture updated (HTML Layer 2); Construction note re: budget item classification; Asset Management OpEx situation |
| 1.4 | June 2, 2026 | Construction WIP Alignment updated to 4-minimum Stakeholder Bridge records; Biz Dev Alignment updated to two records; Closeout & Warranty Alignment added |
| 1.5 | June 2, 2026 | **Placed in repo** at `/dashboards/PRINCIPLES.md` as canonical build reference. Fixed dashboard scope: product-line-based (not stage-based) — each dashboard spans all lifecycle stages for its product type; stages are situations within the dashboard. Fixed Construction WIP situations to match implemented framework (Biz Dev / Active Pipeline / Active in WIP / Closeout). Added Period-Specific Scoring section — revenue = G-702 `s0592aef02` filtered by pay app date, NOT cumulative `s160aa943b`. Added period-specific vs. cumulative field distinction table. Fixed API architecture note — Kompass MCP is not a browser REST endpoint. Added sub-views within Active WIP (Billing Velocity, GP% Watch, Aged WIP). Added Construction multi-type project rule (KCS-Homes filter). Field `s4975ef4d4` confirmed in Budget Items schema (field #34). |
