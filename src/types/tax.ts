export type TaxYear = 2025 | 2026;

export type FilingStatus =
  | 'single'
  | 'married_filing_jointly'
  | 'married_filing_separately'
  | 'head_of_household';

export type DocumentType =
  | 'bank_statement'
  | 'credit_card_statement'
  | 'w2'
  | '1099_nec'
  | '1099_k'
  | '1099_misc'
  | '1098'
  | '1095_a'
  | 'receipt'
  | 'invoice'
  | 'contract'
  | 'other_tax_document';

export type DocumentFormat = 'PDF' | 'CSV' | 'XLSX' | 'JPG' | 'PNG';

export type DocumentStatus =
  | 'uploaded'
  | 'processing'
  | 'processed'
  | 'needs_review'
  | 'failed';

export type TransactionGroup =
  | 'Income'
  | 'Business expenses'
  | 'Non-expense transactions'
  | 'Personal expenses';

export type TransactionSubType =
  | 'w2_wages'
  | 'business_gross_receipts'
  | 'freelance_1099_income'
  | 'interest_dividend_income'
  | 'other_income'
  | 'operating_expense'
  | 'transfer_between_own_accounts'
  | 'credit_card_repayment'
  | 'loan_proceeds'
  | 'loan_principal_repayment'
  | 'owner_contribution'
  | 'owner_withdrawal'
  | 'refund_credit'
  | 'personal_purchase'
  | 'personal_travel_entertainment'
  | 'mortgage_interest_1098'
  | 'health_marketplace_1095a';

export type ScheduleCCategory =
  | 'advertising_and_marketing'
  | 'office_expenses'
  | 'software_and_subscriptions'
  | 'professional_services'
  | 'business_insurance'
  | 'bank_and_payment_processing_fees'
  | 'business_travel'
  | 'business_mileage'
  | 'eligible_business_meals'
  | 'equipment_and_supplies'
  | 'rent'
  | 'utilities'
  | 'telephone_and_internet'
  | 'education_and_training'
  | 'vehicle_expenses'
  | 'home_office'
  | 'depreciation_and_section_179'
  | 'other_eligible_business_expenses'
  | 'none';

export type EvidenceClassification =
  | 'verified_by_document'
  | 'potentially_deductible_confirmation_required'
  | 'partially_deductible'
  | 'non_deductible'
  | 'additional_info_required'
  | 'insufficient_data';

export type ExtractionReviewStatus = 'ok' | 'needs_review' | 'duplicate_excluded' | 'transfer_excluded' | 'cc_repayment_excluded';

export interface UserRecord {
  id: string;
  email: string;
  full_name: string;
  role: 'user' | 'admin';
  status: 'active' | 'blocked';
  created_at: string;
}

export interface UserProfileRecord {
  user_id: string;
  tax_year: TaxYear;
  filing_status: FilingStatus;
  state_code: string;
  business_type: string;
  industry_code: string;
  has_w2_income: boolean;
  has_1099_income: boolean;
  has_schedule_c: boolean;
  dependents_count: number;
  qualifying_children_under_17: number;
  child_care_expenses_paid: number;
  education_expenses_paid: number;
  education_years_claimed: number;
  is_student_at_least_half_time: boolean;
  home_total_sqft: number;
  home_office_sqft: number;
  home_office_exclusive_regular_use: boolean;
  home_annual_rent_or_mortgage_interest: number;
  home_annual_utilities_insurance: number;
  vehicle_total_miles: number;
  vehicle_business_miles: number;
  vehicle_actual_expenses: number;
  vehicle_placed_in_service_date: string | null;
  self_employed_health_insurance_premiums: number;
  sep_ira_solo_401k_contributions: number;
  estimated_tax_payments_made: number;
  has_unsupported_complex_entity: boolean;
  unsupported_entity_notes: string | null;
  updated_at: string;
}

export interface SubscriptionRecord {
  id: string;
  user_id: string;
  plan: 'free_trial' | 'pro_monthly';
  status: 'active' | 'canceled' | 'past_due';
  price_cents: number;
  stripe_subscription_id: string | null;
  stripe_webhook_verified: boolean;
  current_period_end: string;
  created_at: string;
}

export interface DocumentRecord {
  id: string;
  user_id: string;
  tax_year: TaxYear;
  filename: string;
  mime_type: string;
  format: DocumentFormat;
  document_type: DocumentType;
  file_size_bytes: number;
  storage_path: string;
  checksum_sha256: string;
  status: DocumentStatus;
  ocr_used: boolean;
  extraction_confidence: number;
  period_start: string | null;
  period_end: string | null;
  missing_pages_detected: boolean;
  missing_periods_warning: string | null;
  extracted_metadata: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
}

export interface TransactionRecord {
  id: string;
  user_id: string;
  document_id: string;
  tax_year: TaxYear;
  transaction_date: string | null;
  amount: number;
  currency: string;
  direction: 'inflow' | 'outflow';
  merchant_name: string;
  raw_description: string;
  masked_description: string;
  source_page: number | null;
  source_line_ref: string;
  review_status: ExtractionReviewStatus;
  is_duplicate: boolean;
  duplicate_of_transaction_id: string | null;
  is_recurring: boolean;
  recurring_group_key: string | null;
  extraction_confidence: number;
  created_at: string;
}

export interface TransactionClassificationRecord {
  id: string;
  transaction_id: string;
  user_id: string;
  initial_group: TransactionGroup;
  ai_group: TransactionGroup;
  user_confirmed_group: TransactionGroup | null;
  effective_group: TransactionGroup;
  sub_type: TransactionSubType;
  schedule_c_category: ScheduleCCategory;
  evidence_classification: EvidenceClassification;
  business_use_pct: number;
  meal_deduction_limit_pct: number;
  is_user_overridden: boolean;
  confidence_score: number;
  applied_rule_ref: string;
  reasoning: string;
  missing_evidence_items: string[];
  supporting_document_id: string | null;
  updated_at: string;
}

export interface AIQuestionRecord {
  id: string;
  user_id: string;
  tax_year: TaxYear;
  related_transaction_ids: string[];
  question_key: string;
  category:
    | 'merchant_business_purpose'
    | 'recurring_subscription'
    | 'mixed_use_split'
    | 'missing_receipt'
    | 'home_office'
    | 'vehicle_mileage'
    | 'health_insurance'
    | 'tax_credits'
    | 'income_verification';
  question_text: string;
  context_summary: string;
  options: Array<{
    value: string;
    label: string;
    business_use_pct?: number;
  }>;
  status: 'pending' | 'answered' | 'skipped';
  priority: number;
  created_at: string;
}

export interface AIAnswerRecord {
  id: string;
  question_id: string;
  user_id: string;
  selected_option: string;
  custom_business_pct: number | null;
  custom_numeric_value: number | null;
  notes: string | null;
  answered_at: string;
}

export interface TaxRuleVersionRecord {
  version_id: string;
  tax_year: TaxYear;
  effective_date: string;
  last_verified_at: string;
  status: 'active' | 'deprecated' | 'draft';
  official_sources: Array<{
    form_or_pub: string;
    title: string;
    url: string;
  }>;
  rules_payload: TaxYearRulesPayload;
}

export interface TaxYearRulesPayload {
  tax_year: TaxYear;
  standard_deduction: Record<FilingStatus, number>;
  social_security_wage_base: number;
  social_security_rate: number;
  medicare_rate: number;
  additional_medicare_rate: number;
  additional_medicare_threshold: Record<FilingStatus, number>;
  se_net_earnings_factor: number;
  se_deductible_half_factor: number;
  qbi_deduction_rate: number;
  qbi_phaseout_start: Record<FilingStatus, number>;
  qbi_phaseout_range: Record<FilingStatus, number>;
  standard_mileage_rate_cents: number;
  home_office_simplified_rate_per_sqft: number;
  home_office_simplified_max_sqft: number;
  meals_deduction_factor: number;
  section_179_max_deduction: number;
  section_179_phaseout_threshold: number;
  bonus_depreciation_rate: number;
  child_tax_credit_per_child: number;
  child_tax_credit_refundable_cap: number;
  child_tax_credit_phaseout_start: Record<FilingStatus, number>;
  child_care_max_one_dependent: number;
  child_care_max_two_plus_dependents: number;
  child_care_credit_rate: number;
  aotc_max_credit: number;
  aotc_phaseout_start: Record<FilingStatus, number>;
  llc_max_credit: number;
  eitc_max_agi_no_children: Record<FilingStatus, number>;
  eitc_max_credit_no_children: number;
  eitc_max_agi_with_children: Record<FilingStatus, number>;
  eitc_max_credit_with_children: number;
  federal_brackets: Record<
    FilingStatus,
    Array<{ up_to: number | null; rate: number }>
  >;
  state_flat_effective_rates: Record<string, number>;
}

export interface ScenarioTaxBreakdown {
  scenario_id: 'baseline' | 'confirmed' | 'potential';
  scenario_label: string;
  requires_user_confirmation: boolean;
  w2_income: number;
  form_1099_and_business_gross_income: number;
  other_income: number;
  total_gross_income: number;
  schedule_c_expenses_by_category: Record<ScheduleCCategory, number>;
  home_office_deduction: number;
  vehicle_deduction: number;
  section_179_and_depreciation: number;
  total_schedule_c_deductions: number;
  schedule_c_net_profit: number;
  self_employment_tax_oasdi: number;
  self_employment_tax_medicare: number;
  additional_medicare_tax: number;
  total_self_employment_tax: number;
  deductible_half_se_tax: number;
  se_health_insurance_deduction: number;
  retirement_contribution_deduction: number;
  total_above_the_line_adjustments: number;
  adjusted_gross_income: number;
  standard_or_itemized_deduction: number;
  qbi_deduction: number;
  taxable_income: number;
  regular_federal_income_tax: number;
  child_tax_credit: number;
  child_and_dependent_care_credit: number;
  education_credit: number;
  earned_income_tax_credit: number;
  premium_tax_credit: number;
  total_tax_credits: number;
  federal_income_tax_after_credits: number;
  estimated_state_income_tax: number;
  total_estimated_tax_liability: number;
  withholding_and_estimated_payments: number;
  net_tax_owed_or_refund: number;
  effective_tax_rate_pct: number;
  marginal_combined_rate_pct: number;
  savings_vs_baseline: number;
}

export interface TaxRecommendationRecord {
  id: string;
  user_id: string;
  tax_year: TaxYear;
  category:
    | 'schedule_c_deduction'
    | 'missed_recurring_expense'
    | 'home_office'
    | 'vehicle_mileage'
    | 'section_179_depreciation'
    | 'qbi_deduction'
    | 'retirement_contribution'
    | 'se_health_insurance'
    | 'tax_credit'
    | 'estimated_tax_planning';
  title: string;
  status: EvidenceClassification;
  deduction_or_credit_type: 'deduction' | 'credit';
  gross_amount: number;
  eligible_deduction_or_credit_amount: number;
  estimated_real_tax_savings: number;
  applied_rule_ref: string;
  irs_citation: string;
  calculation_explanation: string;
  reasoning: string;
  confidence_score: number;
  source_transaction_ids: string[];
  source_document_ids: string[];
  missing_confirmations: string[];
  created_at: string;
}

export interface QualityAssuranceResult {
  passed: boolean;
  overall_status: 'verified' | 'needs_review' | 'blocked';
  blocking_issues: string[];
  warnings: string[];
  checks: Array<{
    check_key: string;
    label: string;
    passed: boolean;
    details: string;
  }>;
  metrics: {
    document_extraction_accuracy: number;
    transaction_extraction_accuracy: number;
    date_amount_accuracy: number;
    classification_accuracy: number;
    duplicate_detection_accuracy: number;
    tax_calculation_accuracy: number;
    recommendation_precision: number;
    user_correction_rate: number;
  };
}

export interface CalculationRunRecord {
  id: string;
  user_id: string;
  tax_year: TaxYear;
  rule_version_id: string;
  status: 'completed' | 'additional_review_required' | 'blocked_by_qa';
  additional_review_reasons: string[];
  input_snapshot: Record<string, unknown>;
  scenarios: {
    baseline: ScenarioTaxBreakdown;
    confirmed: ScenarioTaxBreakdown;
    potential: ScenarioTaxBreakdown;
  };
  formula_trace: Array<{
    step: string;
    rule_ref: string;
    formula: string;
    inputs: Record<string, number | string>;
    result: number;
  }>;
  created_at: string;
}

export interface GeneratedReportRecord {
  id: string;
  user_id: string;
  tax_year: TaxYear;
  calculation_run_id: string;
  rule_version_id: string;
  qa_status: 'verified' | 'needs_review' | 'blocked';
  report_payload: {
    header: {
      tax_year: TaxYear;
      generated_at: string;
      engine_version: string;
      rule_version_id: string;
      filing_status: FilingStatus;
      state_code: string;
      completeness_warnings: string[];
      assumptions_and_limitations: string[];
      legal_disclaimer: string;
    };
    financial_overview: {
      total_inflows: number;
      w2_income: number;
      form_1099_income: number;
      business_gross_receipts: number;
      confirmed_business_expenses: number;
      potential_business_expenses: number;
      personal_expenses: number;
      excluded_non_expense_transfers_and_repayments: number;
      excluded_duplicates: number;
      unclassified_or_needs_review_count: number;
    };
    potential_tax_deductions: TaxRecommendationRecord[];
    tax_credits: TaxRecommendationRecord[];
    missed_opportunities: TaxRecommendationRecord[];
    tax_optimization_scenarios: {
      baseline: ScenarioTaxBreakdown;
      confirmed: ScenarioTaxBreakdown;
      potential: ScenarioTaxBreakdown;
    };
    estimated_tax_impact: {
      baseline_tax_liability: number;
      confirmed_tax_liability: number;
      potential_tax_liability: number;
      confirmed_real_tax_savings: number;
      additional_potential_tax_savings_requiring_confirmation: number;
      important_distinction_note: string;
    };
    required_actions: Array<{
      action_type: 'answer_question' | 'upload_document' | 'review_transaction' | 'verify_period';
      title: string;
      description: string;
      impact_estimate: number;
      reference_id?: string;
    }>;
    qa_summary: QualityAssuranceResult;
  };
  created_at: string;
}

export interface ExportPurchaseRecord {
  id: string;
  user_id: string;
  tax_year: TaxYear;
  tier: 'essential_50' | 'professional_100' | 'complete_audit_200';
  amount_cents: number;
  status: 'pending' | 'paid' | 'refunded';
  stripe_payment_intent_id: string;
  stripe_webhook_verified: boolean;
  created_at: string;
}

export interface RatingRecord {
  id: string;
  user_id: string;
  export_purchase_id: string | null;
  stars: number;
  comment: string | null;
  created_at: string;
}

export interface AuditLogRecord {
  id: string;
  user_id: string | null;
  actor_role: 'user' | 'admin' | 'system';
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
