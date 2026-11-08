# AI Tax v2.0 — Testing Strategy & Reference Cases (`TESTING.md`)

## Running the Automated Test Suite

```bash
cd /Users/tymurchystiakov/antigravity-workspace/playground/ai-tax
npm test
```

## Reference Test Cases (`src/tests/tax-engine.test.ts`)
Critical tax calculations require a **100% exact match** against approved reference cases:

1. **Reference Case 1 — 2025 Federal Progressive Brackets (`Single`, `$60,000` Taxable Income)**:
   - `10%` on first `$11,925` = `$1,192.50`
   - `12%` on next `$36,550` (`$11,925` to `$48,475`) = `$4,386.00`
   - `22%` on remaining `$11,525` (`$48,475` to `$60,000`) = `$2,535.50`
   - **Expected & Verified Result**: `$8,114.00` (`22%` marginal rate).
2. **Reference Case 2 — Home Office Simplified vs. Regular Method + IRC §280A Profit Cap**:
   - `200 sq ft` of `2,000 sq ft` home (`10%` business ratio) with `$27,600` annual housing costs.
   - Simplified (`$1,000`) vs. Regular (`$2,760`) -> selects optimal `$2,760`.
   - When tentative Schedule C profit is `$800`, caps deduction at `$800`.
3. **Reference Case 3 — Business Vehicle Mileage (`70¢/mile` for 2025) vs. Actual Expenses**:
   - `4,000` business miles out of `10,000` total miles -> `$2,800` Standard Mileage vs. `$800` Actual -> selects `$2,800`.
4. **Reference Case 4 — Multi-Transaction Reconciliation, Guardrails & 3-Scenario Separation**:
   - Verifies inter-account transfers (`$8,000`) and credit card repayments (`$3,200`) are classified as `Non-expense transactions` and excluded from gross income and deductions.
   - Verifies ambiguous merchant (`Amazon.com $1,500`) is classified as `additional_info_required` and excluded from the Confirmed Optimization Scenario until confirmed by the user.
   - Verifies that `$15,560` in confirmed Schedule C deductions yields exact marginal tax savings rather than a false 1:1 `$15,560` tax reduction.
5. **Reference Case 5 — Security, PII Masking, Signed Links, Stripe Webhook HMAC & 16 DB Tables**:
   - Verifies SSN/EIN/Card/Email masking, cross-tenant token rejection, Stripe webhook tamper rejection, and presence of all 16 required PostgreSQL tables.
