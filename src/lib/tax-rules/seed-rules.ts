import { EitcColumn, FilingStatus, TaxRuleVersionRecord, TaxYearRulesPayload } from '@/types/tax';

/**
 * Versioned federal rule tables.
 *
 * Every figure below was checked against the primary IRS source listed in
 * `official_sources` on 2026-11-08. 2025 figures reflect the One Big Beautiful
 * Bill Act (OBBBA, P.L. 119-21, signed 2025-07-04), which changed the 2025
 * standard deduction, child tax credit and §179 limits after Rev. Proc. 2024-40
 * was published. Do not edit a figure without updating the source and
 * `last_verified_at`; the reference tests in src/tests pin these values.
 */

const NO_WAGE_INCOME_TAX_STATES = ['AK', 'FL', 'NV', 'NH', 'SD', 'TN', 'TX', 'WA', 'WY'];

function byStatus<T>(single: T, mfj: T, mfs: T, hoh: T): Record<FilingStatus, T> {
  return {
    single,
    married_filing_jointly: mfj,
    married_filing_separately: mfs,
    head_of_household: hoh,
  };
}

// Statutory EITC rates, IRC §32(b)(1): [credit rate, phase-out rate] by number of children.
const EITC_RATES: Array<[number, number]> = [
  [0.0765, 0.0765],
  [0.34, 0.1598],
  [0.4, 0.2106],
  [0.45, 0.2106],
];

function eitcColumns(
  rows: Array<[number, number, number, number, number, number]>
): [EitcColumn, EitcColumn, EitcColumn, EitcColumn] {
  // row = [earned income amount, max credit, threshold MFJ, completed MFJ, threshold other, completed other]
  return rows.map((r, i) => ({
    credit_rate: EITC_RATES[i][0],
    phaseout_rate: EITC_RATES[i][1],
    earned_income_amount: r[0],
    max_credit: r[1],
    threshold_phaseout_mfj: r[2],
    completed_phaseout_mfj: r[3],
    threshold_phaseout_other: r[4],
    completed_phaseout_other: r[5],
  })) as [EitcColumn, EitcColumn, EitcColumn, EitcColumn];
}

const COMMON = {
  social_security_rate: 0.124,
  medicare_rate: 0.029,
  additional_medicare_rate: 0.009,
  additional_medicare_threshold: byStatus(200000, 250000, 125000, 200000),
  se_net_earnings_factor: 0.9235,
  se_deductible_half_factor: 0.5,
  qbi_deduction_rate: 0.2,
  home_office_simplified_rate_per_sqft: 5,
  home_office_simplified_max_sqft: 300,
  meals_deduction_factor: 0.5,
  sep_ira_rate: 0.2,
  child_tax_credit_phaseout_start: byStatus(200000, 400000, 200000, 200000),
  child_tax_credit_phaseout_per_1000: 50,
  other_dependent_credit: 500,
  actc_earned_income_threshold: 2500,
  actc_rate: 0.15,
  child_care_max_one_dependent: 3000,
  child_care_max_two_plus_dependents: 6000,
  aotc_max_credit: 2500,
  aotc_refundable_share: 0.4,
  llc_max_credit: 2000,
  // §25A(d) phase-out is not indexed: $80k–$90k ($160k–$180k MFJ). MFS cannot claim.
  education_phaseout: byStatus(
    { start: 80000, end: 90000 },
    { start: 160000, end: 180000 },
    { start: 0, end: 0 },
    { start: 80000, end: 90000 }
  ),
  states_without_wage_income_tax: NO_WAGE_INCOME_TAX_STATES,
};

const RULES_2025: TaxYearRulesPayload = {
  ...COMMON,
  tax_year: 2025,
  // OBBBA §70102 (Rev. Proc. 2025-32 §2.08 restates them)
  standard_deduction: byStatus(15750, 31500, 15750, 23625),
  social_security_wage_base: 176100,
  qbi_threshold: byStatus(197300, 394600, 197300, 197300),
  qbi_phase_in_range: byStatus(50000, 100000, 50000, 50000),
  qbi_minimum_deduction: 0,
  qbi_minimum_deduction_qbi_floor: 0,
  standard_mileage_rate_cents: 70,
  standard_mileage_rate_change: null,
  // OBBBA §70306: $2.5M / $4M for tax years beginning after 2024
  section_179_max_deduction: 2500000,
  section_179_phaseout_threshold: 4000000,
  sep_ira_dollar_limit: 70000,
  // OBBBA §70101: $2,200 from 2025; refundable portion $1,700
  child_tax_credit_per_child: 2200,
  child_tax_credit_refundable_cap: 1700,
  // 2025: 35% reduced 1 point per $2,000 of AGI over $15,000, floor 20%
  child_care_rate_schedule: {
    max_rate: 0.35,
    first_reduction_agi: 15000,
    first_floor_rate: 0.2,
    second_reduction_agi: null,
    second_reduction_step: null,
    final_floor_rate: 0.2,
  },
  // Rev. Proc. 2024-40 §3.06
  eitc: eitcColumns([
    [8490, 649, 17730, 26214, 10620, 19104],
    [12730, 4328, 30470, 57554, 23350, 50434],
    [17880, 7152, 30470, 64430, 23350, 57310],
    [17880, 8046, 30470, 68675, 23350, 61555],
  ]),
  eitc_investment_income_limit: 11950,
  federal_brackets: {
    single: [
      { up_to: 11925, rate: 0.1 },
      { up_to: 48475, rate: 0.12 },
      { up_to: 103350, rate: 0.22 },
      { up_to: 197300, rate: 0.24 },
      { up_to: 250525, rate: 0.32 },
      { up_to: 626350, rate: 0.35 },
      { up_to: null, rate: 0.37 },
    ],
    married_filing_jointly: [
      { up_to: 23850, rate: 0.1 },
      { up_to: 96950, rate: 0.12 },
      { up_to: 206700, rate: 0.22 },
      { up_to: 394600, rate: 0.24 },
      { up_to: 501050, rate: 0.32 },
      { up_to: 751600, rate: 0.35 },
      { up_to: null, rate: 0.37 },
    ],
    married_filing_separately: [
      { up_to: 11925, rate: 0.1 },
      { up_to: 48475, rate: 0.12 },
      { up_to: 103350, rate: 0.22 },
      { up_to: 197300, rate: 0.24 },
      { up_to: 250525, rate: 0.32 },
      { up_to: 375800, rate: 0.35 },
      { up_to: null, rate: 0.37 },
    ],
    head_of_household: [
      { up_to: 17000, rate: 0.1 },
      { up_to: 64850, rate: 0.12 },
      { up_to: 103350, rate: 0.22 },
      { up_to: 197300, rate: 0.24 },
      { up_to: 250500, rate: 0.32 },
      { up_to: 626350, rate: 0.35 },
      { up_to: null, rate: 0.37 },
    ],
  },
};

const RULES_2026: TaxYearRulesPayload = {
  ...COMMON,
  tax_year: 2026,
  // Rev. Proc. 2025-32 §4.14
  standard_deduction: byStatus(16100, 32200, 16100, 24150),
  // SSA 2026 contribution and benefit base
  social_security_wage_base: 184500,
  // Rev. Proc. 2025-32 §4.26 (phase-in range widened to $75k / $150k by OBBBA)
  qbi_threshold: byStatus(201750, 403500, 201775, 201750),
  qbi_phase_in_range: byStatus(75000, 150000, 75000, 75000),
  // OBBBA §70105: $400 minimum deduction if QBI from active businesses ≥ $1,000 (from 2026)
  qbi_minimum_deduction: 400,
  qbi_minimum_deduction_qbi_floor: 1000,
  // Notice 2026-10 (72.5¢), modified by Announcement 2026-11: 76¢ from 1 July 2026
  standard_mileage_rate_cents: 72.5,
  standard_mileage_rate_change: { effective_date: '2026-07-01', cents: 76 },
  // Rev. Proc. 2025-32 §4.24
  section_179_max_deduction: 2560000,
  section_179_phaseout_threshold: 4090000,
  sep_ira_dollar_limit: 72000,
  // Rev. Proc. 2025-32 §4.05
  child_tax_credit_per_child: 2200,
  child_tax_credit_refundable_cap: 1700,
  // OBBBA §70405 (from 2026): 50% reduced 1 point per $2,000 over $15,000 to 35%,
  // then 1 point per $2,000 ($4,000 MFJ) over $75,000 ($150,000 MFJ) down to 20%
  child_care_rate_schedule: {
    max_rate: 0.5,
    first_reduction_agi: 15000,
    first_floor_rate: 0.35,
    second_reduction_agi: byStatus(75000, 150000, 75000, 75000),
    second_reduction_step: byStatus(2000, 4000, 2000, 2000),
    final_floor_rate: 0.2,
  },
  // Rev. Proc. 2025-32 §4.06
  eitc: eitcColumns([
    [8680, 664, 18140, 26820, 10860, 19540],
    [13020, 4427, 31160, 58863, 23890, 51593],
    [18290, 7316, 31160, 65899, 23890, 58629],
    [18290, 8231, 31160, 70244, 23890, 62974],
  ]),
  eitc_investment_income_limit: 12200,
  // Rev. Proc. 2025-32 §4.01 Tables 1–4
  federal_brackets: {
    single: [
      { up_to: 12400, rate: 0.1 },
      { up_to: 50400, rate: 0.12 },
      { up_to: 105700, rate: 0.22 },
      { up_to: 201775, rate: 0.24 },
      { up_to: 256225, rate: 0.32 },
      { up_to: 640600, rate: 0.35 },
      { up_to: null, rate: 0.37 },
    ],
    married_filing_jointly: [
      { up_to: 24800, rate: 0.1 },
      { up_to: 100800, rate: 0.12 },
      { up_to: 211400, rate: 0.22 },
      { up_to: 403550, rate: 0.24 },
      { up_to: 512450, rate: 0.32 },
      { up_to: 768700, rate: 0.35 },
      { up_to: null, rate: 0.37 },
    ],
    married_filing_separately: [
      { up_to: 12400, rate: 0.1 },
      { up_to: 50400, rate: 0.12 },
      { up_to: 105700, rate: 0.22 },
      { up_to: 201775, rate: 0.24 },
      { up_to: 256225, rate: 0.32 },
      { up_to: 384350, rate: 0.35 },
      { up_to: null, rate: 0.37 },
    ],
    head_of_household: [
      { up_to: 17700, rate: 0.1 },
      { up_to: 67450, rate: 0.12 },
      { up_to: 105700, rate: 0.22 },
      { up_to: 201750, rate: 0.24 },
      { up_to: 256200, rate: 0.32 },
      { up_to: 640600, rate: 0.35 },
      { up_to: null, rate: 0.37 },
    ],
  },
};

export const SEEDED_TAX_RULE_VERSIONS: TaxRuleVersionRecord[] = [
  {
    version_id: 'IRS-2025.3',
    tax_year: 2025,
    effective_date: '2025-01-01',
    last_verified_at: '2026-11-08T00:00:00Z',
    status: 'active',
    official_sources: [
      {
        form_or_pub: 'Rev. Proc. 2024-40',
        title: '2025 brackets, EITC table, phase-outs',
        url: 'https://www.irs.gov/pub/irs-drop/rp-24-40.pdf',
      },
      {
        form_or_pub: 'Rev. Proc. 2025-32 §2–3 (OBBBA changes for 2025)',
        title: '2025 standard deduction $15,750/$31,500/$23,625, CTC $2,200, §179 $2.5M/$4M',
        url: 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf',
      },
      {
        form_or_pub: 'Notice 2025-5',
        title: '2025 business standard mileage rate 70¢',
        url: 'https://www.irs.gov/tax-professionals/standard-mileage-rates',
      },
    ],
    rules_payload: RULES_2025,
  },
  {
    version_id: 'IRS-2026.2',
    tax_year: 2026,
    effective_date: '2026-01-01',
    last_verified_at: '2026-11-08T00:00:00Z',
    status: 'active',
    official_sources: [
      {
        form_or_pub: 'Rev. Proc. 2025-32',
        title: '2026 brackets, standard deduction, EITC, CTC, §179, §199A',
        url: 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf',
      },
      {
        form_or_pub: 'Notice 2026-10 / Announcement 2026-11',
        title: '2026 business mileage 72.5¢ (Jan–Jun), 76¢ from 1 Jul 2026',
        url: 'https://www.irs.gov/tax-professionals/standard-mileage-rates',
      },
      {
        form_or_pub: 'P.L. 119-21 (OBBBA) §70105, §70405',
        title: '§199A minimum deduction; §21 dependent care credit rates from 2026',
        url: 'https://www.congress.gov/bill/119th-congress/house-bill/1',
      },
    ],
    rules_payload: RULES_2026,
  },
];

export function getTaxRulesForYear(taxYear: 2025 | 2026): TaxRuleVersionRecord {
  const found = SEEDED_TAX_RULE_VERSIONS.find(
    (v) => v.tax_year === taxYear && v.status === 'active'
  );
  if (!found) {
    throw new Error(`No active tax rule version for ${taxYear}`);
  }
  return found;
}
