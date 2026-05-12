#!/usr/bin/env node
'use strict';
require('dotenv').config();

/**
 * link-account-codes.js
 *
 * Bulk-links Intacct account codes to Baseline Budget Items in SmartSuite.
 *
 * Usage:
 *   node link-account-codes.js           — dry run: shows what WOULD be updated
 *   node link-account-codes.js --apply   — live: applies updates to SmartSuite
 *   node link-account-codes.js --apply --force  — re-links even already-linked records
 */

const ACCOUNT_ID = 's71hvw05';
const BASE_URL   = 'https://app.smartsuite.com/api/v1';
const BUDGET_APP = '69bb89ebf6a195c2c73a3b3e';  // Baseline Budget Items
const CODES_APP  = '68dd644f026c0ecd248201c7';   // Intacct Account Codes

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');   // re-link already-linked records
const API_KEY = process.env.SMARTSUITE_API_KEY;

if (!API_KEY) {
  console.error('Error: SMARTSUITE_API_KEY not set in .env');
  process.exit(1);
}

// ── API helpers ────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function apiRequest(method, path, body) {
  const headers = {
    'Authorization': `Token ${API_KEY}`,
    'ACCOUNT-ID': ACCOUNT_ID,
    'Content-Type': 'application/json',
  };
  let retries = 0;
  while (true) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) {
      const wait = (2 ** retries) * 2000;
      console.log(`  Rate limited — retrying in ${wait / 1000}s…`);
      await sleep(wait);
      if (++retries > 5) throw new Error('Max retries exceeded');
    } else {
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`API ${res.status}: ${text.slice(0, 300)}`);
      }
      return res.json();
    }
  }
}

async function listAll(appId) {
  const records = [];
  let offset = 0;
  while (true) {
    const data = await apiRequest('POST', `/applications/${appId}/records/list/`, {
      limit: 100, offset,
    });
    records.push(...(data.items || []));
    offset += data.count;
    if (offset >= data.total) break;
    await sleep(400);
  }
  return records;
}

// ── Matching rules ─────────────────────────────────────────────────────────
//
// Order matters — first matching rule wins.
// Each rule maps a budget line item name pattern to an Intacct account number.
// `getCode(codeMap)` looks up the SmartSuite record ID for that account number.
// If the account hasn't been imported to SmartSuite yet, getCode returns undefined
// and the item is logged as PENDING (needs the account added first).
//
// Gross profit items: explicitly skipped — Intacct calculates GP, no account code.

const SKIP_RE = /gross\s*profit/i;

const RULES = [
  // ── Revenue (4xxx) ─────────────────────────────────────────────────────
  {
    pattern: /^revenue$|\bannual lease revenue\b|nnn income|nnn revenue|asset sale revenue|\bsale revenue\b|total project revenue|\bsale price\b|built construction revenue|true up|construction income|\bsale proceeds\b|proceeds from sale/i,
    acctNo: '4000', name: 'Construction Income',
  },
  {
    pattern: /sp listing commission.*seller|listing commission|seller.*commission income|buyer agent commission income/i,
    acctNo: '4010', name: 'Buyer Agent Commission Income',
  },
  {
    pattern: /\bservice income\b/i,
    acctNo: '4020', name: 'Service Income',
  },
  {
    pattern: /\bpassthrough income\b|passthrough non-deductible/i,
    acctNo: '4060', name: 'Passthrough Income',
  },
  {
    pattern: /\bother income\b|\bmisc.*income\b/i,
    acctNo: '4050', name: 'Other Income',
  },

  // ── COGS (5xxx) — note: 5010/5040/5070/5090/5100/5200 not yet imported to SmartSuite ──
  {
    pattern: /buyer agent co-op|buyer.*commission.*expense|buyer.*broker.*commission/i,
    acctNo: '5010', name: 'Buyer Agent Commission (COGS)',
    pending: 'Account 5010 not yet in SmartSuite — add it, then re-run',
  },
  {
    pattern: /\bpurchase price\b|land cost\b|land acquisition|master cost allocation|acquisition cost|land purchase/i,
    acctNo: '5040', name: 'Land & Acquisitions',
    pending: 'Account 5040 not yet in SmartSuite — add it, then re-run',
  },
  {
    pattern: /improvement cost|construction cost|hard cost|soft cost|permit fee|design cost|architect cost|spe total cost/i,
    acctNo: '5070', name: 'Other Costs (COGS)',
    pending: 'Account 5070 not yet in SmartSuite — add it, then re-run',
  },
  {
    pattern: /\bsubcontractor/i,
    acctNo: '5090', name: 'Subcontractors',
    pending: 'Account 5090 not yet in SmartSuite — add it, then re-run',
  },
  {
    pattern: /\bproperty.specific|closing cost|carry cost|holding cost/i,
    acctNo: '5100', name: 'Property Specific Expenses',
    pending: 'Account 5100 not yet in SmartSuite — add it, then re-run',
  },
  {
    pattern: /referral fee.*cogs|referral.*expense/i,
    acctNo: '5101', name: 'Referral Fee (COGS)',
    pending: 'Account 5101 not yet in SmartSuite — add it, then re-run',
  },
  {
    pattern: /warranty reserve|warranty expense/i,
    acctNo: '5200', name: 'Warranty Expense',
    pending: 'Account 5200 not yet in SmartSuite — add it, then re-run',
  },
  {
    pattern: /built construction cost|general construction cost|base construction cost|construction.*cogs/i,
    acctNo: '5000', name: 'Cost of Goods Sold',
  },

  // ── Overhead (6xxx) — not yet imported to SmartSuite ───────────────────
  {
    pattern: /legal cost|attorney fee|legal fee/i,
    acctNo: '6180', name: 'Legal',
    pending: 'Account 6180 not yet in SmartSuite — add it, then re-run',
  },
  {
    pattern: /origination.*holdback|holdback.*origination|extension.*holdback|loan.*renewal.*fee|fee.*origination|origination fee|loan.*fee|fee.*loan/i,
    acctNo: '6260', name: 'Professional Fees',
    pending: 'Account 6260 not yet in SmartSuite — add it, then re-run',
  },
  {
    pattern: /legal costs? to secure|professional fee|consulting fee/i,
    acctNo: '6260', name: 'Professional Fees',
    pending: 'Account 6260 not yet in SmartSuite — add it, then re-run',
  },
  {
    pattern: /loan interest|\binterest.*\d+%|\d+%.*interest|interest carry|interest expense/i,
    acctNo: '6360', name: 'Interest Expense',
    pending: 'Account 6360 not yet in SmartSuite — add it, then re-run',
  },
  {
    pattern: /developer fee/i,
    acctNo: '6085', name: 'Developer Fees',
    pending: 'Account 6085 not yet in SmartSuite — add it, then re-run',
  },

  // ── Financing (2xxx/3xxx) ──────────────────────────────────────────────
  {
    pattern: /required debt|loan proceeds|statesman.*loan|construction loan|partner.*loan/i,
    acctNo: '2246', name: 'Loan Payable - Stitser BUILT',
  },
  {
    pattern: /\bsb loan\b|stitser.*built.*loan/i,
    acctNo: '2246', name: 'Loan Payable - Stitser BUILT',
  },
  {
    pattern: /required equity|equity.*contribution|investor.*equity|capital.*contribution/i,
    acctNo: '3015', name: 'Capital Contribution',
  },
  {
    pattern: /\bdistribution|return of capital/i,
    acctNo: '3016', name: 'Capital Distribution',
    pending: 'Account 3016 not yet in SmartSuite — add it, then re-run',
  },
];

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const hr = '─'.repeat(68);
  console.log(`\n${hr}`);
  console.log('  SmartSuite — Account Code Linker');
  console.log(`  Mode: ${APPLY ? '🔴 LIVE — will update SmartSuite' : '⚪ DRY RUN — no changes'}`);
  if (FORCE) console.log('  --force: will re-link already-linked records');
  console.log(hr);

  // 1. Load account codes → build map: acctNo → SmartSuite record id
  process.stdout.write('\nLoading account codes… ');
  const codeRecs = await listAll(CODES_APP);
  const codeMap  = {};
  for (const r of codeRecs) {
    const no = (r.s00d687f72 || '').trim();
    if (no) codeMap[no] = r.id;
  }
  console.log(`${codeRecs.length} records | ${Object.keys(codeMap).length} mapped`);

  // 2. Load all budget items
  process.stdout.write('Loading budget items… ');
  const budgets = await listAll(BUDGET_APP);
  console.log(`${budgets.length} records\n`);

  // 3. Classify
  const results = {
    update:     [],   // will be linked
    pending:    [],   // matched rule but account not in SmartSuite yet
    skip_gp:    [],   // gross profit — no account code by design
    skip_blank: [],   // blank account name
    skip_done:  [],   // already linked (and --force not set)
    no_match:   [],   // no rule matched
  };

  for (const r of budgets) {
    const name    = (r.s32eed8560 || '').replace(/\s+/g, ' ').trim();
    const linked  = (r.se51cd20e3 || []).length > 0;

    if (!name) {
      results.skip_blank.push({ id: r.id, proj: (r.s2ba7b261b||[]).join(',') });
      continue;
    }
    if (SKIP_RE.test(name)) {
      results.skip_gp.push({ id: r.id, name });
      continue;
    }
    if (linked && !FORCE) {
      results.skip_done.push({ id: r.id, name, existing: r.se51cd20e3[0] });
      continue;
    }

    let matched = false;
    for (const rule of RULES) {
      if (!rule.pattern.test(name)) continue;
      const codeId = codeMap[rule.acctNo];
      if (codeId) {
        results.update.push({ id: r.id, name, acctNo: rule.acctNo, acctName: rule.name, codeId });
      } else {
        results.pending.push({ id: r.id, name, acctNo: rule.acctNo, acctName: rule.name, reason: rule.pending || `Account ${rule.acctNo} not in SmartSuite` });
      }
      matched = true;
      break;
    }
    if (!matched) {
      results.no_match.push({ id: r.id, name });
    }
  }

  // 4. Print results
  console.log(hr);
  console.log('CLASSIFICATION SUMMARY');
  console.log(hr);
  console.log(`  ✓ Will link account code     : ${results.update.length}`);
  console.log(`  ⏳ Pending (account not in SS): ${results.pending.length}`);
  console.log(`  ↩  Already linked (skipped)  : ${results.skip_done.length}`);
  console.log(`  ⊘  Gross profit (no code)    : ${results.skip_gp.length}`);
  console.log(`  ⊘  Blank name (skip)         : ${results.skip_blank.length}`);
  console.log(`  ？ No rule match (manual)    : ${results.no_match.length}`);

  if (results.update.length) {
    console.log(`\n${hr}`);
    console.log('WILL LINK:');
    for (const u of results.update) {
      console.log(`  [${u.id.slice(-8)}] "${u.name}" → ${u.acctNo} ${u.acctName}`);
    }
  }

  if (results.pending.length) {
    console.log(`\n${hr}`);
    console.log('PENDING — account not yet in SmartSuite (add account, then re-run):');
    // Group by account number
    const byAcct = {};
    for (const p of results.pending) {
      (byAcct[`${p.acctNo} ${p.acctName}`] ||= []).push(p.name);
    }
    for (const [acct, names] of Object.entries(byAcct)) {
      console.log(`  ${acct}:`);
      for (const n of names) console.log(`    · "${n}"`);
    }
  }

  if (results.no_match.length) {
    console.log(`\n${hr}`);
    console.log('NO MATCH — needs manual review:');
    for (const u of results.no_match) {
      console.log(`  [${u.id.slice(-8)}] "${u.name}"`);
    }
  }

  if (results.skip_gp.length) {
    console.log(`\n${hr}`);
    console.log('GROSS PROFIT ITEMS (correctly skipped — no Intacct account code):');
    for (const g of results.skip_gp) {
      console.log(`  "${g.name}"`);
    }
  }

  // 5. Apply
  if (!APPLY) {
    console.log(`\n${hr}`);
    console.log(`Dry run complete. Re-run with --apply to update ${results.update.length} records.`);
    if (results.pending.length) {
      console.log(`\nTo unlock ${results.pending.length} pending records:`);
      const accts = [...new Set(results.pending.map(p => `${p.acctNo} – ${p.acctName}`))];
      console.log('  Add these account codes to SmartSuite first:');
      for (const a of accts) console.log(`    · ${a}`);
    }
    console.log();
    return;
  }

  if (!results.update.length) {
    console.log('\nNo records to update.\n');
    return;
  }

  console.log(`\n${hr}`);
  console.log(`Applying ${results.update.length} updates…\n`);
  let success = 0, failed = 0;

  for (const u of results.update) {
    try {
      await apiRequest('PATCH', `/applications/${BUDGET_APP}/records/${u.id}/`, {
        se51cd20e3: [u.codeId],
      });
      console.log(`  ✓ "${u.name}" → ${u.acctNo} ${u.acctName}`);
      success++;
    } catch (err) {
      console.error(`  ✗ "${u.name}": ${err.message}`);
      failed++;
    }
    await sleep(350); // stay within rate limit
  }

  console.log(`\n${hr}`);
  console.log(`Done: ${success} updated, ${failed} failed.\n`);
  if (results.pending.length) {
    console.log(`${results.pending.length} records still pending — add missing account codes to SmartSuite and re-run.\n`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
