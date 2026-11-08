# AI Tax v2.0 — Intelligent US Document Analysis & Tax Optimization Platform

AI Tax is an analytical online platform for US individuals and self-employed sole proprietors (`W-2`, `1099-NEC`, `1099-K`, `1099-MISC`, `Schedule C`, `Schedule SE`) that extracts and reconciles financial documents, identifies legal tax-saving opportunities, asks context-aware clarifying questions, and deterministically calculates real financial tax impact across three scenarios.

## Core Principles
1. **Real Financial Effect over Raw Deductions**: Clearly distinguishes between a **Tax Deduction**, a **Tax Credit**, **Tax Liability**, and **Real Tax Savings** (e.g., \$10,000 in business expenses does not equal \$10,000 in tax savings).
2. **Evidence & Traceability First**: A merchant name is never treated as proof. Every transaction and recommendation carries a 6-level Evidence Classification (`Verified by Document`, `Potentially Deductible — Confirmation Required`, `Partially Deductible`, `Non-Deductible`, `Additional Information Required`, `Insufficient Data`), source coordinates, and IRS citations.
3. **Zero Double Counting**: Automatically excludes inter-account transfers (`transfer_between_own_accounts`), credit card bill repayments (`credit_card_repayment`), and duplicate statement rows.
4. **Deterministic Tax Calculation Engine**: reproducible federal engine versioned by tax year (`IRS-2025.3` with OBBBA changes, `IRS-2026.2` from Rev. Proc. 2025-32). State tax is not calculated and never estimated with an invented rate.

> Status: see `AUDIT_2026-11-08.md`. Before real customers: set `DATABASE_URL`, secrets, Stripe keys (ENVIRONMENT.md), and complete the legal review in spec §15.

## Quick Start

```bash
npm install
npm test
npm run build
npm run dev
```

Open `http://localhost:3000`, create an account or click **Try a demo**. For the admin console set `ADMIN_EMAIL` and `ADMIN_PASSWORD` first.

## Engineering Documentation Index
- [ARCHITECTURE.md](./ARCHITECTURE.md) — System architecture, modular engines, and data flows
- [DATABASE.md](./DATABASE.md) — PostgreSQL 16 schema (16 core entities) and tenant isolation
- [API.md](./API.md) — Server API routes and request/response contracts
- [TAX_ENGINE.md](./TAX_ENGINE.md) — Versioned IRS rules, formulas, citations, and scope boundaries
- [SECURITY.md](./SECURITY.md) — Threat model, AES-256-GCM vault, PII masking, and signed URLs
- [ENVIRONMENT.md](./ENVIRONMENT.md) — Environment variables and safe development mode
- [TESTING.md](./TESTING.md) — Test strategy and 100% reference test cases
- [DEVELOPMENT_ROADMAP.md](./DEVELOPMENT_ROADMAP.md) — Phased implementation status and future roadmap
