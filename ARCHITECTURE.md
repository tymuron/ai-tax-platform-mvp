# AI Tax v2.0 — System Architecture (`ARCHITECTURE.md`)

## 1. High-Level Architecture
AI Tax v2.0 is built on a modular service-oriented architecture using Next.js (App Router, TypeScript), PostgreSQL (`@electric-sql/pglite` embedded PostgreSQL 16 + `pg` production compatibility), and strict separation between **AI/OCR Extraction & Classification** and **Deterministic Mathematical Tax Calculation**.

### Core Engines (`src/lib/engines/`)
1. **Document Intelligence Engine (`document-intelligence.ts`)**:
   - Ingests `PDF`, `CSV`, `XLSX`, `JPG`, and `PNG` documents (`W-2`, `1099-NEC`, `1099-K`, `1099-MISC`, `1098`, `1095-A`, bank statements, credit card statements, receipts, invoices, contracts).
   - Extracts dates, amounts, currencies, descriptions, and exact source coordinates (`document_id`, `source_page`, `source_line_ref`).
   - Performs multi-statement reconciliation: detects exact/fuzzy duplicates, pairs refunds, flags missing page sequences (`Page X of Y`), warns on incomplete annual month coverage, and isolates low-confidence rows as `needs_review` without inventing values.
2. **Financial Analysis Engine (`financial-analysis.ts`)**:
   - Classifies every transaction into one of 4 groups: `Income`, `Business expenses`, `Non-expense transactions`, `Personal expenses`.
   - Enforces the **Ambiguous Merchant Guardrail**: purchases at multi-purpose retailers (`Amazon`, `Walmart`, `Target`, `Costco`, `Apple`, `Best Buy`, `PayPal`, `Venmo`) are never marked `verified_by_document` by merchant name alone; they require confirmation and itemized receipts.
3. **AI Tax Interview Engine (`interview-engine.ts`)**:
   - Generates concise, non-repeating contextual questions for recurring software subscriptions, mixed-use utilities/telecom, ambiguous retailers, home office exclusivity, and vehicle mileage logs.
   - Persists user answers in `ai_answers` and triggers immediate deterministic recalculation.
4. **Deterministic Tax Calculation Engine (`tax-calculator.ts`)**:
   - Executes pure, versioned tax formulas for **Scenario 1 (Baseline)**, **Scenario 2 (Confirmed Optimizations)**, and **Scenario 3 (Potential Opportunities Requiring Confirmation)**.
   - Produces an immutable `formula_trace` stored in `calculation_runs`.
5. **AI Tax Optimization Engine (`optimization-engine.ts`)**:
   - Evaluates all 16 Schedule C expense categories, missed recurring expenses, Home Office (`Simplified` vs. `Regular Form 8829`), Vehicle (`Standard Mileage` vs. `Actual`), Section 179 / Bonus Depreciation, 20% QBI (`IRC §199A`), Self-Employed Health Insurance (`Form 7206`), SEP-IRA / Solo 401(k), and Federal Tax Credits (`CTC`, `CDCC`, `AOTC/LLC`, `EITC`).
6. **Quality Assurance & Report Engine (`qa-and-report-engine.ts`)**:
   - Runs 8 pre-flight verification gates and computes all 8 accuracy/precision metrics before assembling the 7-section `GeneratedReportRecord`.
