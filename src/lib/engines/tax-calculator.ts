import {
  CalculationRunRecord,
  FilingStatus,
  ScheduleCCategory,
  ScenarioTaxBreakdown,
  TaxRuleVersionRecord,
  TransactionClassificationRecord,
  TransactionRecord,
  UserProfileRecord,
} from '@/types/tax';

const ALL_SCHEDULE_C_CATEGORIES: ScheduleCCategory[] = [
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

function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export function computeProgressiveFederalTax(
  taxableIncome: number,
  filingStatus: FilingStatus,
  brackets: Array<{ up_to: number | null; rate: number }>
): { tax: number; marginalRate: number } {
  if (taxableIncome <= 0) {
    return { tax: 0, marginalRate: brackets[0]?.rate || 0.1 };
  }
  let remaining = taxableIncome;
  let previousLimit = 0;
  let totalTax = 0;
  let marginalRate = brackets[0]?.rate || 0.1;

  for (const bracket of brackets) {
    if (remaining <= 0) break;
    marginalRate = bracket.rate;
    if (bracket.up_to === null) {
      totalTax += remaining * bracket.rate;
      remaining = 0;
    } else {
      const bandWidth = Math.max(0, bracket.up_to - previousLimit);
      const taxableInBand = Math.min(remaining, bandWidth);
      totalTax += taxableInBand * bracket.rate;
      remaining -= taxableInBand;
      previousLimit = bracket.up_to;
    }
  }

  return { tax: round2(totalTax), marginalRate };
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
    !profile.home_office_exclusive_regular_use ||
    profile.home_office_sqft <= 0 ||
    profile.home_total_sqft <= 0 ||
    tentativeScheduleCProfit <= 0
  ) {
    return { deduction: 0, methodUsed: 'ineligible', simplifiedAmount: 0, regularAmount: 0 };
  }

  const eligibleSqFt = Math.min(profile.home_office_sqft, simplifiedMaxSqFt);
  const simplifiedRaw = round2(eligibleSqFt * simplifiedRatePerSqFt);

  const businessPct = Math.min(1, profile.home_office_sqft / profile.home_total_sqft);
  const totalHomeCosts =
    profile.home_annual_rent_or_mortgage_interest + profile.home_annual_utilities_insurance;
  const regularRaw = round2(totalHomeCosts * businessPct);

  // IRC §280A(c)(5): Home office deduction cannot exceed tentative Schedule C net profit
  const simplifiedCapped = Math.min(simplifiedRaw, tentativeScheduleCProfit);
  const regularCapped = Math.min(regularRaw, tentativeScheduleCProfit);

  if (regularCapped >= simplifiedCapped) {
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
}): {
  deduction: number;
  methodUsed: 'standard_mileage' | 'actual_expenses' | 'none';
  standardMileageAmount: number;
  actualExpenseAmount: number;
} {
  const { profile, standardMileageRateCents } = params;
  if (profile.vehicle_business_miles <= 0 || profile.vehicle_total_miles <= 0) {
    return { deduction: 0, methodUsed: 'none', standardMileageAmount: 0, actualExpenseAmount: 0 };
  }

  const businessMiles = Math.min(profile.vehicle_business_miles, profile.vehicle_total_miles);
  const standardMileageAmount = round2((businessMiles * standardMileageRateCents) / 100);
  const businessRatio = businessMiles / profile.vehicle_total_miles;
  const actualExpenseAmount = round2(profile.vehicle_actual_expenses * businessRatio);

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

function calculateSingleScenario(params: {
  scenarioId: 'baseline' | 'confirmed' | 'potential';
  scenarioLabel: string;
  requiresConfirmation: boolean;
  profile: UserProfileRecord;
  transactions: TransactionRecord[];
  classifications: TransactionClassificationRecord[];
  ruleVersion: TaxRuleVersionRecord;
  baselineTotalTaxLiability?: number;
  formulaTrace?: CalculationRunRecord['formula_trace'];
}): ScenarioTaxBreakdown {
  const {
    scenarioId,
    scenarioLabel,
    requiresConfirmation,
    profile,
    transactions,
    classifications,
    ruleVersion,
    baselineTotalTaxLiability,
    formulaTrace,
  } = params;

  const rules = ruleVersion.rules_payload;
  const clsByTxId = new Map<string, TransactionClassificationRecord>();
  for (const c of classifications) {
    clsByTxId.set(c.transaction_id, c);
  }

  let w2Income = 0;
  let form1099AndBusinessGross = 0;
  let otherIncome = 0;

  const expensesByCategory: Record<ScheduleCCategory, number> = {} as Record<ScheduleCCategory, number>;
  for (const cat of ALL_SCHEDULE_C_CATEGORIES) {
    expensesByCategory[cat] = 0;
  }

  for (const tx of transactions) {
    // Strictly exclude duplicates, transfers, credit card repayments, and invalid rows
    if (
      tx.is_duplicate ||
      tx.review_status === 'duplicate_excluded' ||
      tx.review_status === 'transfer_excluded' ||
      tx.review_status === 'cc_repayment_excluded' ||
      tx.review_status === 'needs_review'
    ) {
      continue;
    }

    const cls = clsByTxId.get(tx.id);
    if (!cls) continue;

    // Exclude Non-expense transactions (transfers, CC repayments, owner draws, loan principal)
    if (cls.effective_group === 'Non-expense transactions') {
      continue;
    }

    if (cls.effective_group === 'Income') {
      if (cls.sub_type === 'w2_wages') {
        w2Income = round2(w2Income + tx.amount);
      } else if (
        cls.sub_type === 'freelance_1099_income' ||
        cls.sub_type === 'business_gross_receipts'
      ) {
        form1099AndBusinessGross = round2(form1099AndBusinessGross + tx.amount);
      } else {
        otherIncome = round2(otherIncome + tx.amount);
      }
      continue;
    }

    if (cls.effective_group === 'Business expenses') {
      // Determine whether this expense is included in the current scenario
      const ev = cls.evidence_classification;
      let includeExpense = false;

      if (scenarioId === 'baseline') {
        // Baseline includes only direct processing/bank fees or non-optimized mandatory items
        includeExpense =
          ev === 'verified_by_document' &&
          cls.schedule_c_category === 'bank_and_payment_processing_fees';
      } else if (scenarioId === 'confirmed') {
        includeExpense =
          ev === 'verified_by_document' ||
          (ev === 'partially_deductible' && cls.is_user_overridden);
      } else if (scenarioId === 'potential') {
        includeExpense =
          ev === 'verified_by_document' ||
          ev === 'potentially_deductible_confirmation_required' ||
          ev === 'partially_deductible' ||
          ev === 'additional_info_required';
      }

      if (!includeExpense) continue;

      const businessPctFactor = Math.max(0, Math.min(100, cls.business_use_pct)) / 100;
      const mealLimitFactor =
        cls.schedule_c_category === 'eligible_business_meals'
          ? rules.meals_deduction_factor
          : Math.max(0, Math.min(100, cls.meal_deduction_limit_pct)) / 100;

      const deductibleAmount = round2(tx.amount * businessPctFactor * mealLimitFactor);
      const cat = cls.schedule_c_category || 'other_eligible_business_expenses';
      expensesByCategory[cat] = round2((expensesByCategory[cat] || 0) + deductibleAmount);
    }
  }

  const totalGrossIncome = round2(w2Income + form1099AndBusinessGross + otherIncome);

  // Sum operating Schedule C expenses before home office & vehicle
  let operatingExpensesTotal = 0;
  let section179AndDepreciation = 0;
  for (const [cat, amt] of Object.entries(expensesByCategory) as Array<[ScheduleCCategory, number]>) {
    if (cat === 'none') continue;
    if (cat === 'depreciation_and_section_179') {
      const capped179 = Math.min(amt, rules.section_179_max_deduction);
      section179AndDepreciation = round2(section179AndDepreciation + capped179);
    } else {
      operatingExpensesTotal = round2(operatingExpensesTotal + amt);
    }
  }

  // Vehicle deduction (Included in confirmed & potential scenarios if user has business mileage)
  let vehicleDeduction = 0;
  if (scenarioId !== 'baseline' && profile.has_schedule_c) {
    const veh = computeVehicleDeduction({
      profile,
      standardMileageRateCents: rules.standard_mileage_rate_cents,
    });
    vehicleDeduction = veh.deduction;
    expensesByCategory.business_mileage = vehicleDeduction;
  }

  const tentativeProfitBeforeHomeOffice = Math.max(
    0,
    round2(
      form1099AndBusinessGross -
        operatingExpensesTotal -
        section179AndDepreciation -
        vehicleDeduction
    )
  );

  let homeOfficeDeduction = 0;
  if (scenarioId !== 'baseline' && profile.has_schedule_c) {
    const ho = computeHomeOfficeDeduction({
      profile,
      tentativeScheduleCProfit: tentativeProfitBeforeHomeOffice,
      simplifiedRatePerSqFt: rules.home_office_simplified_rate_per_sqft,
      simplifiedMaxSqFt: rules.home_office_simplified_max_sqft,
    });
    homeOfficeDeduction = ho.deduction;
    expensesByCategory.home_office = homeOfficeDeduction;
  }

  const totalScheduleCDeductions = round2(
    operatingExpensesTotal +
      section179AndDepreciation +
      vehicleDeduction +
      homeOfficeDeduction
  );

  // Schedule C Net Profit (floored at 0 for SE/QBI calculation simplicity unless active loss)
  const scheduleCNetProfit = round2(form1099AndBusinessGross - totalScheduleCDeductions);
  const positiveScheduleCProfit = Math.max(0, scheduleCNetProfit);

  // Schedule SE: Self-Employment Tax
  const netEarningsFromSE =
    positiveScheduleCProfit >= 400
      ? round2(positiveScheduleCProfit * rules.se_net_earnings_factor)
      : 0;

  const remainingSSWageBase = Math.max(0, rules.social_security_wage_base - w2Income);
  const subjectToOASDI = Math.min(netEarningsFromSE, remainingSSWageBase);
  const seTaxOASDI = round2(subjectToOASDI * rules.social_security_rate);
  const seTaxMedicare = round2(netEarningsFromSE * rules.medicare_rate);

  const combinedEarnedIncome = round2(w2Income + netEarningsFromSE);
  const addMedThreshold = rules.additional_medicare_threshold[profile.filing_status];
  const excessOverAddMedThreshold = Math.max(0, combinedEarnedIncome - addMedThreshold);
  const additionalMedicareTax = round2(excessOverAddMedThreshold * rules.additional_medicare_rate);

  const totalSelfEmploymentTax = round2(seTaxOASDI + seTaxMedicare + additionalMedicareTax);
  const deductibleHalfSETax = round2((seTaxOASDI + seTaxMedicare) * rules.se_deductible_half_factor);

  // Above-the-line adjustments (Schedule 1 Part II)
  const netProfitAfterHalfSE = Math.max(0, round2(positiveScheduleCProfit - deductibleHalfSETax));

  const seHealthInsuranceDeduction =
    scenarioId === 'baseline'
      ? 0
      : round2(Math.min(profile.self_employed_health_insurance_premiums, netProfitAfterHalfSE));

  const maxSepIraCap = round2(netProfitAfterHalfSE * 0.2);
  const retirementContributionDeduction =
    scenarioId === 'baseline'
      ? 0
      : round2(Math.min(profile.sep_ira_solo_401k_contributions, maxSepIraCap));

  const totalAboveTheLineAdjustments = round2(
    deductibleHalfSETax + seHealthInsuranceDeduction + retirementContributionDeduction
  );

  const adjustedGrossIncome = Math.max(
    0,
    round2(totalGrossIncome - totalScheduleCDeductions - totalAboveTheLineAdjustments)
  );

  const standardDeduction = rules.standard_deduction[profile.filing_status];
  const taxableIncomeBeforeQBI = Math.max(0, round2(adjustedGrossIncome - standardDeduction));

  // Qualified Business Income (QBI) Deduction — IRC §199A (Form 8995)
  let qbiDeduction = 0;
  if (scenarioId !== 'baseline' && positiveScheduleCProfit > 0) {
    const netQBI = Math.max(
      0,
      round2(
        positiveScheduleCProfit -
          deductibleHalfSETax -
          seHealthInsuranceDeduction -
          retirementContributionDeduction
      )
    );
    const phaseStart = rules.qbi_phaseout_start[profile.filing_status];
    const phaseRange = rules.qbi_phaseout_range[profile.filing_status];
    let phaseFactor = 1;
    if (taxableIncomeBeforeQBI > phaseStart) {
      const excess = taxableIncomeBeforeQBI - phaseStart;
      phaseFactor = Math.max(0, 1 - excess / phaseRange);
    }
    const tentativeQBI = round2(netQBI * rules.qbi_deduction_rate * phaseFactor);
    const overallCap = round2(taxableIncomeBeforeQBI * rules.qbi_deduction_rate);
    qbiDeduction = Math.min(tentativeQBI, overallCap);
  }

  const taxableIncome = Math.max(0, round2(taxableIncomeBeforeQBI - qbiDeduction));

  // Progressive Federal Income Tax
  const { tax: regularFederalIncomeTax, marginalRate: marginalFederalRate } =
    computeProgressiveFederalTax(
      taxableIncome,
      profile.filing_status,
      rules.federal_brackets[profile.filing_status]
    );

  // Tax Credits (Evaluated in Confirmed & Potential scenarios)
  let childTaxCredit = 0;
  let childAndDependentCareCredit = 0;
  let educationCredit = 0;
  let earnedIncomeTaxCredit = 0;
  const premiumTaxCredit = 0;

  if (scenarioId !== 'baseline') {
    // 1. Child Tax Credit (IRC §24)
    if (profile.qualifying_children_under_17 > 0) {
      const baseCTC = profile.qualifying_children_under_17 * rules.child_tax_credit_per_child;
      const ctcPhaseStart = rules.child_tax_credit_phaseout_start[profile.filing_status];
      const excessAGI = Math.max(0, adjustedGrossIncome - ctcPhaseStart);
      const phaseoutReduction = Math.ceil(excessAGI / 1000) * 50;
      childTaxCredit = Math.max(0, baseCTC - phaseoutReduction);
    }

    // 2. Child and Dependent Care Credit (IRC §21 / Form 2441)
    if (profile.dependents_count > 0 && profile.child_care_expenses_paid > 0) {
      const maxEligibleCare =
        profile.dependents_count >= 2
          ? rules.child_care_max_two_plus_dependents
          : rules.child_care_max_one_dependent;
      const eligibleCare = Math.min(profile.child_care_expenses_paid, maxEligibleCare);
      childAndDependentCareCredit = round2(eligibleCare * rules.child_care_credit_rate);
    }

    // 3. Education Credit (AOTC / LLC — IRC §25A / Form 8863)
    if (profile.education_expenses_paid > 0 && profile.filing_status !== 'married_filing_separately') {
      const aotcPhaseStart = rules.aotc_phaseout_start[profile.filing_status];
      if (
        profile.is_student_at_least_half_time &&
        profile.education_years_claimed < 4 &&
        adjustedGrossIncome <= aotcPhaseStart + 10000
      ) {
        const first2k = Math.min(2000, profile.education_expenses_paid);
        const next2k = Math.max(0, Math.min(2000, profile.education_expenses_paid - 2000));
        educationCredit = round2(first2k + next2k * 0.25);
      } else if (adjustedGrossIncome <= aotcPhaseStart + 10000) {
        educationCredit = round2(Math.min(10000, profile.education_expenses_paid) * 0.2);
      }
    }

    // 4. Earned Income Tax Credit (IRC §32)
    if (profile.filing_status !== 'married_filing_separately' && combinedEarnedIncome > 0) {
      if (
        profile.qualifying_children_under_17 > 0 &&
        adjustedGrossIncome <= rules.eitc_max_agi_with_children[profile.filing_status]
      ) {
        const limit = rules.eitc_max_agi_with_children[profile.filing_status];
        const ratio = Math.max(0, 1 - adjustedGrossIncome / limit);
        earnedIncomeTaxCredit = round2(rules.eitc_max_credit_with_children * ratio);
      } else if (
        profile.qualifying_children_under_17 === 0 &&
        adjustedGrossIncome <= rules.eitc_max_agi_no_children[profile.filing_status]
      ) {
        const limit = rules.eitc_max_agi_no_children[profile.filing_status];
        const ratio = Math.max(0, 1 - adjustedGrossIncome / limit);
        earnedIncomeTaxCredit = round2(rules.eitc_max_credit_no_children * ratio);
      }
    }
  }

  const totalTaxCredits = round2(
    childTaxCredit +
      childAndDependentCareCredit +
      educationCredit +
      earnedIncomeTaxCredit +
      premiumTaxCredit
  );

  // Non-refundable vs refundable credit floor
  const federalIncomeTaxAfterCredits = Math.max(
    0,
    round2(regularFederalIncomeTax - totalTaxCredits)
  );

  // State Income Tax Estimate
  const stateRate =
    rules.state_flat_effective_rates[profile.state_code] ??
    rules.state_flat_effective_rates.DEFAULT;
  const estimatedStateIncomeTax = round2(taxableIncome * stateRate);

  const totalEstimatedTaxLiability = round2(
    federalIncomeTaxAfterCredits + totalSelfEmploymentTax + estimatedStateIncomeTax
  );

  const withholdingAndEstimatedPayments = round2(profile.estimated_tax_payments_made);
  const netTaxOwedOrRefund = round2(
    totalEstimatedTaxLiability - withholdingAndEstimatedPayments
  );

  const effectiveTaxRatePct =
    totalGrossIncome > 0
      ? round2((totalEstimatedTaxLiability / totalGrossIncome) * 100)
      : 0;

  const seEffectiveMarginal = positiveScheduleCProfit >= 400 ? 0.1413 : 0;
  const marginalCombinedRatePct = round2(
    (marginalFederalRate + stateRate + seEffectiveMarginal) * 100
  );

  const savingsVsBaseline =
    baselineTotalTaxLiability !== undefined
      ? Math.max(0, round2(baselineTotalTaxLiability - totalEstimatedTaxLiability))
      : 0;

  if (formulaTrace && scenarioId === 'confirmed') {
    formulaTrace.push(
      {
        step: '1. Gross Income Aggregation',
        rule_ref: 'IRC §61 / Form 1040 Lines 1a & Schedule C Line 1',
        formula: 'w2_income + form_1099_and_business_gross + other_income',
        inputs: {
          w2_income: w2Income,
          form_1099_and_business_gross: form1099AndBusinessGross,
          other_income: otherIncome,
        },
        result: totalGrossIncome,
      },
      {
        step: '2. Schedule C Net Profit',
        rule_ref: 'IRC §162, §274(n), §280A / Form 1040 Schedule C Line 31',
        formula: 'business_gross - (operating_expenses + section_179 + vehicle_deduction + home_office)',
        inputs: {
          business_gross: form1099AndBusinessGross,
          operating_expenses: operatingExpensesTotal,
          section_179: section179AndDepreciation,
          vehicle_deduction: vehicleDeduction,
          home_office: homeOfficeDeduction,
        },
        result: scheduleCNetProfit,
      },
      {
        step: '3. Schedule SE Self-Employment Tax & 50% Above-the-Line Deduction',
        rule_ref: 'IRC §1401 & §164(f) / Schedule SE',
        formula: 'OASDI (12.4% up to wage base) + Medicare (2.9%) + Additional Medicare (0.9%)',
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
        step: '4. Adjusted Gross Income (AGI)',
        rule_ref: 'IRC §62 / Form 1040 Line 11',
        formula: 'total_gross_income - schedule_c_deductions - (half_se_tax + se_health_ins + sep_ira)',
        inputs: {
          total_gross_income: totalGrossIncome,
          schedule_c_deductions: totalScheduleCDeductions,
          above_the_line_adjustments: totalAboveTheLineAdjustments,
        },
        result: adjustedGrossIncome,
      },
      {
        step: '5. Qualified Business Income (QBI) Deduction & Taxable Income',
        rule_ref: 'IRC §199A & §63 / Form 8995 & Form 1040 Line 15',
        formula: 'max(0, AGI - standard_deduction - qbi_deduction)',
        inputs: {
          agi: adjustedGrossIncome,
          standard_deduction: standardDeduction,
          qbi_deduction: qbiDeduction,
        },
        result: taxableIncome,
      },
      {
        step: '6. Total Tax Liability & Real Savings vs. Baseline',
        rule_ref: `Version ${ruleVersion.version_id} Federal Brackets + Credits + SE Tax + State (${profile.state_code})`,
        formula: '(regular_federal_tax - total_credits) + total_se_tax + state_tax',
        inputs: {
          regular_federal_tax: regularFederalIncomeTax,
          total_credits: totalTaxCredits,
          total_se_tax: totalSelfEmploymentTax,
          state_tax: estimatedStateIncomeTax,
          savings_vs_baseline: savingsVsBaseline,
        },
        result: totalEstimatedTaxLiability,
      }
    );
  }

  return {
    scenario_id: scenarioId,
    scenario_label: scenarioLabel,
    requires_user_confirmation: requiresConfirmation,
    w2_income: w2Income,
    form_1099_and_business_gross_income: form1099AndBusinessGross,
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
  };
}

/**
 * Executes the Deterministic Tax Calculation Engine across all 3 scenarios:
 * 1. Baseline (without newly uncovered deductions/optimizations)
 * 2. Confirmed (verified by document or explicitly confirmed by user)
 * 3. Potential (includes unconfirmed opportunities clearly marked as requiring confirmation)
 */
export function runDeterministicTaxCalculation(params: {
  userId: string;
  profile: UserProfileRecord;
  transactions: TransactionRecord[];
  classifications: TransactionClassificationRecord[];
  ruleVersion: TaxRuleVersionRecord;
}): CalculationRunRecord {
  const { userId, profile, transactions, classifications, ruleVersion } = params;
  const formulaTrace: CalculationRunRecord['formula_trace'] = [];
  const additionalReviewReasons: string[] = [];

  if (profile.has_unsupported_complex_entity) {
    additionalReviewReasons.push(
      profile.unsupported_entity_notes ||
        'Additional tax review required: Partnership (Form 1065), S-Corp (Form 1120-S), C-Corp, or multi-state apportionment detected outside MVP Sole Proprietor / W-2 scope.'
    );
  }

  const baseline = calculateSingleScenario({
    scenarioId: 'baseline',
    scenarioLabel: 'Baseline Scenario (Before AI Optimization)',
    requiresConfirmation: false,
    profile,
    transactions,
    classifications,
    ruleVersion,
  });

  const confirmed = calculateSingleScenario({
    scenarioId: 'confirmed',
    scenarioLabel: 'Confirmed Optimization Scenario (Verified & User-Confirmed)',
    requiresConfirmation: false,
    profile,
    transactions,
    classifications,
    ruleVersion,
    baselineTotalTaxLiability: baseline.total_estimated_tax_liability,
    formulaTrace,
  });

  const potential = calculateSingleScenario({
    scenarioId: 'potential',
    scenarioLabel: 'Potential Optimization Scenario (Requires User Confirmation)',
    requiresConfirmation: true,
    profile,
    transactions,
    classifications,
    ruleVersion,
    baselineTotalTaxLiability: baseline.total_estimated_tax_liability,
  });

  const status: CalculationRunRecord['status'] =
    additionalReviewReasons.length > 0 ? 'additional_review_required' : 'completed';

  return {
    id: `calc_${profile.tax_year}_${Date.now()}`,
    user_id: userId,
    tax_year: profile.tax_year,
    rule_version_id: ruleVersion.version_id,
    status,
    additional_review_reasons: additionalReviewReasons,
    input_snapshot: {
      filing_status: profile.filing_status,
      state_code: profile.state_code,
      transaction_count: transactions.length,
      rule_version: ruleVersion.version_id,
    },
    scenarios: {
      baseline,
      confirmed,
      potential,
    },
    formula_trace: formulaTrace,
    created_at: new Date().toISOString(),
  };
}
