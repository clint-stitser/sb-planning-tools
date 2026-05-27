# Value Chain: Project Setup and Baselining

## Header
| Field | Value |
|---|---|
| **Workflow ID** | vc-all-s2-001 |
| **Product Lines** | All |
| **Situation** | S2-Pipeline → S3-WIP (transition workflow) |
| **Shared or Specific** | Shared |
| **Owner Role** | Project Manager / Product Line Lead |
| **Current Owner** | Varies by product line |
| **Status** | Draft — needs Clint review |
| **Last Updated** | 2026-05-26 |
| **Version** | 0.1 |

## Overview
Project Setup and Baselining is the transition workflow that converts a committed deal (end of S2-Pipeline) into a fully structured, executable project (start of S3-WIP). It establishes the single source of truth for schedule, budget, team, and reporting before any field work begins. Skipping or rushing this workflow is the leading cause of scope creep, budget surprises, and misaligned team expectations.

## Trigger
A project moves from S2-Pipeline to S3-WIP when: (1) the deal is fully funded or contracted, AND (2) leadership has authorized project start. At that point, Project Setup and Baselining must be completed before any construction, brokerage, or development activity is logged against the project.

## Steps

### Step 1: Create the Project Record in SmartSuite
| Field | Value |
|---|---|
| **Who** | Project Manager or Product Line Lead |
| **What** | Create a new record in the Projects app with all required header fields populated |
| **Tool / System** | SmartSuite — Projects app |
| **SmartSuite Field(s)** | Project name, SB Company, Department, Project Type, Status (set to Active in Pipeline → WIP), Product Line |
| **Output** | A SmartSuite project record with a unique record ID that all downstream records will link to |
| **Shared or Specific** | Shared |
| **Pillar** | People |

### Step 2: Assign the Project Team
| Field | Value |
|---|---|
| **Who** | Clint or Product Line Lead |
| **What** | Assign all required roles to named team members: PM, field lead, finance contact, product expert |
| **Tool / System** | SmartSuite — Projects app (People & Companies linked app) |
| **SmartSuite Field(s)** | Project team members, role assignments |
| **Output** | Every role has a named owner. No ambiguity about who is responsible for what. |
| **Shared or Specific** | Shared |
| **Pillar** | People |

### Step 3: Build the Schedule Baseline
| Field | Value |
|---|---|
| **Who** | Project Manager |
| **What** | Create the milestone set in SmartSuite with start/end dates for each major phase. No BS schedule — real constraints only. |
| **Tool / System** | SmartSuite — Milestones app |
| **SmartSuite Field(s)** | Milestone name, start date, end date, linked project, milestone type |
| **Output** | A baseline schedule with all major milestones set. This is the "promised" schedule — deviations are tracked against it. |
| **Shared or Specific** | Shared — milestone types vary by product line (see Product-Line Variations below) |
| **Pillar** | Schedule |

### Step 4: Build the Budget Baseline
| Field | Value |
|---|---|
| **Who** | Project Manager + Finance Contact |
| **What** | Enter the approved budget into SmartSuite with line-item detail. Own the number — no placeholders. |
| **Tool / System** | SmartSuite — Budget app (S-BOS Underwriting, Budgeting & Estimating App) |
| **SmartSuite Field(s)** | Budget line items, amounts, categories, linked project |
| **Output** | A fully itemized budget baseline. Every spend category has an approved amount. Finance can run actuals vs. budget from day one. |
| **Shared or Specific** | Shared — line item categories vary by product line |
| **Pillar** | Budget |

### Step 5: Confirm Alignment Meeting
| Field | Value |
|---|---|
| **Who** | Clint or Product Line Lead (facilitator), full project team (attendees) |
| **What** | Hold a project kickoff meeting. Walk through scope, schedule, budget, roles, and success criteria. Everyone must leave aligned. |
| **Tool / System** | In-person or video call. Notes logged in SmartSuite. |
| **SmartSuite Field(s)** | Project notes, meeting date, attendees |
| **Output** | Every team member has heard the plan and has no unresolved questions. A meeting record is logged. |
| **Shared or Specific** | Shared |
| **Pillar** | Alignment |

### Step 6: Activate GYR Reporting
| Field | Value |
|---|---|
| **Who** | Project Manager |
| **What** | Create the first GYR Status Report record for the project. Set all pillars to Green baseline. |
| **Tool / System** | SmartSuite — GYR Status Reports app |
| **SmartSuite Field(s)** | Linked project, reporting period, People/Alignment/Schedule/Budget/Checklist status |
| **Output** | The project is now visible in the weekly GYR dashboard. Team has a baseline to report against. |
| **Shared or Specific** | Shared |
| **Pillar** | Checklists |

### Step 7: Set Project Status to WIP
| Field | Value |
|---|---|
| **Who** | Project Manager |
| **What** | Update the project record status from Pipeline to Work in Progress |
| **Tool / System** | SmartSuite — Projects app |
| **SmartSuite Field(s)** | Status field |
| **Output** | Project is officially in S3-WIP. Visible in WIP views. S2 pipeline is cleared. |
| **Shared or Specific** | Shared |
| **Pillar** | Checklists |

## Completion Signal
Project record status = "Work in Progress" AND all of the following are true:
- [ ] Team roles fully assigned (no empty roles)
- [ ] Schedule baseline exists with at least 3 milestones
- [ ] Budget baseline exists with line-item detail
- [ ] Kickoff meeting logged with attendees
- [ ] First GYR report created (all green)

## Upstream Workflows
- `vc-all-s2-000` — Deal commitment / contract execution (TBD — not yet documented)
- `vc-all-s1-001` — Business development / deal origination (TBD)

## Downstream Workflows
- `vc-all-s3-001` — Weekly GYR status reporting (TBD)
- `vc-all-s3-002` — Pay app processing (TBD)
- `vc-03-s3-001` — Multifamily unit turnover tracking (TBD)
- `vc-04-s3-001` — Entry level: Cavco order → site prep (TBD)

## Product-Line Variations

**01 — Asset Disposition:**
Schedule baseline is shorter (weeks, not months). Milestones: photography, listing, offer accepted, close. Budget covers construction cleanup + brokerage costs.

**02 — Retail:**
Budget baseline includes tenant improvement allowances. Schedule must include permit timeline with City. Jeff reviews lease terms before Step 5 kickoff.

**03 — Multifamily:**
Schedule baseline requires a construction phase Gantt from Kurt's team. Budget includes hard costs, soft costs, and carry costs through lease-up.

**04 — Entry Level:**
Alli must confirm Cavco order lead time before schedule is baselined. Budget includes manufactured home cost (~$72K delivered), foundation, land improvement, and lot lease setup.

**05 — 3P Construction:**
Budget is set by client contract — PM enters client contract amount. Schedule is client-driven. Team roles are simplified (no product expert role needed).

## Known Gaps / Open Questions
- [ ] **Step 3:** What are the exact required milestone types per product line? Need Clint/Christine to confirm.
- [ ] **Step 4:** Which SmartSuite app is the canonical budget baseline location? "S-BOS Underwriting, Budgeting & Estimating App" is listed in IT/Systems projects but may not be in production yet.
- [ ] **Step 6:** Confirm GYR Status Reports app field slugs for all five pillar fields.
- [ ] **General:** Is there a SmartSuite automation that fires when Status changes to WIP? If yes, document in Registry 6.

## Change Log
| Date | Change | By |
|---|---|---|
| 2026-05-26 | Initial draft from platform architecture + 5/19 meeting notes | Claude (S-BOS System Admin) |
