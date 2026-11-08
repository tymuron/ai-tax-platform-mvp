# AI Tax v2.0 — Deterministic Tax Engine Specification (`TAX_ENGINE.md`)

## 1. Versioned IRS Rule Sets (`tax_rule_versions`)
All calculations are driven by immutable versioned rule payloads (`src/lib/tax-rules/seed-rules.ts`):
- **`IRS-2025.2` (Tax Year 2025)**:
  - Official Sources: IRS Rev. Proc. 2024-40, IRS Notice 2024-80, Publication 535, Form 8995, Schedule C, Schedule SE.
  - Standard Deduction: `$15,000` (Single/MFS), `$30,000` (MFJ), `$22,500` (Head of Household).
  - Social Security (OASDI) Wage Base: `$176,100` at `12.4%` (coordinated with W-2 Box 1/3 wages).
  - Medicare Tax: `2.9%` on all net SE earnings (`92.35%` of Schedule C profit) + `0.9%` Additional Medicare Tax above `$200,000` Single / `$250,000` MFJ.
  - Standard Mileage Rate: `70 cents/mile`.
  - Home Office Simplified Rate: `$5/sq ft` up to `300 sq ft` (`$1,500` max), compared automatically against Form 8829 Regular Method and capped at tentative Schedule C profit (`IRC §280A(c)(5)`).
  - Business Meals Limit: `50%` (`IRC §274(n)`).
  - Section 179 Max Deduction: `$1,250,000` (phase-out threshold `$3,130,000`).
  - QBI Deduction (`IRC §199A`): `20%` of net Qualified Business Income after above-the-line SE adjustments, with phase-out starting at `$197,300` (Single) / `$394,600` (MFJ).
- **`IRS-2026.1` (Tax Year 2026)**:
  - Includes 2026 inflation-adjusted brackets, standard deductions (`$15,450` Single / `$30,900` MFJ), OASDI cap (`$181,800`), and `71 cents/mile` mileage rate.

## 2. Three-Scenario Comparison Architecture
1. **Scenario 1 — Baseline Scenario**: Includes verified gross income (`W-2` + `1099`) and only baseline mandatory payment processing fees without newly discovered Schedule C, Home Office, Mileage, QBI, or Credit optimizations.
2. **Scenario 2 — Confirmed Optimization Scenario**: Includes all document-verified (`verified_by_document`) and user-confirmed (`is_user_overridden`) deductions, Home Office, Vehicle Mileage, Self-Employed Health Insurance, SEP-IRA, 20% QBI, and eligible Tax Credits (`CTC`, `CDCC`, `AOTC/LLC`, `EITC`).
3. **Scenario 3 — Potential Optimization Scenario (Requires Confirmation)**: Adds unconfirmed items (`potentially_deductible_confirmation_required`, `additional_info_required`) strictly isolated so unconfirmed assumptions are never presented as final.

## 3. Supported Scope vs. Additional Tax Review Guardrail
- **Supported MVP Scope**: US Individuals (`W-2`) and Self-Employed / Sole Proprietors (`1099-NEC`, `1099-K`, `1099-MISC`, `Schedule C`, `Schedule SE`).
- **Unsupported Complex Entities**: Partnerships (`Form 1065`), S-Corporations (`Form 1120-S`), C-Corporations (`Form 1120`), complex multi-state apportionment, or foreign trusts trigger `status = 'additional_review_required'` and display a prominent `"Additional tax review required"` notice rather than guessing a liability figure.
