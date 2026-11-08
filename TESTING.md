# Testing (`TESTING.md`)

```bash
npm test          # vitest, 45 tests
npm run typecheck
npm run build
```

## Reference cases (`src/tests/tax-engine.test.ts`)

Every expected value was derived by hand from the IRS source cited in `seed-rules.ts`. They must match exactly; a change that moves one is a change in tax results.

| Case | Expected |
| --- | --- |
| 2025 single, taxable income $60,000 (Tax Table, midpoint $60,025) | $8,120 |
| 2025 single, $150,000 (worksheet) | $28,847.00 |
| 2026 MFJ, $250,000 (worksheet) | $45,196.00 |
| EITC 2025 single, 1 child: $20,000 / $40,000 / $50,434 | $4,328 / $1,663 / $0 |
| EITC 2025 single, no child, $5,000 | $384 |
| EITC 2026 MFJ, 2 children, $30,000 | $7,316 |
| §21 rate: 2025 at $30k / $50k; 2026 at $30k, $100k single, $200k MFJ | 27% / 20%; 42%, 22%, 22% |
| Schedule C single 2025 — baseline profit $120,000 | total federal tax $28,727.46 (SE $16,955.46, QBI $19,154.45, tax $11,772) |
| … confirmed (profit $80,000) | $16,690.64, $12,036.82 below baseline |
| … potential (profit $40,000) | $7,468.82, $21,258.64 below baseline |
| HOH, 2 children, $30,000 wages, 2025 | tax $638 fully offset; ACTC $3,400; EITC $5,746; net −$9,146 |
| Mileage 2025: 4,000 mi | $2,800, and fuel on the statement not counted again |
| Mileage 2026: 600 mi before + 400 mi after 1 July | $739.00 |

Guard tests: §179 refused at ≤50% business use; CA state tax "not calculated" (totals equal TX); rows needing review excluded; unsupported entity → "Additional tax review required"; merchant names never "verified"; real text PDF parsed; unreadable PDF → error, no rows.

## Security and payment tests (`src/tests/security-and-payments.test.ts`)

No seeded accounts; salted password hashes; `x-user-id` / unsigned cookie rejected; tampered session rejected; admin role required; new account starts empty; tenant isolation; duplicate file rejected; free-trial limit; demo data private and labelled; signed links expire and are user-bound; PII masking; forged Stripe signature rejected; verified webhook grants an export once (idempotent).

## Not covered by automated tests

- OCR on real phone photos (needs the tesseract model download).
- Real Stripe Checkout end-to-end (needs test keys + `stripe listen`).
- Classification accuracy on a representative set of real statements — required by spec §9 before launch.
