# Value Chain Document Schema
**Version:** 1.0 | **Maintained by:** S-BOS System Admin | **Last Updated:** May 2026

---

## Purpose

This schema defines the structure for every value chain document in the Stitser BUILT platform. All value chain docs must follow this format so they can be:
- Displayed in the value-chain.html visual tool
- Indexed in the Kompass knowledge base
- Processed automatically by the `process-value-chain-update` skill
- Compared across product lines to identify shared vs. specific workflows

---

## Structured Markdown Template

```markdown
# Value Chain: [Workflow Name]

## Header
| Field | Value |
|---|---|
| **Workflow ID** | vc-[product-line-code]-[situation]-[sequence] |
| **Product Lines** | [All \| 01-Asset-Disposition \| 02-Retail \| 03-Multifamily \| 04-Entry-Level \| 05-3P-Construction] |
| **Situation** | [S1-Biz-Dev \| S2-Pipeline \| S3-WIP \| S4-Closeout \| S5-Asset-Mgmt] |
| **Shared or Specific** | [Shared \| Product-Specific] |
| **Owner Role** | [Role title — not person name] |
| **Current Owner** | [Person name] |
| **Status** | [Draft \| Review \| Production] |
| **Last Updated** | [YYYY-MM-DD] |
| **Version** | [1.0] |

## Overview
[2-3 sentences. What this workflow accomplishes, why it exists, and what happens if it's skipped.]

## Trigger
[What event or condition starts this workflow. Be specific — a record status change, a meeting outcome, a document received, etc.]

## Steps

### Step [N]: [Step Name]
| Field | Value |
|---|---|
| **Who** | [Role] |
| **What** | [Action — verb + object. "Submit the pay app to the owner's rep."] |
| **Tool / System** | [SmartSuite app name, external tool, or manual] |
| **SmartSuite Field(s)** | [Relevant field slugs if known] |
| **Output** | [What is produced or updated when this step is complete] |
| **Shared or Specific** | [Shared \| Specific to: product line name(s)] |
| **Pillar** | [People \| Alignment \| Schedule \| Budget \| Checklists \| N/A] |

[Repeat for each step]

## Completion Signal
[How does the team know this workflow is done? What field is updated, what record status changes, or what document is produced?]

## Upstream Workflows
[Workflows that must be complete before this one starts. Use Workflow IDs if known.]

## Downstream Workflows
[Workflows this workflow feeds into. Use Workflow IDs if known.]

## Product-Line Variations
[Document any steps or rules that differ by product line. If none, write "None — identical across all product lines."]

## Known Gaps / Open Questions
[Anything unresolved, undocumented, or needing Clint's confirmation. Delete section if none.]

## Change Log
| Date | Change | By |
|---|---|---|
| [YYYY-MM-DD] | Initial draft | [Name/Agent] |
```

---

## Workflow ID Convention

Format: `vc-[product]-[situation]-[sequence]`

| Code | Meaning |
|---|---|
| `vc-all` | Shared across all product lines |
| `vc-01` | Asset Disposition only |
| `vc-02` | Retail only |
| `vc-03` | Multifamily only |
| `vc-04` | Entry Level only |
| `vc-05` | 3P Construction only |
| `s1` through `s5` | Situation |
| `-001`, `-002` | Sequence within that product+situation |

**Examples:**
- `vc-all-s2-001` → Shared, Pipeline situation, first workflow
- `vc-02-s2-001` → Retail-specific, Pipeline, first workflow
- `vc-all-s3-001` → Shared, Work in Progress, first workflow

---

## Kompass Interview Protocol

When Kompass guides a team member through creating or editing a value chain, it follows this question sequence:

**Opening:**
> "We're going to document a workflow together. I'll ask you questions and build the document as we go. You can stop at any point and say 'save draft' to capture what we have so far."

**Question sequence:**
1. "What's the name of this workflow — what would you call it in one short phrase?"
2. "Which product lines does this apply to — all of them, or specific ones?"
3. "Which situation does this live in — Biz Dev (S1), Pipeline (S2), Work in Progress (S3), Closeout (S4), or Asset Management (S5)?"
4. "What triggers this workflow — what has to happen before someone starts this?"
5. "Walk me through the steps one at a time. For each step, tell me: who does it, what exactly they do, and what system or tool they use."
6. "For each step — is this the same across all product lines, or does it change depending on which product line you're working in?"
7. "How does the team know this workflow is done? What's the completion signal?"
8. "What workflow feeds into this one? What does this one feed into next?"
9. "Are there any gaps, open questions, or things that aren't documented anywhere yet?"

**Closing:**
> "Here's the document I've built from our conversation. Review it and tell me if anything needs to change. When you're ready, say 'submit for integration' and I'll create the SmartSuite record."

---

## Submission to SmartSuite

When a team member says "submit for integration," Kompass creates a SmartSuite record:

**Solution:** S-BOS Platform (IT/Systems projects)
**Record fields:**
- Title: `[VALUE CHAIN UPDATE] [Workflow Name]`
- Department: IT/Systems
- Project Type: IT/Systems
- Status: Active in Pipeline
- Description: Full structured markdown doc (pasted into notes/description field)
- Tag: `value-chain-intake`

This record is the trigger for the `process-value-chain-update` skill in Claude Code.
