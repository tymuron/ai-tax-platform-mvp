import { describe, it, expect } from 'vitest';
import { getTaxRulesForYear } from '@/lib/tax-rules/seed-rules';
import {
  computeHomeOfficeDeduction,
  computeProgressiveFederalTax,
  computeVehicleDeduction,
  runDeterministicTaxCalculation,
} from '@/lib/engines/tax-calculator';
import {
  extractTransactionsFromContent,
  reconcileAndNormalizeTransactions,
} from '@/lib/engines/document-intelligence';
import {
  classifyTransactionRecord,
  isAmbiguousMerchant,
} from '@/lib/engines/financial-analysis';
import { generateContextualInterviewQuestions } from '@/lib/engines/interview-engine';
import { generateTaxOptimizationRecommendations } from '@/lib/engines/optimization-engine';
import {
  buildStructuredTaxOptimizationReport,
  runQualityAssuranceEngine,
} from '@/lib/engines/qa-and-report-engine';
import {
  createSignedDownloadToken,
  maskSensitivePII,
  verifySignedDownloadToken,
} from '@/lib/security/crypto-and-masking';
import {
  signStripeWebhookPayload,
  verifyStripeWebhookSignature,
} from '@/lib/services/payment-and-export-service';
import { getDb } from '@/lib/db';
import { UserProfileRecord } from '@/types/tax';

const BASE_TEST_PROFILE: UserProfileRecord = {
  user_id: 'user_test_01',
  tax_year: 2025,
  filing_status: 'single',
  state_code: 'TX', // 0% state tax for pure federal reference cases
  business_type: 'Sole Proprietorship',
  industry_code: '541511',
  has_w2_income: true,
  has_1099_income: true,
  has_schedule_c: true,
  dependents_count: 0,
  qualifying_children_under_17: 0,
  child_care_expenses_paid: 0,
  education_expenses_paid: 0,
  education_years_claimed: 0,
  is_student_at_least_half_time: false,
  home_total_sqft: 2000,
  home_office_sqft: 200,
  home_office_exclusive_regular_use: true,
  home_annual_rent_or_mortgage_interest: 24000,
  home_annual_utilities_insurance: 3600,
  vehicle_total_miles: 10000,
  vehicle_business_miles: 4000,
  vehicle_actual_expenses: 2000,
  vehicle_placed_in_service_date: '2025-01-10',
  self_employed_health_insurance_premiums: 0,
  sep_ira_solo_401k_contributions: 0,
  estimated_tax_payments_made: 0,
  has_unsupported_complex_entity: false,
  unsupported_entity_notes: null,
  updated_at: '2026-11-08T00:00:00Z',
};

describe('AI Tax v2.0 — Reference Deterministic Tax Calculation Suite (100% Exact Match)', () => {
  it('1. Computes exact 2025 progressive federal income tax brackets for Single filer', () => {
    const rules2025 = getTaxRulesForYear(2025).rules_payload;
    // Taxable income = $60,000 for Single in 2025:
    // First $11,925 @ 10% = $1,192.50
    // Next ($48,475 - $11,925 = $36,550) @ 12% = $4,386.00
    // Remaining ($60,000 - $48,475 = $11,525) @ 22% = $2,535.50
    // Exact Total = $8,114.00
    const res = computeProgressiveFederalTax(
      60000,
      'single',
      rules2025.federal_brackets.single
    );
    expect(res.tax).toBe(8114.0);
    expect(res.marginalRate).toBe(0.22);
  });

  it('2. Computes exact Home Office Simplified vs Regular method and caps at tentative Schedule C profit', () => {
    // 200 sq ft of 2000 sq ft (10%)
    // Simplified: 200 * $5 = $1,000
    // Regular: ($24,000 + $3,600) * 10% = $2,760
    const ho = computeHomeOfficeDeduction({
      profile: BASE_TEST_PROFILE,
      tentativeScheduleCProfit: 50000,
      simplifiedRatePerSqFt: 5,
      simplifiedMaxSqFt: 300,
    });
    expect(ho.simplifiedAmount).toBe(1000);
    expect(ho.regularAmount).toBe(2760);
    expect(ho.methodUsed).toBe('regular');
    expect(ho.deduction).toBe(2760);

    // When tentative profit is only $800, IRC §280A(c)(5) caps deduction at $800
    const capped = computeHomeOfficeDeduction({
      profile: BASE_TEST_PROFILE,
      tentativeScheduleCProfit: 800,
      simplifiedRatePerSqFt: 5,
      simplifiedMaxSqFt: 300,
    });
    expect(capped.deduction).toBe(800);
  });

  it('3. Computes exact Vehicle Mileage (70 cents/mile in 2025) vs Actual Expenses', () => {
    // 4,000 business miles * $0.70 = $2,800 vs Actual (40% of $2,000 = $800)
    const veh = computeVehicleDeduction({
      profile: BASE_TEST_PROFILE,
      standardMileageRateCents: 70,
    });
    expect(veh.standardMileageAmount).toBe(2800);
    expect(veh.actualExpenseAmount).toBe(800);
    expect(veh.methodUsed).toBe('standard_mileage');
    expect(veh.deduction).toBe(2800);
  });

  it('4. Distinguishes $10,000 business expense deduction from real tax savings and reconciles Schedule C, SE, and QBI', async () => {
    const ruleVersion = getTaxRulesForYear(2025);
    const csvContent = [
      'Date,Description,Amount,Direction,Currency',
      '2025-03-01,Form 1099-NEC Consulting Revenue,100000.00,inflow,USD',
      '2025-04-15,Google Ads Marketing Campaign,10000.00,outflow,USD',
      '2025-05-10,Adobe Creative Cloud Subscription,720.00,outflow,USD',
      '2025-06-01,Amazon.com Marketplace Order #991,1500.00,outflow,USD',
      '2025-07-01,Transfer to Checking from Savings,8000.00,outflow,USD',
      '2025-08-01,Chase Credit Crd Epay AutoPay,3200.00,outflow,USD',
    ].join('\n');

    const extracted = await extractTransactionsFromContent({
      filename: 'test_statement.csv',
      format: 'CSV',
      buffer: Buffer.from(csvContent, 'utf8'),
      taxYear: 2025,
    });

    const processed = reconcileAndNormalizeTransactions({
      userId: BASE_TEST_PROFILE.user_id,
      documentId: 'doc_test_1',
      filename: 'test_statement.csv',
      mimeType: 'text/csv',
      format: 'CSV',
      documentType: 'bank_statement',
      fileSizeBytes: csvContent.length,
      storagePath: '/tmp/test.enc',
      buffer: Buffer.from(csvContent, 'utf8'),
      taxYear: 2025,
      ocrUsed: false,
      missingPagesDetected: false,
      extractedMetadata: {},
      extractedRows: extracted.extractedRows,
      existingTransactions: [],
    });

    const classifications = processed.transactions.map((tx) =>
      classifyTransactionRecord({ tx })
    );

    // Verify transfer and credit card repayment are classified as Non-expense transactions
    const transferCls = classifications.find(
      (c) => c.sub_type === 'transfer_between_own_accounts'
    );
    expect(transferCls?.effective_group).toBe('Non-expense transactions');

    const ccRepayCls = classifications.find(
      (c) => c.sub_type === 'credit_card_repayment'
    );
    expect(ccRepayCls?.effective_group).toBe('Non-expense transactions');

    // Verify Amazon is NOT automatically verified_by_document without confirmation
    const amazonTx = processed.transactions.find((t) =>
      t.merchant_name.toLowerCase().includes('amazon')
    );
    expect(isAmbiguousMerchant(amazonTx!.merchant_name)).toBe(true);
    const amazonCls = classifications.find((c) => c.transaction_id === amazonTx!.id);
    expect(amazonCls?.evidence_classification).toBe('additional_info_required');

    // Run deterministic tax calculation across all 3 scenarios
    const calcRun = runDeterministicTaxCalculation({
      userId: BASE_TEST_PROFILE.user_id,
      profile: BASE_TEST_PROFILE,
      transactions: processed.transactions,
      classifications,
      ruleVersion,
    });

    const { baseline, confirmed, potential } = calcRun.scenarios;

    // Gross income must be exactly $100,000 in all 3 scenarios (transfers & CC repayments excluded)
    expect(baseline.total_gross_income).toBe(100000);
    expect(confirmed.total_gross_income).toBe(100000);
    expect(potential.total_gross_income).toBe(100000);

    // Baseline has $0 advertising/home-office/mileage optimizations
    expect(baseline.total_schedule_c_deductions).toBe(0);

    // Confirmed includes $10,000 Google Ads (verified) + $2,800 Mileage + $2,760 Home Office = $15,560
    // (Adobe $720 and Amazon $1,500 are unconfirmed, so they are NOT in Confirmed!)
    expect(confirmed.total_schedule_c_deductions).toBe(15560);
    expect(confirmed.schedule_c_net_profit).toBe(84440);

    // Potential includes Confirmed ($15,560) + Adobe ($720) + Amazon ($1,500) = $17,780
    expect(potential.total_schedule_c_deductions).toBe(17780);
    expect(potential.schedule_c_net_profit).toBe(82220);

    // Real tax savings on $15,560 of confirmed deductions is strictly less than $15,560
    expect(confirmed.savings_vs_baseline).toBeGreaterThan(3500);
    expect(confirmed.savings_vs_baseline).toBeLessThan(15560);
    expect(potential.savings_vs_baseline).toBeGreaterThan(confirmed.savings_vs_baseline);

    // QA Engine check
    const recs = generateTaxOptimizationRecommendations({
      userId: BASE_TEST_PROFILE.user_id,
      profile: BASE_TEST_PROFILE,
      transactions: processed.transactions,
      classifications,
      ruleVersion,
      calculationRun: calcRun,
    });

    const qa = runQualityAssuranceEngine({
      documents: [processed.document],
      transactions: processed.transactions,
      classifications,
      calculationRun: calcRun,
      recommendations: recs,
      ruleVersion,
    });

    expect(qa.passed).toBe(true);
    expect(qa.metrics.tax_calculation_accuracy).toBe(100);
    expect(qa.metrics.duplicate_detection_accuracy).toBe(100);

    // Interview engine generates question for Adobe ($720) and Amazon ($1,500)
    const questions = generateContextualInterviewQuestions({
      userId: BASE_TEST_PROFILE.user_id,
      taxYear: 2025,
      profile: BASE_TEST_PROFILE,
      transactions: processed.transactions,
      classifications,
      existingQuestions: [],
    });
    expect(questions.some((q) => q.question_text.includes('Adobe'))).toBe(true);
    expect(questions.some((q) => q.question_text.includes('Amazon'))).toBe(true);

    // Report generation
    const report = buildStructuredTaxOptimizationReport({
      userId: BASE_TEST_PROFILE.user_id,
      profile: BASE_TEST_PROFILE,
      documents: [processed.document],
      transactions: processed.transactions,
      classifications,
      questions,
      recommendations: recs,
      calculationRun: calcRun,
      qaResult: qa,
    });
    expect(report.report_payload.estimated_tax_impact.confirmed_real_tax_savings).toBe(
      confirmed.savings_vs_baseline
    );
  });

  it('5. Enforces Security, PII Masking, Signed Download Links, Stripe Webhook Verification, and 16 PostgreSQL Tables', async () => {
    // PII Masking
    const raw =
      'ACH Payment SSN 123-45-6789 EIN 12-3456789 Card 4532 0151 1283 8899 john.doe@example.com';
    const masked = maskSensitivePII(raw);
    expect(masked).not.toContain('123-45-6789');
    expect(masked).not.toContain('12-3456789');
    expect(masked).not.toContain('4532 0151 1283 8899');
    expect(masked).not.toContain('john.doe@example.com');
    expect(masked).toContain('[REDACTED-SSN]');

    // Signed download tokens & cross-tenant isolation
    const { token } = createSignedDownloadToken({
      userId: 'user_alpha',
      resourceType: 'export_package',
      resourceId: 'rep_123',
      format: 'PDF',
    });
    expect(verifySignedDownloadToken(token, 'user_alpha').valid).toBe(true);
    expect(verifySignedDownloadToken(token, 'user_beta').valid).toBe(false);

    // Stripe webhook signature verification
    const payload = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded' });
    const sig = signStripeWebhookPayload(payload);
    expect(verifyStripeWebhookSignature(payload, sig).verified).toBe(true);
    expect(verifyStripeWebhookSignature(payload + 'tampered', sig).verified).toBe(false);

    // Verify all 16 required database entities exist in PostgreSQL
    const db = await getDb();
    const tablesRes = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );
    const tableNames = tablesRes.rows.map((r) => r.table_name);
    const requiredTables = [
      'users',
      'user_profiles',
      'subscriptions',
      'documents',
      'transactions',
      'transaction_classifications',
      'ai_questions',
      'ai_answers',
      'tax_analyses',
      'tax_recommendations',
      'generated_reports',
      'export_purchases',
      'ratings',
      'audit_logs',
      'tax_rule_versions',
      'calculation_runs',
    ];
    for (const reqTable of requiredTables) {
      expect(tableNames).toContain(reqTable);
    }
  });
});
