import {
  EvidenceClassification,
  ScheduleCCategory,
  TransactionClassificationRecord,
  TransactionGroup,
  TransactionRecord,
  TransactionSubType,
} from '@/types/tax';

const AMBIGUOUS_MERCHANTS = [
  'amazon',
  'amzn',
  'walmart',
  'target',
  'costco',
  'apple store',
  'best buy',
  'paypal',
  'venmo',
  'ebay',
];

export function isAmbiguousMerchant(merchantOrDesc: string): boolean {
  const lower = merchantOrDesc.toLowerCase();
  // Cloud services are not general retail purchases
  if (/amazon web services|\baws\b/.test(lower)) return false;
  return AMBIGUOUS_MERCHANTS.some((m) => lower.includes(m));
}

export function classifyTransactionRecord(params: {
  tx: TransactionRecord;
  hasItemizedReceipt?: boolean;
}): TransactionClassificationRecord {
  const { tx, hasItemizedReceipt = false } = params;
  const desc = `${tx.merchant_name} ${tx.raw_description}`.toLowerCase();
  const now = new Date().toISOString();

  let group: TransactionGroup = 'Personal expenses';
  let subType: TransactionSubType = 'personal_purchase';
  let scheduleCCategory: ScheduleCCategory = 'none';
  let evidenceClassification: EvidenceClassification = 'non_deductible';
  let businessUsePct = 0;
  let mealLimitPct = 100;
  let confidence = 0.92;
  let appliedRuleRef = 'IRC §262 (Personal, living, or family expenses)';
  let reasoning = 'Default classification as personal or unconfirmed expenditure.';
  const missingEvidenceItems: string[] = [];

  // 0. Check if extraction itself is incomplete / uncertain
  if (tx.review_status === 'needs_review' || !tx.transaction_date || tx.amount <= 0) {
    return {
      id: `cls_${tx.id}`,
      transaction_id: tx.id,
      user_id: tx.user_id,
      initial_group: 'Personal expenses',
      ai_group: 'Personal expenses',
      user_confirmed_group: null,
      effective_group: 'Personal expenses',
      sub_type: 'personal_purchase',
      schedule_c_category: 'none',
      evidence_classification: 'insufficient_data',
      business_use_pct: 0,
      meal_deduction_limit_pct: 100,
      is_user_overridden: false,
      confidence_score: tx.extraction_confidence,
      applied_rule_ref: 'QA Extraction Gate',
      reasoning:
        'Transaction date or amount was not confidently recognized. Requires manual user verification before tax inclusion.',
      missing_evidence_items: ['Confirm exact transaction date and dollar amount from original statement'],
      supporting_document_id: tx.document_id,
      updated_at: now,
    };
  }

  // 1. Non-expense transactions: Transfers, Credit Card Repayments, Loans, Owner Draws, Refunds
  if (
    tx.review_status === 'transfer_excluded' ||
    /transfer to checking|transfer from savings|internal transfer|transfer between accounts|zelle to self|ach transfer to own/i.test(
      desc
    )
  ) {
    return {
      id: `cls_${tx.id}`,
      transaction_id: tx.id,
      user_id: tx.user_id,
      initial_group: 'Non-expense transactions',
      ai_group: 'Non-expense transactions',
      user_confirmed_group: null,
      effective_group: 'Non-expense transactions',
      sub_type: 'transfer_between_own_accounts',
      schedule_c_category: 'none',
      evidence_classification: 'non_deductible',
      business_use_pct: 0,
      meal_deduction_limit_pct: 100,
      is_user_overridden: false,
      confidence_score: 0.99,
      applied_rule_ref: 'IRS Pub 334 — Inter-Account Transfer Exclusion',
      reasoning:
        'Transfer between the taxpayer’s own bank accounts. Excluded from both gross income and deductible expenses to prevent double counting.',
      missing_evidence_items: [],
      supporting_document_id: tx.document_id,
      updated_at: now,
    };
  }

  if (
    tx.review_status === 'cc_repayment_excluded' ||
    /chase credit crd epay|amex epayment|credit card payment|capital one crd pmt|citi card online payment|autopay credit card/i.test(
      desc
    )
  ) {
    return {
      id: `cls_${tx.id}`,
      transaction_id: tx.id,
      user_id: tx.user_id,
      initial_group: 'Non-expense transactions',
      ai_group: 'Non-expense transactions',
      user_confirmed_group: null,
      effective_group: 'Non-expense transactions',
      sub_type: 'credit_card_repayment',
      schedule_c_category: 'none',
      evidence_classification: 'non_deductible',
      business_use_pct: 0,
      meal_deduction_limit_pct: 100,
      is_user_overridden: false,
      confidence_score: 0.99,
      applied_rule_ref: 'IRS Pub 535 — Credit Card Liability Repayment Exclusion',
      reasoning:
        'Credit card bill payment from bank account. Excluded from expenses because underlying card purchases are tracked separately.',
      missing_evidence_items: [],
      supporting_document_id: tx.document_id,
      updated_at: now,
    };
  }

  if (/owner draw|owner contribution|capital contribution|loan principal|sba loan proceeds/i.test(desc)) {
    const isContribution = /contribution|proceeds/i.test(desc);
    return {
      id: `cls_${tx.id}`,
      transaction_id: tx.id,
      user_id: tx.user_id,
      initial_group: 'Non-expense transactions',
      ai_group: 'Non-expense transactions',
      user_confirmed_group: null,
      effective_group: 'Non-expense transactions',
      sub_type: isContribution ? 'owner_contribution' : 'owner_withdrawal',
      schedule_c_category: 'none',
      evidence_classification: 'non_deductible',
      business_use_pct: 0,
      meal_deduction_limit_pct: 100,
      is_user_overridden: false,
      confidence_score: 0.96,
      applied_rule_ref: 'IRS Pub 334 — Capital / Loan Principal Exclusion',
      reasoning: 'Capital contribution, owner draw, or loan principal transaction is neither taxable income nor a deductible expense.',
      missing_evidence_items: [],
      supporting_document_id: tx.document_id,
      updated_at: now,
    };
  }

  if (/refund|chargeback reversal|merchant credit/i.test(desc)) {
    return {
      id: `cls_${tx.id}`,
      transaction_id: tx.id,
      user_id: tx.user_id,
      initial_group: 'Non-expense transactions',
      ai_group: 'Non-expense transactions',
      user_confirmed_group: null,
      effective_group: 'Non-expense transactions',
      sub_type: 'refund_credit',
      schedule_c_category: 'none',
      evidence_classification: 'verified_by_document',
      business_use_pct: 0,
      meal_deduction_limit_pct: 100,
      is_user_overridden: false,
      confidence_score: 0.95,
      applied_rule_ref: 'IRS Schedule C — Expense Offset / Purchase Return',
      reasoning: 'Purchase refund or merchant credit; tracked as non-income offset.',
      missing_evidence_items: [],
      supporting_document_id: tx.document_id,
      updated_at: now,
    };
  }

  // 2. Income transactions
  if (tx.direction === 'inflow') {
    group = 'Income';
    if (/w-2|payroll|gusto payroll|adp wage|salary/i.test(desc)) {
      subType = 'w2_wages';
      appliedRuleRef = 'IRC §61 / Form W-2 Box 1';
      reasoning = 'Employment wages reported via W-2 or payroll direct deposit.';
    } else if (/1099-nec|1099-k|stripe payout|upwork|toptal|client invoice|consulting fee|retainer/i.test(desc)) {
      subType = 'freelance_1099_income';
      appliedRuleRef = 'IRC §61 / Schedule C Part I Line 1 (Gross Receipts)';
      reasoning = 'Self-employment / independent contractor gross receipts.';
    } else {
      subType = 'business_gross_receipts';
      appliedRuleRef = 'IRC §61 / Schedule C Gross Income';
      reasoning = 'Inbound business revenue or deposit.';
    }
    return {
      id: `cls_${tx.id}`,
      transaction_id: tx.id,
      user_id: tx.user_id,
      initial_group: group,
      ai_group: group,
      user_confirmed_group: null,
      effective_group: group,
      sub_type: subType,
      schedule_c_category: 'none',
      evidence_classification: 'verified_by_document',
      business_use_pct: 100,
      meal_deduction_limit_pct: 100,
      is_user_overridden: false,
      confidence_score: 0.97,
      applied_rule_ref: appliedRuleRef,
      reasoning,
      missing_evidence_items: [],
      supporting_document_id: tx.document_id,
      updated_at: now,
    };
  }

  // 3. Guardrail: Ambiguous Multi-Purpose Merchants (Amazon, Walmart, Target, Costco, Best Buy, Apple)
  if (isAmbiguousMerchant(desc) && !hasItemizedReceipt) {
    return {
      id: `cls_${tx.id}`,
      transaction_id: tx.id,
      user_id: tx.user_id,
      initial_group: 'Business expenses',
      ai_group: 'Business expenses',
      user_confirmed_group: null,
      effective_group: 'Business expenses',
      sub_type: 'operating_expense',
      schedule_c_category: 'equipment_and_supplies',
      evidence_classification: 'additional_info_required',
      business_use_pct: 100,
      meal_deduction_limit_pct: 100,
      is_user_overridden: false,
      confidence_score: 0.58,
      applied_rule_ref: 'IRC §162(a) & §274(d) — Substantiation Guardrail (Ambiguous Merchant)',
      reasoning:
        'Purchases at multi-purpose retailers (e.g., Amazon, Target, Walmart, Apple) cannot be treated as confirmed deductions by merchant name alone. Business purpose and itemized invoice must be confirmed.',
      missing_evidence_items: [
        'Confirm specific item purchased and business purpose',
        'Attach itemized invoice or receipt showing business items',
      ],
      supporting_document_id: tx.document_id,
      updated_at: now,
    };
  }

  // 4. Specific Schedule C Business Expense Categories
  if (/google ads|meta ads|facebook ads|linkedin ads|mailchimp|hubspot|webflow|framer/i.test(desc)) {
    group = 'Business expenses';
    subType = 'operating_expense';
    scheduleCCategory = 'advertising_and_marketing';
    evidenceClassification = 'potentially_deductible_confirmation_required';
    businessUsePct = 100;
    confidence = 0.94;
    appliedRuleRef = 'IRC §162(a) / Schedule C Line 8 (Advertising)';
    reasoning = 'Digital advertising or marketing platform expenditure directly tied to business promotion.';
  } else if (/adobe|figma|github|openai|anthropic|vercel|aws|amazon web services|notion|slack|zoom|jetbrains|linear|microsoft 365/i.test(desc)) {
    group = 'Business expenses';
    subType = 'operating_expense';
    scheduleCCategory = 'software_and_subscriptions';
    // Recurring SaaS subscriptions require user confirmation of business use % unless already confirmed
    evidenceClassification = 'potentially_deductible_confirmation_required';
    businessUsePct = 100;
    confidence = 0.88;
    appliedRuleRef = 'IRC §162(a) / Schedule C Line 18 or Line 27a (Software & Cloud Subscriptions)';
    reasoning =
      'Professional software or cloud infrastructure subscription. Eligible for Schedule C deduction to the extent used in business activity.',
    missingEvidenceItems.push('Confirm percentage of business use (e.g., 100% business vs. mixed personal/business)');
  } else if (/stripe fee|paypal fee|square fee|wire fee|ach fee|merchant processing|monthly maintenance fee/i.test(desc)) {
    group = 'Business expenses';
    subType = 'operating_expense';
    scheduleCCategory = 'bank_and_payment_processing_fees';
    evidenceClassification = 'verified_by_document';
    businessUsePct = 100;
    confidence = 0.98;
    appliedRuleRef = 'IRC §162(a) / Schedule C Line 10 (Commissions & Fees)';
    reasoning = 'Payment processing or business bank account fee directly incurred on gross receipts.';
  } else if (/cpa|legal|attorney|law firm|bookkeeping|gusto fee|upwork contractor|design contractor|tax prep/i.test(desc)) {
    group = 'Business expenses';
    subType = 'operating_expense';
    scheduleCCategory = 'professional_services';
    evidenceClassification = 'potentially_deductible_confirmation_required';
    businessUsePct = 100;
    confidence = 0.95;
    appliedRuleRef = 'IRC §162(a) / Schedule C Line 17 (Legal and Professional Services)';
    reasoning = 'Legal, accounting, bookkeeping, or professional contractor service fee.';
  } else if (/hiscox|next insurance|hartford business|errors and omissions|cyber liability insurance/i.test(desc)) {
    group = 'Business expenses';
    subType = 'operating_expense';
    scheduleCCategory = 'business_insurance';
    evidenceClassification = 'potentially_deductible_confirmation_required';
    businessUsePct = 100;
    confidence = 0.96;
    appliedRuleRef = 'IRC §162(a) / Schedule C Line 15 (Insurance, other than health)';
    reasoning = 'Business liability or E&O insurance policy premium.';
  } else if (/united airlines|delta air|american airlines|marriott|hilton|hyatt|airbnb business|amtrak/i.test(desc)) {
    group = 'Business expenses';
    subType = 'operating_expense';
    scheduleCCategory = 'business_travel';
    evidenceClassification = 'potentially_deductible_confirmation_required';
    businessUsePct = 100;
    confidence = 0.82;
    appliedRuleRef = 'IRC §162(a)(2) & §274(d) / Schedule C Line 24a (Travel)';
    reasoning = 'Airfare or lodging expense. Deductible if primary trip purpose was business away from tax home.',
    missingEvidenceItems.push('Confirm business purpose, destination, and dates of business trip');
  } else if (/restaurant|bistro|cafe|starbucks|sweetgreen|doordash|steakhouse|client lunch|business dinner/i.test(desc)) {
    group = 'Business expenses';
    subType = 'operating_expense';
    scheduleCCategory = 'eligible_business_meals';
    evidenceClassification = 'partially_deductible';
    businessUsePct = 100;
    mealLimitPct = 50;
    confidence = 0.78;
    appliedRuleRef = 'IRC §274(k) & §274(n) / Schedule C Line 24b (Meals — 50% Limitation)';
    reasoning =
      'Business meal with client or while traveling away from home is subject to the statutory 50% deduction limit and requires business attendee/purpose notes.',
    missingEvidenceItems.push('Confirm business attendee and business topic discussed');
  } else if (/verizon|at&t|t-mobile|comcast|xfinity|spectrum internet|google fiber/i.test(desc)) {
    group = 'Business expenses';
    subType = 'operating_expense';
    scheduleCCategory = 'telephone_and_internet';
    evidenceClassification = 'partially_deductible';
    businessUsePct = 60;
    confidence = 0.84;
    appliedRuleRef = 'IRC §162(a) / Schedule C Line 25 (Utilities — Business Portion of Phone & Internet)';
    reasoning =
      'Telephone and internet service used for both business and personal purposes. Only the substantiated business-use percentage is deductible.',
    missingEvidenceItems.push('Confirm business-use percentage of phone/internet service');
  } else if (/wework|regus|industrious|office suite rent/i.test(desc)) {
    group = 'Business expenses';
    subType = 'operating_expense';
    scheduleCCategory = 'rent';
    evidenceClassification = 'potentially_deductible_confirmation_required';
    businessUsePct = 100;
    confidence = 0.95;
    appliedRuleRef = 'IRC §162(a)(3) / Schedule C Line 20b (Rent or Lease — Other Business Property)';
    reasoning = 'Coworking space or commercial office lease payment.';
  } else if (/staples|office depot|uline|fedex office|usps|ups shipping/i.test(desc)) {
    group = 'Business expenses';
    subType = 'operating_expense';
    scheduleCCategory = 'office_expenses';
    evidenceClassification = 'potentially_deductible_confirmation_required';
    businessUsePct = 100;
    confidence = 0.93;
    appliedRuleRef = 'IRC §162(a) / Schedule C Line 18 (Office Expense)';
    reasoning = 'Office supplies, postage, or shipping expense.';
  } else if (/coursera|udemy|oreilly|pragmatic studio|professional conference|aws certification/i.test(desc)) {
    group = 'Business expenses';
    subType = 'operating_expense';
    scheduleCCategory = 'education_and_training';
    evidenceClassification = 'potentially_deductible_confirmation_required';
    businessUsePct = 100;
    confidence = 0.86;
    appliedRuleRef = 'Treas. Reg. §1.162-5 (Education Maintaining or Improving Skills in Existing Business)';
    reasoning =
      'Professional training or certification maintaining skills in the taxpayer’s current trade or business.',
    missingEvidenceItems.push('Confirm course maintains/improves skills in current business and does not qualify for a new trade');
  } else if (/macbook|dell precision|thinkpad|lenovo workstation|sony camera|server hardware|b&h photo/i.test(desc)) {
    group = 'Business expenses';
    subType = 'operating_expense';
    scheduleCCategory = 'depreciation_and_section_179';
    evidenceClassification = 'potentially_deductible_confirmation_required';
    businessUsePct = 100;
    confidence = 0.85;
    appliedRuleRef = 'IRC §179 & §168(k) / Form 4562 (Depreciation and Amortization)';
    reasoning =
      'Capital equipment acquisition (>1 year useful life). Eligible for Section 179 or Bonus Depreciation only if placed in service during the tax year and business use exceeds 50%.',
    missingEvidenceItems.push('Confirm date placed in service, asset type, and >50% business use percentage');
  } else {
    // Personal expenses (groceries, gym, streaming entertainment, clothing, residential)
    group = 'Personal expenses';
    subType = 'personal_purchase';
    scheduleCCategory = 'none';
    evidenceClassification = 'non_deductible';
    businessUsePct = 0;
    confidence = 0.94;
    appliedRuleRef = 'IRC §262 (Non-deductible Personal Living Expense)';
    reasoning = 'Personal living, family, grocery, fitness, or entertainment expenditure not deductible under IRC §262.';
  }

  return {
    id: `cls_${tx.id}`,
    transaction_id: tx.id,
    user_id: tx.user_id,
    initial_group: group,
    ai_group: group,
    user_confirmed_group: null,
    effective_group: group,
    sub_type: subType,
    schedule_c_category: scheduleCCategory,
    evidence_classification: evidenceClassification,
    business_use_pct: businessUsePct,
    meal_deduction_limit_pct: mealLimitPct,
    is_user_overridden: false,
    confidence_score: confidence,
    applied_rule_ref: appliedRuleRef,
    reasoning,
    missing_evidence_items: missingEvidenceItems,
    supporting_document_id: tx.document_id,
    updated_at: now,
  };
}
