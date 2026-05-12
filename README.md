# Stitser BUILT — Planning Tools

Internal portfolio and project planning dashboard for Stitser BUILT operating companies. Pulls live data from SmartSuite (S-Bos) and presents it as a fast, browser-based planning tool.

## What it does

**Portfolio Planner** — All active projects (WIP, Closeout, Pipeline, Biz Dev) grouped by status or company. Shows Investing / Operating / Financing budget totals and a monthly cash flow spread across the portfolio.

**Project Planner** — Per-project deep dive with three tabs:
- Income Statement (GAAP-style: Revenue, Cost of Revenue, EBITDA, Net Development Profit)
- Cash Flow Spread (monthly spread of each budget row using milestone dates)
- Dates (Estimated / Baseline / Actual with variance in days)

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML/CSS/JS — no framework |
| Backend | Node.js + Express |
| Data | SmartSuite REST API |
| Hosting | Railway (auto-deploys from GitHub) |

## Local development

```bash
# 1. Clone and install
git clone https://github.com/clint-stitser/sb-planning-tools.git
cd sb-planning-tools
npm install

# 2. Add your API key
echo "SMARTSUITE_API_KEY=your_key_here" > .env

# 3. Start the server
npm start
# → http://localhost:3000
```

## Deployment

Hosted on Railway at the team URL. Every push to `main` auto-deploys.

The `SMARTSUITE_API_KEY` environment variable must be set in Railway's Variables tab — it is never committed to the repo.

## How data loading works

On first page load the server fetches all SmartSuite tables in parallel (~5–10 seconds). After that, data is cached for 30 minutes. Subsequent loads are instant — the browser gets cached data immediately while a background refresh runs if the cache is stale.

The **↻ Refresh** button forces a live pull from SmartSuite without blocking the UI.

## SmartSuite tables used

| Table | What it provides |
|-------|-----------------|
| Projects | Project name, status, company |
| Project Dates | Milestone events (est / baseline / actual) |
| Baseline Budget | Line-item budget rows by section |
| Stakeholder Bridge | Team member → project relationships |
| People | Names for stakeholder lookup |
| Companies | SB Company per project |

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SMARTSUITE_API_KEY` | Yes | SmartSuite API token |
| `PORT` | No | Server port (Railway sets this automatically) |
