import {
  CalculationRunRecord,
  FilingStatus,
  ScheduleCCategory,
  ScenarioTaxBreakdown,
  TaxRuleVersionRecord,
  TaxYearRulesPayload,
  TransactionClassificationRecord,
  TransactionRecord,
  UserProfileRecord,
} from '@/types/tax';

/**
 * Deterministic federal tax engine (Form 1040 + Schedule C/SE, standard deduction only).
 *
 * Scope and simplifications are listed in TAX_ENGINE.md. Anything outside scope must
 * produce "Additional tax review required", never an invented number.
 */

export const ALL_SCHEDULE_C_CATEGORIES: ScheduleCCategory[] = [
  'advertising_and_marketing',
  'office_expenses',
  'software_and_subscriptions',
  'professional_services',
  'business_insurance',
  'bank_and_payment_processing_fees',
  'business_travel',
  'business_mileage',
  'eligible_business_meals',
  'equipment_and_supplies',
  'rent',
  'utilities',
  'telephone_and_internet',
  'education_and_training',
  'vehicle_expenses',
  'home_office',
  'depreciation_and_section_179',
  'other_eligible_business_expenses',
  'none',
];

export const ENGINE_VERSION = 'engine-3.0.0';

type ScenarioId = 'baseline' | 'confirmed' | 'potential';

function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Exact bracket computation (used for taxable income of $100,000 and over). */
function bracketTax(
  taxableIncome: number,
  brackets: Array<{ up_to: number | null; rate: number }>
): { tax: number; marginalRate: number } {
  let remaining = taxableIncome;
  let previousLimit = 0;
  let totalTax = 0;
  let marginalRate = brackets[0]?.rate ?? 0.1;
  for (const bracket of brackets) {
    if (remaining <= 0) break;
    marginalRate = bracket.rate;
    if (bracket.up_to === null) {
      totalTax += remaining * bracket.rate;
      remaining = 0;
    } else {
      const taxableInBand = Math.min(remaining, Math.max(0, bracket.up_to - previousLimit));
      totalTax += taxableInBand * bracket.rate;
      remaining -= taxableInBand;
      previousLimit = bracket.up_to;
    }
  }
  return { tax: totalTax, marginalRate };
}

/**
 * Regular federal income tax as the IRS computes it:
 * - taxable income under $100,000 → Tax Table (tax on the midpoint of the $25/$50 row, rounded to whole dollars)
 * - $100,000 and over → Tax Computation Worksheet (exact brackets), rounded to cents.
 */
export function computeProgressiveFederalTax(
  taxableIncome: number,
  _filingStatus: FilingStatus,
  brackets: Array<{ up_to: number | null; rate: number }>
): { tax: number; marginalRate: number } {
  if (taxableIncome <= 0) {
    return { tax: 0, marginalRate: brackets[0]?.rate ?? 0.1 };
  }
  if (taxableIncome < 100000) {
    let midpoint: number;
    if (taxableIncome < 5) return { tax: 0, marginalRate: brackets[0].rate };
    if (taxableIncome < 15) midpoint = 10;
    else if (taxableIncome < 25) midpoint = 20;
    else if (taxableIncome < 3000) midpoint = Math.floor(taxableIncome / 25) * 25 + 12.5;
    else midpoint = Math.floor(taxableIncome / 50) * 50 + 25;
    const { tax, marginalRate } = bracketTax(midpoint, brackets);
    return { tax: Math.round(tax), marginalRate };
  }
  const { tax, marginalRate } = bracketTax(taxableIncome, brackets);
  return { tax: round2(tax), marginalRate };
}

export function computeHomeOfficeDeduction(params: {
  profile: UserProfileRecord;
  tentativeScheduleCProfit: number;
  simplifiedRatePerSqFt: number;
  simplifiedMaxSqFt: number;
}): {
  deduction: number;
  methodUsed: 'simplified' | 'regular' | 'ineligible';
  simplifiedAmount: number;
  regularAmount: number;
} {
  const { profile, tentativeScheduleCProfit, simplifiedRatePerSqFt, simplifiedMaxSqFt } = params;
  if (
    profile.home_office_sqft <= 0 ||
    profile.home_total_sqft <= 0 ||
    tentativeScheduleCProfit <= 0
  ) {
    return { deduction: 0, methodUsed: 'ineligible', simplifiedAmount: 0, regularAmount: 0 };
  }

  const simplifiedRaw = round2(
    Math.min(profile.home_office_sqft, simplifiedMaxSqFt) * simplifiedRatePerSqFt
  );
  const businessPct = Math.min(1, profile.home_office_sqft / profile.home_total_sqft);
  const regularRaw = round2(
    (profile.home_annual_rent_or_mortgage_interest + profile.home_annual_utilities_insurance) *
      businessPct
  );

  // IRC §280A(c)(5): limited to the gross income from the business use less other expenses
  const simplifiedCapped = Math.min(simplifiedRaw, tentativeScheduleCProfit);
  const regularCapped = Math.min(regularRaw, tentativeScheduleCProfit);

  if (regularCapped > simplifiedCapped) {
    return {
      deduction: regularCapped,
      methodUsed: 'regular',
      simplifiedAmount: simplifiedCapped,
      regularAmount: regularCapped,
    };
  }
  return {
    deduction: simplifiedCapped,
    methodUsed: 'simplified',
    simplifiedAmount: simplifiedCapped,
    regularAmount: regularCapped,
  };
}

export function computeVehicleDeduction(params: {
  profile: UserProfileRecord;
  standardMileageRateCents: number;
  rateChange?: { effective_date: string; cents: number } | null;
}): {
  deduction: number;
  methodUsed: 'standard_mileage' | 'actual_expenses' | 'none';
  standardMileageAmount: number;
  actualExpenseAmount: number;
} {
  const { profile, standardMileageRateCents, rateChange } = params;
  if (profile.vehicle_business_miles <= 0 || profile.vehicle_total_miles <= 0) {
    return { deduction: 0, methodUsed: 'none', standardMileageAmount: 0, actualExpenseAmount: 0 };
  }

  const businessMiles = Math.min(profile.vehicle_business_miles, profile.vehicle_total_miles);
  // Miles after a mid-year rate change get the new rate; without a split, the lower
  // Jan-1 rate is used for all miles (conservative).
  const milesAfterChange = rateChange
    ? clamp(profile.vehicle_business_miles_after_rate_change || 0, 0, businessMiles)
    : 0;
  const standardMileageAmount = round2(
    ((businessMiles - milesAfterChange) * standardMileageRateCents +
      milesAfterChange * (rateChange?.cents ?? standardMileageRateCents)) /
      100
  );
  const actualExpenseAmount = round2(
    profile.vehicle_actual_expenses * (businessMiles / profile.vehicle_total_miles)
  );

  if (standardMileageAmount >= actualExpenseAmount) {
    return {
      deduction: standardMileageAmount,
      methodUsed: 'standard_mileage',
      standardMileageAmount,
      actualExpenseAmount,
    };
  }
  return {
    deduction: actualExpenseAmount,
    methodUsed: 'actual_expenses',
    standardMileageAmount,
    actualExpenseAmount,
  };
}

/** EITC as the IRS EIC Table computes it: credit at the midpoint of each $50 row, whole dollars. */
export function computeEarnedIncomeCredit(params: {
  rules: TaxYearRulesPayload;
  filingStatus: FilingStatus;
  qualifyingChildren: number;
  earnedIncome: number;
  agi: number;
}): number {
  const { rules, filingStatus, earnedIncome, agi } = params;
  if (filingStatus === 'married_filing_separately') return 0;
  if (earnedIncome <= 0) return 0;
  const col = rules.eitc[clamp(Math.floor(params.qualifyingChildren), 0, 3)];
  const mfj = filingStatus === 'married_filing_jointly';
  const threshold = mfj ? col.threshold_phaseout_mfj : col.threshold_phaseout_other;
  const completed = mfj ? col.completed_phaseout_mfj : col.completed_phaseout_other;
  if (earnedIncome >= completed || agi >= completed) return 0;

  const at = (income: number): number => {
    const mid = Math.floor(income / 50) * 50 + 25;
    const phaseIn = Math.min(col.credit_rate * mid, col.max_credit);
    const reduction = Math.max(0, col.phaseout_rate * (mid - threshold));
    return Math.max(0, Math.round(phaseIn - reduction));
  };

  let credit = at(earnedIncome);
  if (agi !== earnedIncome && agi >= threshold) {
    credit = Math.min(credit, at(Math.max(0, agi)));
  }
  return credit;
}

/** §21 applicable percentage for the year's schedule. */
export function childCareCreditRate(
  rules: TaxYearRulesPayload,
  filingStatus: FilingStatus,
  agi: number
): number {
  const s = rules.child_care_rate_schedule;
  let rate = s.max_rate;
  if (agi > s.first_reduction_agi) {
    const steps = Math.ceil((agi - s.first_reduction_agi) / 2000);
    rate = Math.max(s.first_floor_rate, s.max_rate - steps * 0.01);
  }
  if (s.second_reduction_agi && s.second_reduction_step) {
    const start = s.second_reduction_agi[filingStatus];
    if (agi > start) {
      const steps = Math.ceil((agi - start) / s.second_reduction_step[filingStatus]);
      rate = Math.max(s.final_floor_rate, rate - steps * 0.01);
    }
  }
  return Math.max(s.final_floor_rate, round2(rate * 100) / 100);
}

/** Business expenses that a scenario counts, after business-use % and the 50% meals limit. */
export function aggregateScenarioExpenses(params: {
  scenarioId: ScenarioId;
  transactions: TransactionRecord[];
  classifications: TransactionClassificationRecord[];
  rules: TaxYearRulesPayload;
  excludeTransactionIds?: Set<string>;
}): {
  w2Income: number;
  businessGross: number;
  otherIncome: number;
  expensesByCategory: Record<ScheduleCCategory, number>;
  /** §179 candidates whose business use is ≤ 50% (cannot be expensed; depreciation not computed). */
  section179Ineligible: number;
  needsReviewCount: number;
} {
  const { scenarioId, transactions, classifications, rules, excludeTransactionIds } = params;
  const clsByTxId = new Map<string, TransactionClassificationRecord>();
  for (const c of classifications) clsByTxId.set(c.transaction_id, c);

  let w2Income = 0;
  let businessGross = 0;
  let otherIncome = 0;
  let section179Ineligible = 0;
  let needsReviewCount = 0;
  const expensesByCategory = Object.fromEntries(
    ALL_SCHEDULE_C_CATEGORIES.map((c) => [c, 0])
  ) as Record<ScheduleCCategory, number>;

  for (const tx of transactions) {
    if (excludeTransactionIds?.has(tx.id)) continue;
    if (tx.review_status === 'needs_review') {
      needsReviewCount += 1;
      continue;
    }
    if (
      tx.is_duplicate ||
      tx.review_status === 'duplicate_excluded' ||
      tx.review_status === 'transfer_excluded' ||
      tx.review_status === 'cc_repayment_excluded'
    ) {
      continue;
    }
    const cls = clsByTxId.get(tx.id);
    if (!cls || cls.effective_group === 'Non-expense transactions') continue;

    if (cls.effective_group === 'Income') {
      if (cls.sub_type === 'w2_wages') w2Income = round2(w2Income + tx.amount);
      else if (cls.sub_type === 'freelance_1099_income' || cls.sub_type === 'business_gross_receipts') {
        businessGross = round2(businessGross + tx.amount);
      } else otherIncome = round2(otherIncome + tx.amount);
      continue;
    }

    if (cls.effective_group !== 'Business expenses') continue;

    const ev = cls.evidence_classification;
    const userConfirmed = cls.is_user_overridden;
    let include = false;
    if (scenarioId === 'baseline') {
      // Only expenses already proven by a document, without anything the user confirmed here.
      include = ev === 'verified_by_document' && !userConfirmed;
    } else if (scenarioId === 'confirmed') {
      include =
        ev === 'verified_by_document' || (userConfirmed && ev === 'partially_deductible');
    } else {
      include =
        ev === 'verified_by_document' ||
        ev === 'potentially_deductible_confirmation_required' ||
        ev === 'partially_deductible' ||
        ev === 'additional_info_required';
    }
    if (!include) continue;

    const businessPct = clamp(cls.business_use_pct, 0, 100) / 100;
    const cat: ScheduleCCategory =
      cls.schedule_c_category && cls.schedule_c_category !== 'none'
        ? cls.schedule_c_category
        : 'other_eligible_business_expenses';

    // §179 requires more than 50% business use; below that the asset must be depreciated (not computed here).
    if (cat === 'depreciation_and_section_179' && businessPct <= 0.5) {
      section179Ineligible = round2(section179Ineligible + tx.amount * businessPct);
      continue;
    }

    const mealFactor = cat === 'eligible_business_meals' ? rules.meals_deduction_factor : 1;
    expensesByCategory[cat] = round2(expensesByCategory[cat] + tx.amount * businessPct * mealFactor);
  }

  return { w2Income, businessGross, otherIncome, expensesByCategory, section179Ineligible, needsReviewCount };
}

interface ScenarioToggles {
  vehicle: boolean;
  homeOffice: boolean;
  seHealthInsurance: boolean;
  retirement: boolean;
  credits: boolean;
}

function togglesFor(scenarioId: ScenarioId, profile: UserProfileRecord): ScenarioToggles {
  if (scenarioId === 'baseline') {
    return { vehicle: false, homeOffice: false, seHealthInsurance: false, retirement: false, credits: true };
  }
  if (scenarioId === 'confirmed') {
    return {
      vehicle: Boolean(profile.vehicle_mileage_log_confirmed),
      homeOffice: Boolean(profile.home_office_exclusive_regular_use),
      seHealthInsurance: true,
      retirement: true,
      credits: true,
    };
  }
  return { vehicle: true, homeOffice: true, seHealthInsurance: true, retirement: true, credits: true };
}

function computeScenario(params: {
  scenarioId: ScenarioId;
  scenarioLabel: string;
  profile: UserProfileRecord;
  rules: TaxYearRulesPayload;
  agg: ReturnType<typeof aggregateScenarioExpenses>;
  toggles: ScenarioToggles;
  baselineNetPosition?: number;
  formulaTrace?: CalculationRunRecord['formula_trace'];
  ruleVersionId: string;
}): ScenarioTaxBreakdown {
  const { scenarioId, scenarioLabel, profile, rules, agg, toggles, baselineNetPosition, formulaTrace } = params;
  const fs = profile.filing_status;
  const expensesByCategory = { ...agg.expensesByCategory };
  const { w2Income, businessGross, otherIncome } = agg;
  const totalGrossIncome = round2(w2Income + businessGross + otherIncome);
  const hasBusiness = profile.has_schedule_c || businessGross > 0;

  // Vehicle: profile-based deduction replaces vehicle_expenses transactions (no double counting).
  let vehicleDeduction = 0;
  let vehicleMethod: ScenarioTaxBreakdown['vehicle_method'] = 'none';
  if (toggles.vehicle && hasBusiness) {
    const veh = computeVehicleDeduction({
      profile,
      standardMileageRateCents: rules.standard_mileage_rate_cents,
      rateChange: rules.standard_mileage_rate_change,
    });
    if (veh.deduction > 0) {
      vehicleDeduction = veh.deduction;
      vehicleMethod = veh.methodUsed;
      expensesByCategory.vehicle_expenses = 0;
    }
  }
  expensesByCategory.business_mileage = vehicleDeduction;

  let operatingExpensesTotal = 0;
  for (const [cat, amt] of Object.entries(expensesByCategory) as Array<[ScheduleCCategory, number]>) {
    if (cat === 'none' || cat === 'depreciation_and_section_179' || cat === 'business_mileage' || cat === 'home_office') continue;
    operatingExpensesTotal = round2(operatingExpensesTotal + amt);
  }

  // §179: dollar limit, and limited to taxable income from active trades/businesses (incl. wages), §179(b)(3).
  const section179Requested = expensesByCategory.depreciation_and_section_179;
  const businessIncomeLimit = Math.max(
    0,
    round2(w2Income + businessGross - operatingExpensesTotal - vehicleDeduction)
  );
  const section179AndDepreciation = round2(
    Math.min(section179Requested, rules.section_179_max_deduction, businessIncomeLimit)
  );
  expensesByCategory.depreciation_and_section_179 = section179AndDepreciation;

  const tentativeProfit = round2(
    businessGross - operatingExpensesTotal - section179AndDepreciation - vehicleDeduction
  );

  let homeOfficeDeduction = 0;
  let homeOfficeMethod: ScenarioTaxBreakdown['home_office_method'] = 'ineligible';
  if (toggles.homeOffice && hasBusiness) {
    const ho = computeHomeOfficeDeduction({
      profile,
      tentativeScheduleCProfit: Math.max(0, tentativeProfit),
      simplifiedRatePerSqFt: rules.home_office_simplified_rate_per_sqft,
      simplifiedMaxSqFt: rules.home_office_simplified_max_sqft,
    });
    homeOfficeDeduction = ho.deduction;
    homeOfficeMethod = ho.methodUsed;
  }
  expensesByCategory.home_office = homeOfficeDeduction;

  const totalScheduleCDeductions = round2(
    operatingExpensesTotal + section179AndDepreciation + vehicleDeduction + homeOfficeDeduction
  );
  const scheduleCNetProfit = round2(businessGross - totalScheduleCDeductions);
  const positiveProfit = Math.max(0, scheduleCNetProfit);

  // Schedule SE
  const netEarningsFromSE =
    positiveProfit * rules.se_net_earnings_factor >= 400
      ? round2(positiveProfit * rules.se_net_earnings_factor)
      : 0;
  const remainingWageBase = Math.max(0, rules.social_security_wage_base - w2Income);
  const seTaxOASDI = round2(Math.min(netEarningsFromSE, remainingWageBase) * rules.social_security_rate);
  const seTaxMedicare = round2(netEarningsFromSE * rules.medicare_rate);
  const totalSelfEmploymentTax = round2(seTaxOASDI + seTaxMedicare);
  const deductibleHalfSETax = round2(totalSelfEmploymentTax * rules.se_deductible_half_factor);

  // Form 8959 Additional Medicare Tax (wages + SE earnings over the threshold)
  const additionalMedicareTax = round2(
    Math.max(0, w2Income + netEarningsFromSE - rules.additional_medicare_threshold[fs]) *
      rules.additional_medicare_rate
  );

  // Adjustments: retirement first, then SE health insurance (Pub. 535 ordering)
  const profitAfterHalfSE = Math.max(0, round2(positiveProfit - deductibleHalfSETax));
  const retirementContributionDeduction = toggles.retirement
    ? round2(
        Math.min(
          profile.sep_ira_solo_401k_contributions,
          profitAfterHalfSE * rules.sep_ira_rate,
          rules.sep_ira_dollar_limit
        )
      )
    : 0;
  const seHealthInsuranceDeduction = toggles.seHealthInsurance
    ? round2(
        Math.min(
          profile.self_employed_health_insurance_premiums,
          Math.max(0, profitAfterHalfSE - retirementContributionDeduction)
        )
      )
    : 0;
  const totalAboveTheLineAdjustments = round2(
    deductibleHalfSETax + seHealthInsuranceDeduction + retirementContributionDeduction
  );

  // A Schedule C loss offsets other income.
  const adjustedGrossIncome = round2(
    w2Income + otherIncome + scheduleCNetProfit - totalAboveTheLineAdjustments
  );
  const standardDeduction = rules.standard_deduction[fs];
  const taxableIncomeBeforeQBI = Math.max(0, round2(adjustedGrossIncome - standardDeduction));

  // §199A — sole proprietor with no W-2 employees and no qualified property: the deduction
  // phases out linearly across the phase-in range whether or not the business is an SSTB.
  let qbiDeduction = 0;
  const netQBI = round2(
    scheduleCNetProfit - deductibleHalfSETax - seHealthInsuranceDeduction - retirementContributionDeduction
  );
  if (netQBI > 0) {
    const start = rules.qbi_threshold[fs];
    const range = rules.qbi_phase_in_range[fs];
    const phaseFactor =
      taxableIncomeBeforeQBI <= start ? 1 : Math.max(0, 1 - (taxableIncomeBeforeQBI - start) / range);
    let deduction = round2(netQBI * rules.qbi_deduction_rate * phaseFactor);
    if (rules.qbi_minimum_deduction > 0 && netQBI >= rules.qbi_minimum_deduction_qbi_floor) {
      deduction = Math.max(deduction, rules.qbi_minimum_deduction);
    }
    qbiDeduction = round2(Math.min(deduction, taxableIncomeBeforeQBI * rules.qbi_deduction_rate));
  }
  const taxableIncome = Math.max(0, round2(taxableIncomeBeforeQBI - qbiDeduction));

  const { tax: regularFederalIncomeTax, marginalRate } = computeProgressiveFederalTax(
    taxableIncome,
    fs,
    rules.federal_brackets[fs]
  );

  // ---------- Credits ----------
  const seEarnedIncome = scheduleCNetProfit - deductibleHalfSETax;
  const earnedIncome = Math.max(0, round2(w2Income + seEarnedIncome));
  let remainingTax = regularFederalIncomeTax;

  let childAndDependentCareCredit = 0;
  let educationCredit = 0;
  let educationRefundable = 0;
  let childTaxCredit = 0;
  let otherDependentCredit = 0;
  let additionalChildTaxCredit = 0;
  let earnedIncomeTaxCredit = 0;

  if (toggles.credits) {
    // §21 (Form 2441) — limited by earned income; nonrefundable
    if (profile.dependents_count > 0 && profile.child_care_expenses_paid > 0 && fs !== 'married_filing_separately') {
      const cap =
        profile.dependents_count >= 2 ? rules.child_care_max_two_plus_dependents : rules.child_care_max_one_dependent;
      const eligible = Math.min(profile.child_care_expenses_paid, cap, earnedIncome);
      const tentative = round2(eligible * childCareCreditRate(rules, fs, adjustedGrossIncome));
      childAndDependentCareCredit = Math.min(tentative, remainingTax);
      remainingTax = round2(remainingTax - childAndDependentCareCredit);
    }

    // §25A (Form 8863)
    if (profile.education_expenses_paid > 0 && fs !== 'married_filing_separately') {
      const range = rules.education_phaseout[fs];
      const factor = clamp((range.end - adjustedGrossIncome) / (range.end - range.start), 0, 1);
      if (profile.is_student_at_least_half_time && profile.education_years_claimed < 4) {
        const e = profile.education_expenses_paid;
        const aotc = round2(
          (Math.min(2000, e) + 0.25 * Math.min(2000, Math.max(0, e - 2000))) * factor
        );
        educationRefundable = round2(aotc * rules.aotc_refundable_share);
        const nonref = Math.min(round2(aotc - educationRefundable), remainingTax);
        educationCredit = round2(nonref + educationRefundable);
        remainingTax = round2(remainingTax - nonref);
      } else {
        const llc = round2(Math.min(10000, profile.education_expenses_paid) * 0.2 * factor);
        educationCredit = Math.min(llc, remainingTax);
        remainingTax = round2(remainingTax - educationCredit);
      }
    }

    // §24 — CTC + $500 credit for other dependents, phase-out $50 per $1,000 (or part)
    const kids = Math.max(0, Math.floor(profile.qualifying_children_under_17));
    const otherDeps = Math.max(0, Math.floor(profile.dependents_count) - kids);
    if (kids > 0 || otherDeps > 0) {
      const ctcBase = kids * rules.child_tax_credit_per_child;
      const odcBase = otherDeps * rules.other_dependent_credit;
      const excess = Math.max(0, adjustedGrossIncome - rules.child_tax_credit_phaseout_start[fs]);
      const reduction = Math.ceil(excess / 1000) * rules.child_tax_credit_phaseout_per_1000;
      const allowed = Math.max(0, ctcBase + odcBase - reduction);
      const nonref = Math.min(allowed, remainingTax);
      remainingTax = round2(remainingTax - nonref);
      otherDependentCredit = Math.min(odcBase, allowed);
      // §24(d) / Schedule 8812 Part II-A: Additional Child Tax Credit (refundable)
      additionalChildTaxCredit =
        kids > 0
          ? round2(
              Math.max(
                0,
                Math.min(
                  allowed - nonref,
                  kids * rules.child_tax_credit_refundable_cap,
                  Math.max(0, earnedIncome - rules.actc_earned_income_threshold) * rules.actc_rate
                )
              )
            )
          : 0;
      childTaxCredit = round2(nonref + additionalChildTaxCredit);
    }

    // §32 — investment income assumed under the limit; child count = qualifying children entered
    earnedIncomeTaxCredit = computeEarnedIncomeCredit({
      rules,
      filingStatus: fs,
      qualifyingChildren: kids,
      earnedIncome,
      agi: adjustedGrossIncome,
    });
  }

  const premiumTaxCredit = 0;
  const refundableCredits = round2(earnedIncomeTaxCredit + additionalChildTaxCredit + educationRefundable);
  const nonrefundableUsed = round2(regularFederalIncomeTax - remainingTax);
  const totalTaxCredits = round2(nonrefundableUsed + refundableCredits);
  const federalIncomeTaxAfterCredits = Math.max(0, remainingTax);

  // State: never estimated with an invented rate.
  const noStateTax = rules.states_without_wage_income_tax.includes(profile.state_code);
  const estimatedStateIncomeTax = 0;

  // Form 1040 line 24 (total tax) — refundable credits are treated as payments below.
  const totalEstimatedTaxLiability = round2(
    federalIncomeTaxAfterCredits + totalSelfEmploymentTax + additionalMedicareTax
  );
  const withholdingAndEstimatedPayments = round2(profile.estimated_tax_payments_made);
  const netTaxOwedOrRefund = round2(
    totalEstimatedTaxLiability - refundableCredits - withholdingAndEstimatedPayments
  );
  const netPosition = round2(totalEstimatedTaxLiability - refundableCredits);

  const effectiveTaxRatePct =
    totalGrossIncome > 0 ? round2((netPosition / totalGrossIncome) * 100) : 0;
  const marginalCombinedRatePct = round2(
    (marginalRate + (netEarningsFromSE > 0 ? 0.153 * rules.se_net_earnings_factor : 0)) * 100
  );
  const savingsVsBaseline =
    baselineNetPosition !== undefined ? round2(baselineNetPosition - netPosition) : 0;

  if (formulaTrace) {
    formulaTrace.push(
      {
        step: `[${scenarioId}] 1. Gross income`,
        rule_ref: 'IRC §61 / Form 1040 lines 1a, 8; Schedule C line 1',
        formula: 'w2_income + business_gross + other_income',
        inputs: { w2_income: w2Income, business_gross: businessGross, other_income: otherIncome },
        result: totalGrossIncome,
      },
      {
        step: `[${scenarioId}] 2. Schedule C net profit`,
        rule_ref: 'IRC §162, §179, §274(n), §280A / Schedule C line 31',
        formula: 'business_gross - (operating + §179 + vehicle + home_office)',
        inputs: {
          business_gross: businessGross,
          operating_expenses: operatingExpensesTotal,
          section_179: section179AndDepreciation,
          section_179_ineligible_le_50pct_use: agg.section179Ineligible,
          vehicle_deduction: vehicleDeduction,
          vehicle_method: vehicleMethod,
          home_office: homeOfficeDeduction,
          home_office_method: homeOfficeMethod,
        },
        result: scheduleCNetProfit,
      },
      {
        step: `[${scenarioId}] 3. Self-employment tax`,
        rule_ref: 'IRC §1401, §164(f) / Schedule SE; Form 8959',
        formula: 'min(NE, wage_base - wages) × 12.4% + NE × 2.9%; half deductible',
        inputs: {
          net_earnings_se: netEarningsFromSE,
          se_oasdi: seTaxOASDI,
          se_medicare: seTaxMedicare,
          additional_medicare: additionalMedicareTax,
          deductible_half_se: deductibleHalfSETax,
        },
        result: totalSelfEmploymentTax,
      },
      {
        step: `[${scenarioId}] 4. Adjusted gross income`,
        rule_ref: 'IRC §62 / Form 1040 line 11',
        formula: 'wages + other + schedule_c_profit - (half_se + sep + se_health)',
        inputs: {
          schedule_c_net_profit: scheduleCNetProfit,
          half_se: deductibleHalfSETax,
          retirement: retirementContributionDeduction,
          se_health_insurance: seHealthInsuranceDeduction,
        },
        result: adjustedGrossIncome,
      },
      {
        step: `[${scenarioId}] 5. Taxable income`,
        rule_ref: 'IRC §63, §199A / Form 1040 line 15, Form 8995',
        formula: 'max(0, AGI - standard_deduction - qbi_deduction)',
        inputs: { agi: adjustedGrossIncome, standard_deduction: standardDeduction, qbi_deduction: qbiDeduction },
        result: taxableIncome,
      },
      {
        step: `[${scenarioId}] 6. Income tax and credits`,
        rule_ref: `${params.ruleVersionId} — Tax Table (<$100k) / brackets; §21, §24, §25A, §32`,
        formula: 'tax - nonrefundable credits; refundable credits treated as payments',
        inputs: {
          regular_tax: regularFederalIncomeTax,
          dependent_care: childAndDependentCareCredit,
          education: educationCredit,
          child_tax_credit_total: childTaxCredit,
          additional_child_tax_credit: additionalChildTaxCredit,
          other_dependent_credit: otherDependentCredit,
          eitc: earnedIncomeTaxCredit,
        },
        result: federalIncomeTaxAfterCredits,
      },
      {
        step: `[${scenarioId}] 7. Federal total tax and net position`,
        rule_ref: 'Form 1040 line 24; state income tax not included',
        formula: 'income_tax_after_credits + SE tax + additional Medicare − refundable credits',
        inputs: {
          total_tax_line_24: totalEstimatedTaxLiability,
          refundable_credits: refundableCredits,
          state: noStateTax ? 'no wage income tax' : `not calculated (${profile.state_code})`,
        },
        result: netPosition,
      }
    );
  }

  return {
    scenario_id: scenarioId,
    scenario_label: scenarioLabel,
    requires_user_confirmation: scenarioId === 'potential',
    w2_income: w2Income,
    form_1099_and_business_gross_income: businessGross,
    other_income: otherIncome,
    total_gross_income: totalGrossIncome,
    schedule_c_expenses_by_category: expensesByCategory,
    home_office_deduction: homeOfficeDeduction,
    vehicle_deduction: vehicleDeduction,
    section_179_and_depreciation: section179AndDepreciation,
    total_schedule_c_deductions: totalScheduleCDeductions,
    schedule_c_net_profit: scheduleCNetProfit,
    self_employment_tax_oasdi: seTaxOASDI,
    self_employment_tax_medicare: seTaxMedicare,
    additional_medicare_tax: additionalMedicareTax,
    total_self_employment_tax: totalSelfEmploymentTax,
    deductible_half_se_tax: deductibleHalfSETax,
    se_health_insurance_deduction: seHealthInsuranceDeduction,
    retirement_contribution_deduction: retirementContributionDeduction,
    total_above_the_line_adjustments: totalAboveTheLineAdjustments,
    adjusted_gross_income: adjustedGrossIncome,
    standard_or_itemized_deduction: standardDeduction,
    qbi_deduction: qbiDeduction,
    taxable_income: taxableIncome,
    regular_federal_income_tax: regularFederalIncomeTax,
    child_tax_credit: childTaxCredit,
    child_and_dependent_care_credit: childAndDependentCareCredit,
    education_credit: educationCredit,
    earned_income_tax_credit: earnedIncomeTaxCredit,
    premium_tax_credit: premiumTaxCredit,
    total_tax_credits: totalTaxCredits,
    federal_income_tax_after_credits: federalIncomeTaxAfterCredits,
    estimated_state_income_tax: estimatedStateIncomeTax,
    total_estimated_tax_liability: totalEstimatedTaxLiability,
    withholding_and_estimated_payments: withholdingAndEstimatedPayments,
    net_tax_owed_or_refund: netTaxOwedOrRefund,
    effective_tax_rate_pct: effectiveTaxRatePct,
    marginal_combined_rate_pct: marginalCombinedRatePct,
    savings_vs_baseline: savingsVsBaseline,
    state_tax_status: noStateTax ? 'no_wage_income_tax' : 'not_calculated',
    other_dependent_credit: otherDependentCredit,
    nonrefundable_credits_used: nonrefundableUsed,
    refundable_credits: refundableCredits,
    vehicle_method: vehicleMethod,
    home_office_method: homeOfficeMethod,
  };
}

function netPositionOf(s: ScenarioTaxBreakdown): number {
  return round2(s.total_estimated_tax_liability - s.refundable_credits);
}

export interface ScenarioInputs {
  profile: UserProfileRecord;
  transactions: TransactionRecord[];
  classifications: TransactionClassificationRecord[];
  ruleVersion: TaxRuleVersionRecord;
}

function runScenario(
  inputs: ScenarioInputs,
  scenarioId: ScenarioId,
  opts: {
    excludeTransactionIds?: Set<string>;
    togglesOverride?: Partial<ScenarioToggles>;
    profileOverride?: Partial<UserProfileRecord>;
    baselineNetPosition?: number;
    formulaTrace?: CalculationRunRecord['formula_trace'];
  } = {}
): ScenarioTaxBreakdown {
  const profile = { ...inputs.profile, ...(opts.profileOverride || {}) };
  const rules = inputs.ruleVersion.rules_payload;
  const agg = aggregateScenarioExpenses({
    scenarioId,
    transactions: inputs.transactions,
    classifications: inputs.classifications,
    rules,
    excludeTransactionIds: opts.excludeTransactionIds,
  });
  const labels: Record<ScenarioId, string> = {
    baseline: 'Baseline (documented items only)',
    confirmed: 'Confirmed (documented + confirmed by you)',
    potential: 'Potential (includes items still needing your confirmation)',
  };
  return computeScenario({
    scenarioId,
    scenarioLabel: labels[scenarioId],
    profile,
    rules,
    agg,
    toggles: { ...togglesFor(scenarioId, profile), ...(opts.togglesOverride || {}) },
    baselineNetPosition: opts.baselineNetPosition,
    formulaTrace: opts.formulaTrace,
    ruleVersionId: inputs.ruleVersion.version_id,
  });
}

/**
 * Real tax effect of one opportunity: the scenario's net federal position with the
 * opportunity removed minus the position with it. This is the amount a user actually
 * keeps, after brackets, SE tax, QBI interaction and credit phase-outs.
 */
export function estimateOpportunityEffect(
  inputs: ScenarioInputs,
  scenarioId: 'confirmed' | 'potential',
  remove: {
    transactionIds?: string[];
    toggles?: Partial<ScenarioToggles>;
    profileOverride?: Partial<UserProfileRecord>;
  }
): number {
  const withIt = runScenario(inputs, scenarioId);
  const without = runScenario(inputs, scenarioId, {
    excludeTransactionIds: new Set(remove.transactionIds || []),
    togglesOverride: remove.toggles,
    profileOverride: remove.profileOverride,
  });
  return round2(netPositionOf(without) - netPositionOf(withIt));
}

/**
 * Runs the three scenarios required by the spec (§3.5):
 * baseline, confirmed, and potential (clearly marked as requiring confirmation).
 */
export function runDeterministicTaxCalculation(params: {
  userId: string;
  profile: UserProfileRecord;
  transactions: TransactionRecord[];
  classifications: TransactionClassificationRecord[];
  ruleVersion: TaxRuleVersionRecord;
  documentTypes?: string[];
}): CalculationRunRecord {
  const { userId, profile, transactions, classifications, ruleVersion } = params;
  const inputs: ScenarioInputs = { profile, transactions, classifications, ruleVersion };
  const formulaTrace: CalculationRunRecord['formula_trace'] = [];
  const reviewReasons: string[] = [];

  if (profile.has_unsupported_complex_entity) {
    reviewReasons.push(
      profile.unsupported_entity_notes ||
        'Additional tax review required: partnership, S corporation, C corporation or multi-state situation is outside the supported scope.'
    );
  }
  if (profile.tax_year !== ruleVersion.tax_year) {
    reviewReasons.push(
      `Additional tax review required: rule version ${ruleVersion.version_id} does not match tax year ${profile.tax_year}.`
    );
  }
  const docTypes = new Set(params.documentTypes || []);
  if (docTypes.has('1095_a')) {
    reviewReasons.push(
      'Additional tax review required: a Form 1095-A was uploaded. The Premium Tax Credit reconciliation (Form 8962) is not calculated.'
    );
  }
  if (docTypes.has('1098')) {
    reviewReasons.push(
      'Additional tax review required: a Form 1098 was uploaded. Itemized deductions (mortgage interest, SALT) are not calculated; only the standard deduction is used.'
    );
  }

  const baseline = runScenario(inputs, 'baseline');
  const baselineNet = netPositionOf(baseline);
  const confirmed = runScenario(inputs, 'confirmed', { baselineNetPosition: baselineNet, formulaTrace });
  const potential = runScenario(inputs, 'potential', { baselineNetPosition: baselineNet, formulaTrace });
  baseline.savings_vs_baseline = 0;

  const agg = aggregateScenarioExpenses({
    scenarioId: 'potential',
    transactions,
    classifications,
    rules: ruleVersion.rules_payload,
  });
  if (agg.section179Ineligible > 0) {
    reviewReasons.push(
      `Additional tax review required: $${agg.section179Ineligible.toLocaleString('en-US')} of equipment has 50% or less business use, so §179 does not apply; regular depreciation is not calculated.`
    );
  }

  return {
    id: `calc_${profile.tax_year}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    user_id: userId,
    tax_year: profile.tax_year,
    rule_version_id: ruleVersion.version_id,
    status: reviewReasons.length > 0 ? 'additional_review_required' : 'completed',
    additional_review_reasons: reviewReasons,
    input_snapshot: {
      engine_version: ENGINE_VERSION,
      filing_status: profile.filing_status,
      state_code: profile.state_code,
      transaction_count: transactions.length,
      transactions_needing_review: agg.needsReviewCount,
      rule_version: ruleVersion.version_id,
      profile: {
        qualifying_children_under_17: profile.qualifying_children_under_17,
        dependents_count: profile.dependents_count,
        home_office_sqft: profile.home_office_sqft,
        home_office_exclusive_regular_use: profile.home_office_exclusive_regular_use,
        vehicle_business_miles: profile.vehicle_business_miles,
        vehicle_mileage_log_confirmed: profile.vehicle_mileage_log_confirmed,
        self_employed_health_insurance_premiums: profile.self_employed_health_insurance_premiums,
        sep_ira_solo_401k_contributions: profile.sep_ira_solo_401k_contributions,
        estimated_tax_payments_made: profile.estimated_tax_payments_made,
      },
    },
    scenarios: { baseline, confirmed, potential },
    formula_trace: formulaTrace,
    created_at: new Date().toISOString(),
  };
}
