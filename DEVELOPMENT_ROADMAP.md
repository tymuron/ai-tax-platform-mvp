# Development roadmap and status (`DEVELOPMENT_ROADMAP.md`)

Status after the audit of 2026-11-08 (see `AUDIT_2026-11-08.md`). "Done" means implemented and covered by tests; "Needs setup" means the code is ready but needs keys or accounts.

| Phase | Status |
| --- | --- |
| 1. Foundation (auth, DB, dashboard) | Done: real sign-up/login, signed sessions, admin role. **Needs setup:** persistent `DATABASE_URL` and secrets on Vercel. Open: password reset, email verification, row-level security. |
| 2. Document intelligence | Done: CSV/XLSX, text PDFs, OCR for JPG/PNG, duplicates, transfers, card repayments, unreadable files flagged. Open: scanned PDFs, bank-specific PDF layouts, balance reconciliation. |
| 3. AI workspace | Done: rule-based classification, interview, corrections saved and recalculated. Open: an actual AI model (OpenAI or Claude) for unknown merchants — spec §11; must send masked descriptions only. |
| 4. Tax intelligence | Done: corrected 2025 (OBBBA) and 2026 tables, Tax Table rounding, full credit logic, three scenarios, with/without effects, QA. Open: state tax, itemized deductions, depreciation beyond §179, PTC. |
| 5. Monetization | Done in code: Stripe Checkout, verified webhooks, refunds, entitlements. **Needs setup:** Stripe keys + webhook endpoint. |
| 6. Admin & launch | Done: admin console behind the admin role. Open: monitoring (Sentry), shared rate limiter, data deletion, legal review (spec §15: paid preparer / PTIN rules) before charging for exports. |
