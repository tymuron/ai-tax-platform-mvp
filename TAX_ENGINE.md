# Tax engine (`TAX_ENGINE.md`)

Deterministic federal calculation for US individuals and sole proprietors (Form 1040, Schedule C, Schedule SE, Form 8995, Schedule 8812, Forms 2441/8863, Schedule EIC). No language model produces any number.

Code: `src/lib/engines/tax-calculator.ts` (engine version `engine-3.0.0`), rule tables `src/lib/tax-rules/seed-rules.ts`, reference tests `src/tests/tax-engine.test.ts`.

## 1. Rule versions and sources (all checked 2026-11-08)

| Version | Year | Sources |
| --- | --- | --- |
| `IRS-2025.3` | 2025 | Rev. Proc. 2024-40 (brackets, EITC), **OBBBA (P.L. 119-21) as restated in Rev. Proc. 2025-32 §2–3**: standard deduction $15,750 / $31,500 / $23,625, child tax credit $2,200 (refundable $1,700), §179 $2.5M / $4M; Notice 2025-5 mileage 70¢ |
| `IRS-2026.2` | 2026 | Rev. Proc. 2025-32: brackets, standard deduction $16,100 / $32,200 / $24,150, EITC table, CTC $2,200 / $1,700, §179 $2.56M / $4.09M, §199A threshold $201,750 ($403,500 MFJ) with $75k/$150k phase-in; SSA wage base $184,500; Notice 2026-10 + Announcement 2026-11: mileage 72.5¢ Jan–Jun, **76¢ from 1 July 2026**; OBBBA §70105 ($400 minimum QBI deduction) and §70405 (new dependent-care credit rates) |

The previous tables (`IRS-2025.2`, `IRS-2026.1`) used pre-OBBBA 2025 numbers and estimated 2026 numbers; they are kept in the database only as `deprecated` history.

The code tables are the single source of truth for calculations. The database copy is for audit and the admin view. Changing any figure requires updating the source line and `last_verified_at`, and the reference tests will fail until the expected values are re-derived.

## 2. What is calculated

- **Regular tax**: IRS Tax Table method under $100,000 of taxable income (tax on the midpoint of the $25/$50 row, whole dollars); exact brackets at $100,000 and above.
- **Schedule C**: business-use % and the 50% meals limit applied per transaction. Home office: simplified vs regular, the larger one, capped at business profit (§280A(c)(5)). Vehicle: standard mileage vs actual (business share), the larger one; when the profile-based vehicle deduction is taken, vehicle costs from statements are **not** counted again. §179: only for items with >50% business use, capped at the dollar limit and the business-income limit; ≤50% use → "Additional tax review required" (depreciation is not computed).
- **Schedule SE**: 92.35% of profit, OASDI up to the wage base minus W-2 wages, Medicare 2.9%, half deductible. Additional Medicare tax 0.9% (Form 8959) on wages + SE earnings over the threshold.
- **Adjustments**: SEP/solo 401(k) limited to 20% of (profit − ½ SE tax) and the annual dollar limit; then SE health insurance limited to the remaining profit.
- **§199A**: 20% of QBI, phased out linearly over the phase-in range. This is exact for a sole proprietor **with no W-2 employees and no qualified property**, whether or not the business is an SSTB. 2026: $400 minimum when QBI ≥ $1,000.
- **Credits** (order of the Credit Limit Worksheet): dependent care (§21, rate schedule by year, limited by earned income), education (AOTC with 40% refundable / LLC, $80k–$90k / $160k–$180k phase-out, none for MFS), child tax credit + $500 other-dependent credit with the $50-per-$1,000 phase-out, additional child tax credit (refundable, 15% of earned income over $2,500, $1,700 per child), EITC by the EIC-table method.
- **Totals**: "Total federal tax" = Form 1040 line 24 (income tax after non-refundable credits + SE tax + Additional Medicare). Refundable credits are treated as payments. Savings between scenarios compare the **net position** (line 24 − refundable credits), so lost EITC is counted.

## 3. Scenarios

1. **Baseline** — income, standard deduction, ½ SE tax, QBI, credits, and only expenses proven by a document that the user did not have to confirm (e.g. processing fees on the statement).
2. **Confirmed** — baseline + expenses the user confirmed in the interview or ledger + profile items the user entered (SE health insurance, retirement), + home office only if exclusive/regular use is confirmed, + mileage only if a mileage log is confirmed.
3. **Potential** — everything above + items still waiting for confirmation. Always labelled as requiring confirmation.

Per-recommendation "estimated tax impact" is computed by running the scenario **with and without** that item, not by multiplying by a marginal rate. (QBI is the one exception: shown at the federal marginal rate, labelled "about".)

## 4. Not calculated — shown as such, never guessed

- **State income tax**: $0 for states with no tax on wages (AK, FL, NV, NH, SD, TN, TX, WA, WY); every other state is "not calculated, not included".
- Itemized deductions (a Form 1098 upload triggers "Additional tax review required"), Premium Tax Credit (a 1095-A upload triggers review), depreciation other than §179, capital gains, AMT, multi-state, partnerships / S corps / C corps (→ "Additional tax review required").
- Assumptions to confirm with the user: EITC investment income under the limit and age 25–64 when there is no qualifying child; children entered are under 17 with SSNs; W-2 income is taken from W-2 forms / income rows, not reconstructed from net payroll deposits.
