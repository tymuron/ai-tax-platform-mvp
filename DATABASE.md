# AI Tax v2.0 — Database Schema & Governance (`DATABASE.md`)

## 1. Database Engine & Isolation
- **Engine**: PostgreSQL 16 (via `@electric-sql/pglite` for zero-config persistent local execution in `.data/pgdata` and standard `pg` for external managed Supabase/PostgreSQL deployments).
- **Tenant Isolation**: Every user-owned table includes `user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE` and all queries in `workspace-service.ts` and API handlers strictly filter by the authenticated `user.id`.
- **Separation of AI vs. Source vs. User State**: `transactions` stores the immutable extracted values (`raw_description`, `masked_description`, `source_line_ref`), while `transaction_classifications` separately tracks `initial_group`, `ai_group`, `user_confirmed_group`, `effective_group`, and `is_user_overridden`.

## 2. The 16 Core Tables
1. `users`: Account identity, role (`user` | `admin`), and status (`active` | `blocked`).
2. `user_profiles`: Tax year, filing status, state code, dependents, home office sq ft, business miles, health insurance, retirement contributions, estimated tax payments, and complex entity flags.
3. `subscriptions`: Entitlement state (`free_trial` vs. `pro_monthly` \$10/mo) and `stripe_webhook_verified` boolean.
4. `documents`: Uploaded file metadata, SHA-256 checksum, private vault path, OCR flag, confidence score, period coverage, and missing page/month warnings.
5. `transactions`: Normalized ledger entries with `source_page`, `source_line_ref`, `review_status`, `is_duplicate`, and `is_recurring`.
6. `transaction_classifications`: 4-group classification, Schedule C category, 6-tier `evidence_classification`, `business_use_pct`, `meal_deduction_limit_pct`, `applied_rule_ref`, and `missing_evidence_items`.
7. `ai_questions`: Contextual clarification questions linked to `related_transaction_ids`.
8. `ai_answers`: User responses, custom business-use percentages, and timestamps.
9. `tax_analyses`: High-level snapshot of baseline, confirmed, and potential tax liabilities and QA status.
10. `tax_recommendations`: Traceable deduction and credit recommendations with `gross_amount`, `eligible_deduction_or_credit_amount`, `estimated_real_tax_savings`, and `irs_citation`.
11. `generated_reports`: Full 7-section JSON report payload linked to `calculation_run_id` and `rule_version_id`.
12. `export_purchases`: Export package entitlements (`essential_50`, `professional_100`, `complete_audit_200`) verified via server Stripe webhooks.
13. `ratings`: Optional 1–5 star user ratings after export download.
14. `audit_logs`: Immutable security and compliance log sanitized of raw PII.
15. `tax_rule_versions`: Versioned IRS tax parameters (`IRS-2025.2`, `IRS-2026.1`), official publication URLs, and verification timestamps.
16. `calculation_runs`: Immutable deterministic calculation inputs, 3-scenario outputs, and step-by-step `formula_trace`.
