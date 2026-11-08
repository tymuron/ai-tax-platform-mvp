/**
 * Reference tests. Every expected number below was worked out by hand from the IRS
 * sources cited in src/lib/tax-rules/seed-rules.ts (Rev. Proc. 2024-40, Rev. Proc. 2025-32,
 * OBBBA, Notice 2026-10 / Announcement 2026-11). A change that moves one of them is a
 * change in tax results and must be justified against the source.
 */
import { describe, it, expect } from 'vitest';
import { getTaxRulesForYear } from '@/lib/tax-rules/seed-rules';
import {
  childCareCreditRate,
  computeEarnedIncomeCredit,
  computeProgressiveFederalTax,
  computeVehicleDeduction,
  runDeterministicTaxCalculation,
} from '@/lib/engines/tax-calculator';
import { classifyTransactionRecord } from '@/lib/engines/financial-analysis';
import { extractTransactionsFromContent } from '@/lib/engines/document-intelligence';
import {
  ScheduleCCategory,
  TransactionClassificationRecord,
  TransactionGroup,
  TransactionRecord,
  TransactionSubType,
  EvidenceClassification,
  UserProfileRecord,
} from '@/types/tax';

const R25 = getTaxRulesForYear(2025);
const R26 = getTaxRulesForYear(2026);

export const PROFILE: UserProfileRecord = {
  user_id: 'u1',
  tax_year: 2025,
  filing_status: 'single',
  state_code: 'TX',
  business_type: 'Sole proprietor',
  industry_code: '541611',
  has_w2_income: false,
  has_1099_income: true,
  has_schedule_c: true,
  dependents_count: 0,
  qualifying_children_under_17: 0,
  child_care_expenses_paid: 0,
  education_expenses_paid: 0,
  education_years_claimed: 0,
  is_student_at_least_half_time: false,
  home_total_sqft: 0,
  home_office_sqft: 0,
  home_office_exclusive_regular_use: false,
  home_annual_rent_or_mortgage_interest: 0,
  home_annual_utilities_insurance: 0,
  vehicle_total_miles: 0,
  vehicle_business_miles: 0,
  vehicle_actual_expenses: 0,
  vehicle_placed_in_service_date: null,
  self_employed_health_insurance_premiums: 0,
  sep_ira_solo_401k_contributions: 0,
  estimated_tax_payments_made: 0,
  vehicle_mileage_log_confirmed: false,
  vehicle_business_miles_after_rate_change: 0,
  has_unsupported_complex_entity: false,
  unsupported_entity_notes: null,
  updated_at: '2026-11-08T00:00:00Z',
};

let seq = 0;
export function tx(
  amount: number,
  direction: 'inflow' | 'outflow',
  group: TransactionGroup,
  sub: TransactionSubType,
  cat: ScheduleCCategory,
  evidence: EvidenceClassification,
  opts: { overridden?: boolean; businessPct?: number; review?: TransactionRecord['review_status'] } = {}
): { t: TransactionRecord; c: TransactionClassificationRecord } {
  seq += 1;
  const id = `t${seq}`;
  const t: TransactionRecord = {
    id,
    user_id: 'u1',
    document_id: 'd1',
    tax_year: 2025,
    transaction_date: '2025-06-01',
    amount,
    currency: 'USD',
    direction,
    merchant_name: id,
    raw_description: id,
    masked_description: id,
    source_page: 1,
    source_line_ref: `CSV:Row-${seq}`,
    review_status: opts.review ?? 'ok',
    is_duplicate: false,
    duplicate_of_transaction_id: null,
    is_recurring: false,
    recurring_group_key: null,
    extraction_confidence: 0.97,
    created_at: '2026-11-08T00:00:00Z',
  };
  const c: TransactionClassificationRecord = {
    id: `c${seq}`,
    transaction_id: id,
    user_id: 'u1',
    initial_group: group,
    ai_group: group,
    user_confirmed_group: opts.overridden ? group : null,
    effective_group: group,
    sub_type: sub,
    schedule_c_category: cat,
    evidence_classification: evidence,
    business_use_pct: opts.businessPct ?? 100,
    meal_deduction_limit_pct: 100,
    is_user_overridden: Boolean(opts.overridden),
    confidence_score: 0.9,
    applied_rule_ref: 'test',
    reasoning: 'test',
    missing_evidence_items: [],
    supporting_document_id: 'd1',
    updated_at: '2026-11-08T00:00:00Z',
  };
  return { t, c };
}

function run(profile: UserProfileRecord, rows: Array<{ t: TransactionRecord; c: TransactionClassificationRecord }>) {
  return runDeterministicTaxCalculation({
    userId: 'u1',
    profile,
    transactions: rows.map((r) => r.t),
    classifications: rows.map((r) => r.c),
    ruleVersion: profile.tax_year === 2026 ? R26 : R25,
  });
}

describe('Rule tables match the IRS sources', () => {
  it('2025 reflects OBBBA (standard deduction, CTC, §179)', () => {
    const r = R25.rules_payload;
    expect(r.standard_deduction).toEqual({
      single: 15750,
      married_filing_jointly: 31500,
      married_filing_separately: 15750,
      head_of_household: 23625,
    });
    expect(r.child_tax_credit_per_child).toBe(2200);
    expect(r.section_179_max_deduction).toBe(2500000);
    expect(r.standard_mileage_rate_cents).toBe(70);
    expect(r.eitc[3].max_credit).toBe(8046);
  });
  it('2026 matches Rev. Proc. 2025-32', () => {
    const r = R26.rules_payload;
    expect(r.standard_deduction.single).toBe(16100);
    expect(r.standard_deduction.married_filing_jointly).toBe(32200);
    expect(r.standard_deduction.head_of_household).toBe(24150);
    expect(r.federal_brackets.single.map((b) => b.up_to)).toEqual([12400, 50400, 105700, 201775, 256225, 640600, null]);
    expect(r.qbi_threshold.single).toBe(201750);
    expect(r.qbi_phase_in_range.single).toBe(75000);
    expect(r.section_179_max_deduction).toBe(2560000);
    expect(r.eitc.map((c) => c.max_credit)).toEqual([664, 4427, 7316, 8231]);
    expect(r.standard_mileage_rate_change).toEqual({ effective_date: '2026-07-01', cents: 76 });
  });
});

describe('Regular tax (Tax Table under $100k, worksheet above)', () => {
  it('Tax Table: single 2025, taxable income $60,000 → $8,120 (midpoint $60,025)', () => {
    expect(computeProgressiveFederalTax(60000, 'single', R25.rules_payload.federal_brackets.single).tax).toBe(8120);
  });
  it('Worksheet: single 2025, $150,000 → $28,847.00', () => {
    expect(computeProgressiveFederalTax(150000, 'single', R25.rules_payload.federal_brackets.single).tax).toBe(28847);
  });
  it('Worksheet: MFJ 2026, $250,000 → $45,196.00', () => {
    expect(
      computeProgressiveFederalTax(250000, 'married_filing_jointly', R26.rules_payload.federal_brackets.married_filing_jointly).tax
    ).toBe(45196);
  });
});

describe('Earned income credit (EIC table method)', () => {
  const eic = (year: 2025 | 2026, fs: UserProfileRecord['filing_status'], kids: number, earned: number, agi = earned) =>
    computeEarnedIncomeCredit({
      rules: (year === 2025 ? R25 : R26).rules_payload,
      filingStatus: fs,
      qualifyingChildren: kids,
      earnedIncome: earned,
      agi,
    });
  it('plateau: 2025 single, 1 child, $20,000 → $4,328', () => expect(eic(2025, 'single', 1, 20000)).toBe(4328));
  it('phase-out: 2025 single, 1 child, $40,000 → $1,663', () => expect(eic(2025, 'single', 1, 40000)).toBe(1663));
  it('phase-in: 2025 single, no child, $5,000 → $384', () => expect(eic(2025, 'single', 0, 5000)).toBe(384));
  it('2026 MFJ, 2 children, $30,000 → $7,316', () => expect(eic(2026, 'married_filing_jointly', 2, 30000)).toBe(7316));
  it('at the completed phase-out amount → $0', () => expect(eic(2025, 'single', 1, 50434)).toBe(0));
  it('married filing separately → $0', () => expect(eic(2025, 'married_filing_separately', 1, 20000)).toBe(0));
});

describe('Dependent care credit rate (§21)', () => {
  it('2025: 27% at $30k AGI, 20% floor at $50k', () => {
    expect(childCareCreditRate(R25.rules_payload, 'single', 30000)).toBe(0.27);
    expect(childCareCreditRate(R25.rules_payload, 'single', 50000)).toBe(0.2);
  });
  it('2026 (OBBBA): 42% at $30k, 22% at $100k single, 22% at $200k MFJ', () => {
    expect(childCareCreditRate(R26.rules_payload, 'single', 30000)).toBe(0.42);
    expect(childCareCreditRate(R26.rules_payload, 'single', 100000)).toBe(0.22);
    expect(childCareCreditRate(R26.rules_payload, 'married_filing_jointly', 200000)).toBe(0.22);
  });
});

describe('Three scenarios — Schedule C sole proprietor, single, 2025', () => {
  const rows = [
    tx(122000, 'inflow', 'Income', 'freelance_1099_income', 'none', 'verified_by_document'),
    tx(2000, 'outflow', 'Business expenses', 'operating_expense', 'bank_and_payment_processing_fees', 'verified_by_document'),
    tx(40000, 'outflow', 'Business expenses', 'operating_expense', 'professional_services', 'verified_by_document', { overridden: true }),
    tx(40000, 'outflow', 'Business expenses', 'operating_expense', 'advertising_and_marketing', 'potentially_deductible_confirmation_required'),
  ];
  const r = run(PROFILE, rows);

  it('baseline (profit $120,000): total federal tax $28,727.46', () => {
    const b = r.scenarios.baseline;
    expect(b.schedule_c_net_profit).toBe(120000);
    expect(b.total_self_employment_tax).toBe(16955.46);
    expect(b.deductible_half_se_tax).toBe(8477.73);
    expect(b.qbi_deduction).toBe(19154.45);
    expect(b.taxable_income).toBe(76617.82);
    expect(b.regular_federal_income_tax).toBe(11772);
    expect(b.total_estimated_tax_liability).toBe(28727.46);
  });
  it('confirmed (profit $80,000): $16,690.64, $12,036.82 below baseline', () => {
    const c = r.scenarios.confirmed;
    expect(c.schedule_c_net_profit).toBe(80000);
    expect(c.taxable_income).toBe(46878.54);
    expect(c.regular_federal_income_tax).toBe(5387);
    expect(c.total_estimated_tax_liability).toBe(16690.64);
    expect(c.savings_vs_baseline).toBe(12036.82);
  });
  it('potential (profit $40,000): $7,468.82 and flagged as needing confirmation', () => {
    const p = r.scenarios.potential;
    expect(p.requires_user_confirmation).toBe(true);
    expect(p.taxable_income).toBe(17139.27);
    expect(p.total_estimated_tax_liability).toBe(7468.82);
    expect(p.savings_vs_baseline).toBe(21258.64);
  });
  it('a $40,000 deduction is not $40,000 of savings', () => {
    expect(r.scenarios.confirmed.savings_vs_baseline).toBeLessThan(40000);
  });
  it('is reproducible for the same inputs and rule version', () => {
    const again = run(PROFILE, rows);
    expect(again.scenarios).toEqual(r.scenarios);
  });
});

describe('Credits: refundable vs non-refundable', () => {
  it('HOH, 2 children, $30,000 wages (2025): CTC $638 + ACTC $3,400 + EITC $5,746', () => {
    const profile: UserProfileRecord = {
      ...PROFILE,
      filing_status: 'head_of_household',
      has_schedule_c: false,
      has_1099_income: false,
      has_w2_income: true,
      dependents_count: 2,
      qualifying_children_under_17: 2,
    };
    const r = run(profile, [tx(30000, 'inflow', 'Income', 'w2_wages', 'none', 'verified_by_document')]);
    const c = r.scenarios.confirmed;
    expect(c.taxable_income).toBe(6375);
    expect(c.regular_federal_income_tax).toBe(638);
    expect(c.nonrefundable_credits_used).toBe(638);
    expect(c.child_tax_credit).toBe(638 + 3400);
    expect(c.earned_income_tax_credit).toBe(5746);
    expect(c.refundable_credits).toBe(3400 + 5746);
    expect(c.total_estimated_tax_liability).toBe(0);
    expect(c.net_tax_owed_or_refund).toBe(-9146);
  });
});

describe('Vehicle, §179, state and scope guards', () => {
  const base = { ...PROFILE, vehicle_total_miles: 10000, vehicle_business_miles: 4000, vehicle_actual_expenses: 2000 };
  const income = tx(50000, 'inflow', 'Income', 'freelance_1099_income', 'none', 'verified_by_document');
  const gas = tx(500, 'outflow', 'Business expenses', 'operating_expense', 'vehicle_expenses', 'verified_by_document', { overridden: true });

  it('mileage stays out of the confirmed scenario until the mileage log is confirmed', () => {
    const c = run(base, [income, gas]).scenarios.confirmed;
    expect(c.vehicle_deduction).toBe(0);
    expect(c.schedule_c_expenses_by_category.vehicle_expenses).toBe(500);
  });
  it('with a confirmed log: 4,000 mi × 70¢ = $2,800 and fuel on the statement is not counted again', () => {
    const c = run({ ...base, vehicle_mileage_log_confirmed: true }, [income, gas]).scenarios.confirmed;
    expect(c.vehicle_deduction).toBe(2800);
    expect(c.vehicle_method).toBe('standard_mileage');
    expect(c.schedule_c_expenses_by_category.vehicle_expenses).toBe(0);
  });
  it('2026 mid-year rate: 600 mi × 72.5¢ + 400 mi × 76¢ = $739.00', () => {
    const v = computeVehicleDeduction({
      profile: { ...base, vehicle_business_miles: 1000, vehicle_business_miles_after_rate_change: 400 },
      standardMileageRateCents: R26.rules_payload.standard_mileage_rate_cents,
      rateChange: R26.rules_payload.standard_mileage_rate_change,
    });
    expect(v.standardMileageAmount).toBe(739);
  });
  it('§179 is refused for equipment with ≤50% business use and the run asks for review', () => {
    const laptop = tx(3000, 'outflow', 'Business expenses', 'operating_expense', 'depreciation_and_section_179', 'verified_by_document', {
      overridden: true,
      businessPct: 40,
    });
    const r = run(PROFILE, [income, laptop]);
    expect(r.scenarios.confirmed.section_179_and_depreciation).toBe(0);
    expect(r.status).toBe('additional_review_required');
  });
  it('state tax is never invented: CA is "not calculated", TX has none', () => {
    const ca = run({ ...PROFILE, state_code: 'CA' }, [income]).scenarios.confirmed;
    const tx_ = run(PROFILE, [income]).scenarios.confirmed;
    expect(ca.state_tax_status).toBe('not_calculated');
    expect(ca.estimated_state_income_tax).toBe(0);
    expect(tx_.state_tax_status).toBe('no_wage_income_tax');
    expect(ca.total_estimated_tax_liability).toBe(tx_.total_estimated_tax_liability);
  });
  it('rows needing review are left out of every total', () => {
    const blurry = tx(9999, 'outflow', 'Business expenses', 'operating_expense', 'office_expenses', 'potentially_deductible_confirmation_required', {
      review: 'needs_review',
    });
    const r = run(PROFILE, [income, blurry]);
    expect(r.scenarios.potential.schedule_c_expenses_by_category.office_expenses).toBe(0);
    expect(r.input_snapshot.transactions_needing_review).toBe(1);
  });
  it('unsupported entities produce "Additional tax review required"', () => {
    const r = run({ ...PROFILE, has_unsupported_complex_entity: true }, [income]);
    expect(r.status).toBe('additional_review_required');
    expect(r.additional_review_reasons[0]).toMatch(/Additional tax review required/);
  });
});

describe('Classification never treats a merchant name as proof', () => {
  const mk = (desc: string): TransactionRecord => ({
    ...tx(100, 'outflow', 'Business expenses', 'operating_expense', 'none', 'non_deductible').t,
    merchant_name: desc,
    raw_description: desc,
  });
  it('Staples / WeWork / CPA → confirmation required, not "verified"', () => {
    for (const d of ['Staples Office Supplies', 'WeWork Dedicated Desk', 'Smith CPA Bookkeeping', 'Google Ads Campaign']) {
      expect(classifyTransactionRecord({ tx: mk(d) }).evidence_classification).toBe('potentially_deductible_confirmation_required');
    }
  });
  it('Amazon → additional information required', () => {
    expect(classifyTransactionRecord({ tx: mk('Amazon.com Marketplace') }).evidence_classification).toBe('additional_info_required');
  });
});

describe('Document intelligence reads real files', () => {
  it('extracts statement lines from a real (text-based) PDF', async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    doc.text(['Withdrawals', '03/14/2025 GOOGLE ADS CAMPAIGN 250.00 4,750.00', '03/20/2025 STAPLES STORE 42.10 4,707.90'], 10, 20);
    const buffer = Buffer.from(doc.output('arraybuffer'));
    const out = await extractTransactionsFromContent({ filename: 'statement.pdf', format: 'PDF', buffer, taxYear: 2025 });
    expect(out.extractionError).toBeNull();
    expect(out.extractedRows).toHaveLength(2);
    expect(out.extractedRows[0]).toMatchObject({ transaction_date: '2025-03-14', amount: 250, direction: 'outflow' });
  });
  it('a PDF without readable text yields an error and no invented rows', async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    doc.rect(10, 10, 80, 80, 'F'); // graphics only, like a scan
    const buffer = Buffer.from(doc.output('arraybuffer'));
    const out = await extractTransactionsFromContent({ filename: 'scan.pdf', format: 'PDF', buffer, taxYear: 2025 });
    expect(out.extractedRows).toHaveLength(0);
    expect(out.extractionError).toBeTruthy();
  });
});
