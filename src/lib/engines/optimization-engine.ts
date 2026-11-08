import {
  CalculationRunRecord,
  ScheduleCCategory,
  TaxRecommendationRecord,
  TaxRuleVersionRecord,
  TransactionClassificationRecord,
  TransactionRecord,
  UserProfileRecord,
} from '@/types/tax';
import {
  computeHomeOfficeDeduction,
  computeVehicleDeduction,
  estimateOpportunityEffect,
  ScenarioInputs,
} from '@/lib/engines/tax-calculator';

const CATEGORY_LABELS: Record<ScheduleCCategory, { title: string; irsCitation: string }> = {
  advertising_and_marketing: {
    title: 'Advertising & Digital Marketing Expenses',
    irsCitation: 'IRC §162(a) / Form 1040 Schedule C Line 8',
  },
  office_expenses: {
    title: 'Office Supplies, Postage & Workspace Consumables',
    irsCitation: 'IRC §162(a) / Form 1040 Schedule C Line 18',
  },
  software_and_subscriptions: {
    title: 'Business SaaS, Cloud Infrastructure & Software Subscriptions',
    irsCitation: 'IRC §162(a) / Form 1040 Schedule C Line 18 & 27a',
  },
  professional_services: {
    title: 'Legal, Accounting, Tax Prep & Specialist Contractor Fees',
    irsCitation: 'IRC §162(a) / Form 1040 Schedule C Line 17',
  },
  business_insurance: {
    title: 'Commercial Liability & Professional E&O Insurance',
    irsCitation: 'IRC §162(a) / Form 1040 Schedule C Line 15',
  },
  bank_and_payment_processing_fees: {
    title: 'Merchant Processing (Stripe/PayPal) & Business Banking Fees',
    irsCitation: 'IRC §162(a) / Form 1040 Schedule C Line 10',
  },
  business_travel: {
    title: 'Business Airfare, Rail & Overnight Lodging Away From Tax Home',
    irsCitation: 'IRC §162(a)(2) & §274(d) / Form 1040 Schedule C Line 24a',
  },
  business_mileage: {
    title: 'Business Vehicle Mileage Deduction',
    irsCitation: 'IRC §162(a) & §274(d) / Form 1040 Schedule C Line 9',
  },
  eligible_business_meals: {
    title: 'Eligible Business Meals (Subject to 50% Statutory Limit)',
    irsCitation: 'IRC §274(k) & §274(n) / Form 1040 Schedule C Line 24b',
  },
  equipment_and_supplies: {
    title: 'Business Equipment, Hardware & Operational Supplies',
    irsCitation: 'IRC §162(a) / Form 1040 Schedule C Line 22',
  },
  rent: {
    title: 'Coworking & Commercial Office Lease Payments',
    irsCitation: 'IRC §162(a)(3) / Form 1040 Schedule C Line 20b',
  },
  utilities: {
    title: 'Commercial Office Utilities',
    irsCitation: 'IRC §162(a) / Form 1040 Schedule C Line 25',
  },
  telephone_and_internet: {
    title: 'Business Portion of Telephone & High-Speed Internet',
    irsCitation: 'IRC §162(a) / Form 1040 Schedule C Line 25',
  },
  education_and_training: {
    title: 'Professional Education, Certifications & Skill Training',
    irsCitation: 'Treas. Reg. §1.162-5 / Form 1040 Schedule C Line 27a',
  },
  vehicle_expenses: {
    title: 'Actual Business Vehicle Operating Expenses',
    irsCitation: 'IRC §162(a) / Form 1040 Schedule C Line 9',
  },
  home_office: {
    title: 'Dedicated Home Office Deduction (Form 8829 / Simplified)',
    irsCitation: 'IRC §280A(c)(1) / Form 8829 & Schedule C Line 30',
  },
  depreciation_and_section_179: {
    title: 'Section 179 Expensing & Bonus Depreciation on Capital Assets',
    irsCitation: 'IRC §179 & §168(k) / Form 4562 & Schedule C Line 13',
  },
  other_eligible_business_expenses: {
    title: 'Other Ordinary & Necessary Business Expenses',
    irsCitation: 'IRC §162(a) / Form 1040 Schedule C Line 27a',
  },
  none: {
    title: 'Non-Deductible / Uncategorized',
    irsCitation: 'IRC §262',
  },
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Generates traceable, evidence-backed Tax Recommendations and calculates exact real tax savings
 * (distinguishing between gross expense, eligible deduction/credit, and real tax liability reduction).
 */
export function generateTaxOptimizationRecommendations(params: {
  userId: string;
  profile: UserProfileRecord;
  transactions: TransactionRecord[];
  classifications: TransactionClassificationRecord[];
  ruleVersion: TaxRuleVersionRecord;
  calculationRun: CalculationRunRecord;
}): TaxRecommendationRecord[] {
  const { userId, profile, transactions, classifications, ruleVersion, calculationRun } = params;
  const rules = ruleVersion.rules_payload;
  const now = new Date().toISOString();
  const recommendations: TaxRecommendationRecord[] = [];

  const inputs: ScenarioInputs = { profile, transactions, classifications, ruleVersion };
  const fmt = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

  const clsByTxId = new Map<string, TransactionClassificationRecord>();
  for (const c of classifications) {
    clsByTxId.set(c.transaction_id, c);
  }

  // 1. Group Schedule C transactions by category + evidence state
  const catBuckets = new Map<
    string,
    {
      cat: ScheduleCCategory;
      isConfirmed: boolean;
      txs: TransactionRecord[];
      clsList: TransactionClassificationRecord[];
      grossAmount: number;
      eligibleDeduction: number;
    }
  >();

  for (const tx of transactions) {
    if (
      tx.is_duplicate ||
      tx.review_status !== 'ok' ||
      tx.direction !== 'outflow'
    ) {
      continue;
    }
    const cls = clsByTxId.get(tx.id);
    if (!cls || cls.effective_group !== 'Business expenses' || cls.schedule_c_category === 'none') {
      continue;
    }

    const isConfirmed =
      cls.evidence_classification === 'verified_by_document' ||
      (cls.evidence_classification === 'partially_deductible' && cls.is_user_overridden);

    const key = `${cls.schedule_c_category}::${isConfirmed ? 'confirmed' : 'potential'}`;
    const businessFactor = Math.max(0, Math.min(100, cls.business_use_pct)) / 100;
    const mealFactor =
      cls.schedule_c_category === 'eligible_business_meals'
        ? rules.meals_deduction_factor
        : Math.max(0, Math.min(100, cls.meal_deduction_limit_pct)) / 100;
    const eligibleAmt = round2(tx.amount * businessFactor * mealFactor);

    const existing = catBuckets.get(key);
    if (existing) {
      existing.txs.push(tx);
      existing.clsList.push(cls);
      existing.grossAmount = round2(existing.grossAmount + tx.amount);
      existing.eligibleDeduction = round2(existing.eligibleDeduction + eligibleAmt);
    } else {
      catBuckets.set(key, {
        cat: cls.schedule_c_category,
        isConfirmed,
        txs: [tx],
        clsList: [cls],
        grossAmount: tx.amount,
        eligibleDeduction: eligibleAmt,
      });
    }
  }

  for (const bucket of catBuckets.values()) {
    const meta = CATEGORY_LABELS[bucket.cat];
    // Real effect = net federal tax with the bucket minus without it (same scenario).
    const realTaxSavings = estimateOpportunityEffect(
      inputs,
      bucket.isConfirmed ? 'confirmed' : 'potential',
      { transactionIds: bucket.txs.map((t) => t.id) }
    );
    const docIds = Array.from(new Set(bucket.txs.map((t) => t.document_id)));
    const missingSet = new Set<string>();
    bucket.clsList.forEach((c) => c.missing_evidence_items.forEach((m) => missingSet.add(m)));

    const isRecurringMissed = bucket.txs.some((t) => t.is_recurring) && !bucket.isConfirmed;
    const isSection179 = bucket.cat === 'depreciation_and_section_179';

    recommendations.push({
      id: `rec_${userId}_${profile.tax_year}_${bucket.cat}_${bucket.isConfirmed ? 'conf' : 'pot'}`,
      user_id: userId,
      tax_year: profile.tax_year,
      category: isSection179
        ? 'section_179_depreciation'
        : isRecurringMissed
        ? 'missed_recurring_expense'
        : 'schedule_c_deduction',
      title: `${meta.title}${bucket.isConfirmed ? '' : ' (Confirmation Required)'}`,
      status: bucket.isConfirmed
        ? 'verified_by_document'
        : bucket.clsList[0].evidence_classification,
      deduction_or_credit_type: 'deduction',
      gross_amount: bucket.grossAmount,
      eligible_deduction_or_credit_amount: bucket.eligibleDeduction,
      estimated_real_tax_savings: realTaxSavings,
      applied_rule_ref: `${ruleVersion.version_id} — ${meta.irsCitation}`,
      irs_citation: meta.irsCitation,
      calculation_explanation: `${fmt(bucket.grossAmount)} spent -> ${fmt(bucket.eligibleDeduction)} deductible on Schedule C (after business-use % and limits). Estimated federal tax impact, recalculated with and without these items (income tax + SE tax + credit interactions): ${fmt(realTaxSavings)}. A deduction is not a dollar-for-dollar saving. State tax not included.`,
      reasoning: bucket.clsList[0].reasoning,
      confidence_score: bucket.clsList[0].confidence_score,
      source_transaction_ids: bucket.txs.map((t) => t.id),
      source_document_ids: docIds,
      missing_confirmations: Array.from(missingSet),
      created_at: now,
    });
  }

  // 2. Special Optimization: Home Office Deduction (Simplified vs. Regular Form 8829)
  if (profile.has_schedule_c && profile.home_office_sqft > 0) {
    const tentativeProfit = Math.max(
      0,
      calculationRun.scenarios.confirmed.form_1099_and_business_gross_income -
        (calculationRun.scenarios.confirmed.total_schedule_c_deductions -
          calculationRun.scenarios.confirmed.home_office_deduction)
    );
    const ho = computeHomeOfficeDeduction({
      profile: {
        ...profile,
        home_office_exclusive_regular_use: true,
      },
      tentativeScheduleCProfit: tentativeProfit,
      simplifiedRatePerSqFt: rules.home_office_simplified_rate_per_sqft,
      simplifiedMaxSqFt: rules.home_office_simplified_max_sqft,
    });

    if (ho.deduction > 0) {
      const realSavings = estimateOpportunityEffect(inputs, 'potential', {
        toggles: { homeOffice: false },
      });
      recommendations.push({
        id: `rec_${userId}_${profile.tax_year}_home_office`,
        user_id: userId,
        tax_year: profile.tax_year,
        category: 'home_office',
        title: `Home Office Deduction (${ho.methodUsed === 'regular' ? 'Form 8829 Actual Expense Method' : 'IRS Simplified Method'})`,
        status: profile.home_office_exclusive_regular_use
          ? 'verified_by_document'
          : 'potentially_deductible_confirmation_required',
        deduction_or_credit_type: 'deduction',
        gross_amount:
          profile.home_annual_rent_or_mortgage_interest +
          profile.home_annual_utilities_insurance,
        eligible_deduction_or_credit_amount: ho.deduction,
        estimated_real_tax_savings: realSavings,
        applied_rule_ref: `${ruleVersion.version_id} — IRC §280A(c)(1) & Form 8829`,
        irs_citation: 'IRC §280A(c)(1) / IRS Publication 587 / Form 8829',
        calculation_explanation: `Compared Simplified ($${ho.simplifiedAmount.toLocaleString()} for ${profile.home_office_sqft} sq ft) vs. Regular Actual Method ($${ho.regularAmount.toLocaleString()} at ${((profile.home_office_sqft / profile.home_total_sqft) * 100).toFixed(1)}% business floor ratio). Larger method selected: ${fmt(ho.deduction)} deduction -> estimated federal tax impact ${fmt(realSavings)}.`,
        reasoning:
          'A home office is deductible only if the space is used regularly and exclusively as the principal place of business (IRC §280A). The deduction is capped at the business profit.',
        confidence_score: 0.94,
        source_transaction_ids: [],
        source_document_ids: [],
        missing_confirmations: profile.home_office_exclusive_regular_use
          ? []
          : ['Confirm exclusive and regular business use of the home office space'],
        created_at: now,
      });
    }
  }

  // 3. Special Optimization: Business Vehicle Mileage (Standard Mileage vs. Actual Expenses)
  if (profile.has_schedule_c && profile.vehicle_business_miles > 0) {
    const veh = computeVehicleDeduction({
      profile,
      standardMileageRateCents: rules.standard_mileage_rate_cents,
      rateChange: rules.standard_mileage_rate_change,
    });
    if (veh.deduction > 0) {
      const realSavings = estimateOpportunityEffect(inputs, 'potential', {
        toggles: { vehicle: false },
      });
      recommendations.push({
        id: `rec_${userId}_${profile.tax_year}_vehicle_mileage`,
        user_id: userId,
        tax_year: profile.tax_year,
        category: 'vehicle_mileage',
        title: `Business Vehicle Deduction (${veh.methodUsed === 'standard_mileage' ? `${rules.standard_mileage_rate_cents}¢/mile Standard Rate` : 'Actual Expense Method'})`,
        status: profile.vehicle_mileage_log_confirmed
          ? 'verified_by_document'
          : 'potentially_deductible_confirmation_required',
        deduction_or_credit_type: 'deduction',
        gross_amount: veh.deduction,
        eligible_deduction_or_credit_amount: veh.deduction,
        estimated_real_tax_savings: realSavings,
        applied_rule_ref: `${ruleVersion.version_id} — IRC §162(a) & §274(d) Mileage Rate`,
        irs_citation: `IRC §274(d) / Publication 463 / Schedule C line 9 (${ruleVersion.official_sources.map((s) => s.form_or_pub).join('; ')})`,
        calculation_explanation: `Compared Standard Mileage (${profile.vehicle_business_miles.toLocaleString()} business miles × $${(rules.standard_mileage_rate_cents / 100).toFixed(2)} = $${veh.standardMileageAmount.toLocaleString()}) vs. Actual Expenses ($${veh.actualExpenseAmount.toLocaleString()}). Larger method: ${fmt(veh.deduction)} deduction -> estimated federal tax impact ${fmt(realSavings)}. Vehicle costs on the statement are not counted again.`,
        reasoning:
          'Business mileage logged for client meetings and business errands reduces both income tax and Schedule SE self-employment tax.',
        confidence_score: 0.93,
        source_transaction_ids: [],
        source_document_ids: [],
        missing_confirmations: profile.vehicle_mileage_log_confirmed
          ? []
          : ['Confirm a contemporaneous mileage log (dates, destinations, business purpose) — required by IRC §274(d)'],
        created_at: now,
      });
    }
  }

  // 4. Special Optimization: Qualified Business Income (QBI) 20% Deduction (IRC §199A)
  const qbiAmount = calculationRun.scenarios.confirmed.qbi_deduction;
  if (qbiAmount > 0) {
    const qbiRealSavings = round2(qbiAmount * federalMarginal(calculationRun));
    recommendations.push({
      id: `rec_${userId}_${profile.tax_year}_qbi_199a`,
      user_id: userId,
      tax_year: profile.tax_year,
      category: 'qbi_deduction',
      title: '20% Qualified Business Income (QBI) Deduction (Form 8995)',
      status: 'verified_by_document',
      deduction_or_credit_type: 'deduction',
      gross_amount: calculationRun.scenarios.confirmed.schedule_c_net_profit,
      eligible_deduction_or_credit_amount: qbiAmount,
      estimated_real_tax_savings: qbiRealSavings,
      applied_rule_ref: `${ruleVersion.version_id} — IRC §199A (Form 8995)`,
      irs_citation: 'IRC §199A / IRS Form 8995 Instructions',
      calculation_explanation: `20% of net Qualified Business Income after SE tax, SE health insurance, and retirement adjustments = $${qbiAmount.toLocaleString()} deduction -> about ${fmt(qbiRealSavings)} less federal income tax at your marginal bracket. QBI does not reduce self-employment tax. Calculated as for a sole proprietor with no W-2 employees and no qualified property.`,
      reasoning:
        'Pass-through sole proprietorship net profit qualifies for the 20% §199A deduction subject to taxable income thresholds.',
      confidence_score: 0.99,
      source_transaction_ids: [],
      source_document_ids: [],
      missing_confirmations: [],
      created_at: now,
    });
  }

  // 5. Special Optimization: Self-Employed Health Insurance Deduction (IRC §162(l))
  const seHealthAmt = calculationRun.scenarios.confirmed.se_health_insurance_deduction;
  if (seHealthAmt > 0) {
    const seHealthSavings = estimateOpportunityEffect(inputs, 'confirmed', {
      toggles: { seHealthInsurance: false },
    });
    recommendations.push({
      id: `rec_${userId}_${profile.tax_year}_se_health`,
      user_id: userId,
      tax_year: profile.tax_year,
      category: 'se_health_insurance',
      title: 'Self-Employed Health Insurance Above-the-Line Deduction (Form 7206)',
      status: 'potentially_deductible_confirmation_required',
      deduction_or_credit_type: 'deduction',
      gross_amount: profile.self_employed_health_insurance_premiums,
      eligible_deduction_or_credit_amount: seHealthAmt,
      estimated_real_tax_savings: seHealthSavings,
      applied_rule_ref: `${ruleVersion.version_id} — IRC §162(l) / Schedule 1 Line 17`,
      irs_citation: 'IRC §162(l) / IRS Form 7206',
      calculation_explanation: `${fmt(seHealthAmt)} adjustment to income (capped at business profit after half of SE tax and retirement contributions) -> estimated federal tax impact ${fmt(seHealthSavings)}.`,
      reasoning:
        'Self-employed individuals with net Schedule C profit may deduct 100% of health, dental, and vision premiums above the line.',
      confidence_score: 0.96,
      source_transaction_ids: [],
      source_document_ids: [],
      missing_confirmations: ['Ensure taxpayer was not eligible to participate in an employer-subsidized health plan'],
      created_at: now,
    });
  }

  // 6. Special Optimization: SEP-IRA / Solo 401(k) Retirement Contribution
  const retAmt = calculationRun.scenarios.confirmed.retirement_contribution_deduction;
  if (retAmt > 0) {
    const retSavings = estimateOpportunityEffect(inputs, 'confirmed', {
      toggles: { retirement: false },
    });
    recommendations.push({
      id: `rec_${userId}_${profile.tax_year}_sep_ira`,
      user_id: userId,
      tax_year: profile.tax_year,
      category: 'retirement_contribution',
      title: 'Self-Employed SEP-IRA / Solo 401(k) Deduction (Schedule 1 Line 16)',
      status: 'potentially_deductible_confirmation_required',
      deduction_or_credit_type: 'deduction',
      gross_amount: profile.sep_ira_solo_401k_contributions,
      eligible_deduction_or_credit_amount: retAmt,
      estimated_real_tax_savings: retSavings,
      applied_rule_ref: `${ruleVersion.version_id} — IRC §404(h) / Publication 560`,
      irs_citation: 'IRC §404(h) / IRS Publication 560 (Retirement Plans for Small Business)',
      calculation_explanation: `$${retAmt.toLocaleString()} deductible contribution lowers Adjusted Gross Income directly, estimated federal tax impact ${fmt(retSavings)} (capped at 20% of net SE earnings and ${fmt(rules.sep_ira_dollar_limit)}).`,
      reasoning:
        'Contributions up to 20% of net adjusted self-employment income can be funded up until the tax filing deadline (including extensions).',
      confidence_score: 0.96,
      source_transaction_ids: [],
      source_document_ids: [],
      missing_confirmations: ['Confirm the plan type and that the contribution was made by the filing deadline'],
      created_at: now,
    });
  }

  // 7. Federal Tax Credits (Dollar-for-Dollar Tax Liability Reduction)
  const ctcAmt = calculationRun.scenarios.confirmed.child_tax_credit;
  if (ctcAmt > 0) {
    recommendations.push({
      id: `rec_${userId}_${profile.tax_year}_credit_ctc`,
      user_id: userId,
      tax_year: profile.tax_year,
      category: 'tax_credit',
      title: `Child Tax Credit (${profile.qualifying_children_under_17} qualifying child${profile.qualifying_children_under_17 === 1 ? '' : 'ren'})`,
      status: 'potentially_deductible_confirmation_required',
      deduction_or_credit_type: 'credit',
      gross_amount: ctcAmt,
      eligible_deduction_or_credit_amount: ctcAmt,
      estimated_real_tax_savings: ctcAmt, // Credits reduce tax 1:1
      applied_rule_ref: `${ruleVersion.version_id} — IRC §24 / Schedule 8812`,
      irs_citation: 'IRC §24 / Form 1040 Schedule 8812',
      calculation_explanation: `${profile.qualifying_children_under_17} child × ${fmt(rules.child_tax_credit_per_child)} (+ ${fmt(rules.other_dependent_credit)} per other dependent), reduced by $50 per $1,000 of AGI over ${fmt(rules.child_tax_credit_phaseout_start[profile.filing_status])}. Non-refundable part limited to income tax; refundable part (ACTC) up to ${fmt(rules.child_tax_credit_refundable_cap)} per child = 15% of earned income over $2,500. Total ${fmt(ctcAmt)}.`,
      reasoning:
        'Tax credits reduce tax liability dollar-for-dollar rather than merely reducing taxable income.',
      confidence_score: 0.9,
      source_transaction_ids: [],
      source_document_ids: [],
      missing_confirmations: ['Each child needs a valid SSN, must be under 17 at year end, and must have lived with you more than half the year'],
      created_at: now,
    });
  }

  const cdccAmt = calculationRun.scenarios.confirmed.child_and_dependent_care_credit;
  if (cdccAmt > 0) {
    recommendations.push({
      id: `rec_${userId}_${profile.tax_year}_credit_cdcc`,
      user_id: userId,
      tax_year: profile.tax_year,
      category: 'tax_credit',
      title: 'Child and Dependent Care Credit (Form 2441)',
      status: 'potentially_deductible_confirmation_required',
      deduction_or_credit_type: 'credit',
      gross_amount: profile.child_care_expenses_paid,
      eligible_deduction_or_credit_amount: cdccAmt,
      estimated_real_tax_savings: cdccAmt,
      applied_rule_ref: `${ruleVersion.version_id} — IRC §21 / Form 2441`,
      irs_citation: 'IRC §21 / IRS Form 2441',
      calculation_explanation: `Credit rate depends on AGI (${(rules.child_care_rate_schedule.max_rate * 100).toFixed(0)}% down to ${(rules.child_care_rate_schedule.final_floor_rate * 100).toFixed(0)}%) on up to ${fmt(rules.child_care_max_one_dependent)} (${fmt(rules.child_care_max_two_plus_dependents)} for 2+) of work-related care costs, limited by earned income and by income tax. ${fmt(profile.child_care_expenses_paid)} paid -> ${fmt(cdccAmt)}.`,
      reasoning:
        'Care expenses paid so the taxpayer could work or actively run a business qualify for Form 2441 credit.',
      confidence_score: 0.95,
      source_transaction_ids: [],
      source_document_ids: [],
      missing_confirmations: ['Requires care provider EIN/SSN and address on Form 2441'],
      created_at: now,
    });
  }

  const eduAmt = calculationRun.scenarios.confirmed.education_credit;
  if (eduAmt > 0) {
    recommendations.push({
      id: `rec_${userId}_${profile.tax_year}_credit_education`,
      user_id: userId,
      tax_year: profile.tax_year,
      category: 'tax_credit',
      title: 'Higher Education Tax Credit (AOTC / Lifetime Learning Credit — Form 8863)',
      status: 'potentially_deductible_confirmation_required',
      deduction_or_credit_type: 'credit',
      gross_amount: profile.education_expenses_paid,
      eligible_deduction_or_credit_amount: eduAmt,
      estimated_real_tax_savings: eduAmt,
      applied_rule_ref: `${ruleVersion.version_id} — IRC §25A / Form 8863`,
      irs_citation: 'IRC §25A / Form 8863',
      calculation_explanation: `Direct tax credit of $${eduAmt.toLocaleString()} based on $${profile.education_expenses_paid.toLocaleString()} of qualified tuition and enrollment fees.`,
      reasoning: 'Qualified higher education expenses verified against MAGI phase-out limits.',
      confidence_score: 0.94,
      source_transaction_ids: [],
      source_document_ids: [],
      missing_confirmations: ['Requires Form 1098-T from eligible educational institution'],
      created_at: now,
    });
  }

  const eitcAmt = calculationRun.scenarios.confirmed.earned_income_tax_credit;
  if (eitcAmt > 0) {
    recommendations.push({
      id: `rec_${userId}_${profile.tax_year}_credit_eitc`,
      user_id: userId,
      tax_year: profile.tax_year,
      category: 'tax_credit',
      title: 'Earned Income Tax Credit (EITC — Schedule EIC)',
      status: 'potentially_deductible_confirmation_required',
      deduction_or_credit_type: 'credit',
      gross_amount: eitcAmt,
      eligible_deduction_or_credit_amount: eitcAmt,
      estimated_real_tax_savings: eitcAmt,
      applied_rule_ref: `${ruleVersion.version_id} — IRC §32`,
      irs_citation: 'IRC §32 / IRS Publication 596',
      calculation_explanation: `Refundable credit of ${fmt(eitcAmt)} from the ${profile.tax_year} EIC table (earned income and AGI, ${Math.min(3, profile.qualifying_children_under_17)} qualifying child${profile.qualifying_children_under_17 === 1 ? '' : 'ren'}).`,
      reasoning: 'Earned income and AGI fall within the EITC limits for the year.',
      confidence_score: 0.85,
      source_transaction_ids: [],
      source_document_ids: [],
      missing_confirmations: [
        `Investment income must not exceed ${fmt(rules.eitc_investment_income_limit)}`,
        'Valid SSN, US residence more than half the year; with no qualifying child you must be 25–64',
      ],
      created_at: now,
    });
  }

  return recommendations.sort(
    (a, b) => b.estimated_real_tax_savings - a.estimated_real_tax_savings
  );
}

function federalMarginal(run: CalculationRunRecord): number {
  const s = run.scenarios.confirmed;
  // Federal income-tax marginal rate only (QBI does not change SE tax)
  const seShare = s.total_self_employment_tax > 0 ? 0.153 * 0.9235 : 0;
  return Math.max(0, s.marginal_combined_rate_pct / 100 - seShare);
}
