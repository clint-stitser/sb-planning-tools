# CoWork GYR Reporter — System Knowledge Base
**Version:** 1.0  
**Date:** June 4, 2026  
**Author:** Clint Stitser  
**Purpose:** Reference document for the CoWork GYR reporting automation system. Covers architecture, terminology, file locations, and how to replicate for additional product lines.

---

## What This System Does

Every Monday, CoWork automatically:
1. Emails the construction team at 12 PM to complete S-BOS updates
2. At 2 PM, pulls live dashboard data, reviews S-BOS activity, writes a Claude narrative, uploads an HTML snapshot to Google Drive, and files a GYR Status Report in SmartSuite linked to the 2026 Revenue Target goal

No human action is required beyond keeping S-BOS current before 2 PM.

---

## Key Terminology

### Skill
A **skill** is a set of instructions stored as a Markdown file that tells Claude *how* to do something. It is the detailed playbook — step-by-step workflow, field slugs, logic, and templates. A skill does nothing on its own. It must be triggered by a person or a routine.

**Analogy:** A recipe. It describes exactly how to make the dish, but it doesn't cook itself.

### Routine (Scheduled Task)
A **routine** is a timer that fires at a set time and runs a prompt. The prompt tells Claude which skill to execute. The routine is dumb — it just wakes up and says "go do this." The skill is smart — it knows every step.

**Analogy:** An alarm clock. It wakes you up, but it doesn't know how to make breakfast.

### Plugin
A **plugin** is a packaged bundle of one or more skills, distributed as a `.plugin` file. Installing a plugin in CoWork makes its skills available for use in conversations and routines. The `construction-gyr-reporter.plugin` contains two skills: the 8-step GYR workflow and the Monday reminder email.

### GYR Status Report
A record type in SmartSuite (app `68216f48f98789b5bb095a51`) that represents a formal review of progress against a goal at a point in time. Has a Green/Yellow/Red status field, a narrative field, date fields, and links to the goal and priority records it belongs to. The system writes two key fields:
- **System GYR** (`s8ow7due`) — the machine-computed G/Y/R status based on pace
- **System GYR Evidence** (`s675abeba3`) — the Claude-written narrative explaining the status

---

## Architecture Overview

```
Monday 12:00 PM
  └── Routine: construction-gyr-reminder
        └── Runs prompt: "Send the construction reminder email"
              └── Skill: construction-reminder → sends team email via Gmail

Monday 2:00 PM
  └── Routine: construction-gyr-report
        └── Runs prompt: "Run the construction GYR report"
              └── Skill: construction-gyr-reporter → 8-step workflow:
                    1. Fetch dashboard data (Railway API)
                    2. Compute GYR status (pace vs. expected)
                    3. Pull S-BOS activity (last 7 days)
                    4. Write Claude narrative
                    5. Generate HTML snapshot
                    6. Upload to Google Drive
                    7. Create GYR record in SmartSuite
                    8. Log to Activity Log
```

---

## File Locations

### Skills (the playbooks)

```
~/Library/Application Support/Claude/
  local-agent-mode-sessions/.../outputs/
    construction-gyr-reporter/
      .claude-plugin/
        plugin.json                   ← plugin manifest (name, version)
      skills/
        construction-gyr-reporter/
          SKILL.md                    ← MAIN FILE: full 8-step workflow
          references/
            field-map.md              ← SmartSuite app IDs, field slugs, record IDs
            gyr-status-logic.md       ← How G/Y/R status is computed, narrative guidelines
            html-template.md          ← HTML snapshot template and placeholder reference
        construction-reminder/
          SKILL.md                    ← Monday 12 PM email instructions and recipient list
      README.md                       ← Human-readable plugin documentation
```

**The most important file to know:** `skills/construction-gyr-reporter/references/field-map.md` — this is where all the SmartSuite IDs live. When IDs change or new product lines are added, this is the first file to update.

### Routines (the timers)

```
~/.claude/scheduled-tasks/
  construction-gyr-reminder/
    SKILL.md                          ← Monday 12 PM prompt (self-contained, no plugin needed)
  construction-gyr-report/
    SKILL.md                          ← Monday 2 PM prompt (self-contained, no plugin needed)
```

**Note:** The routine SKILL.md files are fully self-contained — they contain the complete workflow instructions embedded in the prompt, not just a reference to the plugin skill. This means they work even if the plugin is not installed. This is intentional: scheduled tasks start fresh each run with no memory of prior conversations.

### To find these files in Finder:
- Press `Cmd + Shift + G` (Go to Folder)
- For routines: paste `~/.claude/scheduled-tasks/`
- For skills: paste `~/Library/Application Support/Claude/`

---

## How the GYR Status Is Computed

```
Scoring period: June 1 – December 31, 2026 (214 days)
Revenue goal:   $4,500,000

pctElapsed = (today − June 1) ÷ (Dec 31 − June 1)
expected   = $4,500,000 × pctElapsed
pace       = projectedTotal ÷ expected

pace ≥ 1.10  →  Green  "Exceeding Target"   (status value: complete)
pace ≥ 0.90  →  Green  "On Track"           (status value: backlog)
pace ≥ 0.75  →  Yellow "At Risk"            (status value: in_progress)
pace <  0.75 →  Red    "Critical"           (status value: ready_for_review)
```

**projectedTotal** = A + B + C:
- **[A]** G-702 billings submitted within scoring window (hard actuals)
- **[B]** WIP Balance to Finish × time proration to Dec 31 (firm estimate)
- **[C]** Pipeline contract value × billing fraction × confidence rating (soft estimate)

---

## Key S-BOS Record IDs

| Item | ID | App |
|---|---|---|
| BUILT. 2026 Revenue Target (Goal) | `698b7239aac6a0dc52279428` | Goals `6824d4d1885a8769bd2dfc0d` |
| Construction/Development: Complete Projects (Priority) | `698b72593f3ed73d2981c738` | Current Priorities `68216f48f98789b5bb095a4b` |
| GYR Status Reports app | `68216f48f98789b5bb095a51` | — |
| Stats app | `6840927ebcfa2d2bfef039e2` | — |
| Activity Log app | `69dc55333fe841263503f235` | — |
| Projects app | `68216a706900e8eaf75a05a7` | — |
| Baseline Budget Items app | `69bb89ebf6a195c2c73a3b3e` | — |
| G-702 app | `68a8c3d2bba73ca6e62d0cb5` | — |
| Notes & Comments app | `6894e64f621641b3ef90fa99` | — |
| Construction product type ID | `6a0629f81c9e28015cf0e85b` | Project Type app |
| KCS Homes LLC (GC entity) | `6914fe61e127b5f69fb770da` | Intacct Location Records |

---

## Key GYR Report Field Slugs

These are the fields the system writes to when creating a GYR Status Report record:

| Slug | Label | What Goes In |
|---|---|---|
| `title` | Title | "Construction GYR — W{week} {YYYY-MM-DD}" |
| `priority` | Type | `urgent` = Weekly report |
| `due_date` | Reporting Date | Today's date |
| `s3638e84d5` | GYR Status | G/Y/R status value |
| `s8ow7due` | System GYR | Same G/Y/R value (machine-computed) |
| `s675abeba3` | System GYR Evidence | Claude-written narrative |
| `se3873553c` | System GYR Date | Today's date |
| `description` | Progress Update | Auto-generated metrics summary |
| `sb4a179436` | Issues & Impediments | Flagged items from narrative |
| `s52881f1a2` | Current Story | One-line metrics summary |
| `sfwf9528` | Link to Annual Goals | Links to goal record |
| `s3511304b0` | Current Priority | Links to priority record |

---

## Google Drive Folder Structure

The HTML snapshots are saved to:
```
My Drive /
  Goal Tracking /
    Construction /
      GYR Reports /
        Construction-GYR-W{week}-{YYYY-MM-DD}.html
```

This folder structure is created automatically on first run if it does not exist. Each week adds one file. The shareable link to the file is written back to the GYR record in SmartSuite.

---

## How to Edit Instructions

### Edit the workflow steps or narrative rules:
Open: `skills/construction-gyr-reporter/SKILL.md`
This is the primary instruction file. Edit the numbered steps, the narrative structure, the completion message format.

### Edit the field IDs or SmartSuite record IDs:
Open: `skills/construction-gyr-reporter/references/field-map.md`
Change IDs here when records are updated in S-BOS, or when adding new product lines.

### Edit the GYR status thresholds:
Open: `skills/construction-gyr-reporter/references/gyr-status-logic.md`
Adjust pace percentages, risk signal definitions, or narrative tone guidelines.

### Edit the HTML snapshot layout:
Open: `skills/construction-gyr-reporter/references/html-template.md`
Update the visual design, column structure, or placeholder definitions.

### Edit the reminder email recipients or body:
Open: `skills/construction-reminder/SKILL.md`
Add or remove recipients, change the subject line, update the body text.

### Edit the schedule or the routine prompt:
Open: `~/.claude/scheduled-tasks/construction-gyr-report/SKILL.md`
Change the cron time (displayed in the Scheduled sidebar) or update the embedded workflow instructions.

---

## How to Add a New Product Line Scoreboard

When ready to build GYR reporting for Asset Disposition, Asset Management, or other product lines, follow this process:

### Step 1 — Identify the S-BOS records
- Find or create the Goal record in SmartSuite (Goals app `6824d4d1885a8769bd2dfc0d`)
- Find the corresponding Priority record (Current Priorities app `68216f48f98789b5bb095a4b`)
- Note both record IDs

### Step 2 — Identify the dashboard API endpoint
- Each product line will have its own endpoint on the Railway backend (e.g., `/api/disposition-data`)
- The response shape should match the construction data structure (projects[], score{}, scoringPeriod{})

### Step 3 — Determine the scoring model
Construction uses **progress-based billing** (revenue accrues daily from mobilization to Dec 31).
Other product lines may use different models:
- **Asset Disposition** — event-based: revenue recognized on close of sale (single event, not daily accrual)
- **Asset Management** — periodic: NOI recognized monthly
Each model changes how [B] and [C] are calculated.

### Step 4 — Duplicate the skill folder
Copy `construction-gyr-reporter/` to a new folder (e.g., `disposition-gyr-reporter/`)
Update in the new SKILL.md:
- Goal record ID
- Priority record ID
- Revenue target
- Dashboard API endpoint
- Product type filter
- Scoring logic (event-based vs. progress-based)
- Narrative prompts (what "on track" means for this product line)

### Step 5 — Update the field-map.md
Replace all Construction-specific IDs with the new product line's IDs.

### Step 6 — Create two new routines
- New Monday reminder (or different cadence)
- New GYR report task pointing to the new skill

### Step 7 — Create a new Google Drive folder
```
My Drive / Goal Tracking / {Product Line} / GYR Reports /
```

---

## Maintenance Notes

| What to Check | When | How |
|---|---|---|
| S-BOS field slugs still valid | If SmartSuite schema changes | Re-pull schema with `smartsuite_get_app_schema` |
| Goal/Priority IDs still valid | At start of each new year | Re-fetch goal records via SmartSuite MCP |
| Railway API still responding | If GYR report fails | Check `sb-planning-tools-production.up.railway.app/api/construction-data` manually |
| Drive folder exists | If Drive file upload fails | Navigate to `Goal Tracking/Construction/GYR Reports` in Drive |
| Scoring period dates are current | At start of new scoring period | Update `SCORING_PERIOD` in `server.js` and the routine prompt |

---

## What to Do When a Run Fails

1. Open the Scheduled sidebar in CoWork
2. Find the failed task
3. Read the error output — it will usually say which step failed
4. Most common failures:
   - **Railway API error** — server may be restarting; wait 5 minutes and run again manually
   - **SmartSuite permission error** — check that the API key is still valid
   - **Drive upload failed** — check that the Drive MCP is still authorized
   - **GYR record creation failed** — check field slugs in field-map.md for any schema changes
5. Fix the underlying issue, then click "Run now" to re-run

---

## Version History

| Version | Date | Change |
|---|---|---|
| 1.0 | June 4, 2026 | Initial document — Construction GYR Reporter built and deployed |

---

*This document should be updated whenever the GYR reporter architecture changes, new product lines are added, or S-BOS schema updates affect field slugs.*
