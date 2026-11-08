import { getDb, getStorageMode, writeAuditLog } from '@/lib/db';
import { computeSha256 } from '@/lib/security/crypto-and-masking';
import { isStripeConfigured } from '@/lib/services/stripe-billing';
import {
  AIQuestionRecord,
  CalculationRunRecord,
  DocumentRecord,
  ExportPurchaseRecord,
  GeneratedReportRecord,
  RatingRecord,
  SubscriptionRecord,
  TaxRecommendationRecord,
  TaxRuleVersionRecord,
  TaxYear,
  TransactionClassificationRecord,
  TransactionRecord,
  UserProfileRecord,
} from '@/types/tax';
import { getTaxRulesForYear } from '@/lib/tax-rules/seed-rules';
import {
  detectDocumentFormat,
  extractTransactionsFromContent,
  reconcileAndNormalizeTransactions,
} from '@/lib/engines/document-intelligence';
import { classifyTransactionRecord } from '@/lib/engines/financial-analysis';
import { generateContextualInterviewQuestions } from '@/lib/engines/interview-engine';
import { runDeterministicTaxCalculation } from '@/lib/engines/tax-calculator';
import { generateTaxOptimizationRecommendations } from '@/lib/engines/optimization-engine';
import {
  buildStructuredTaxOptimizationReport,
  runQualityAssuranceEngine,
} from '@/lib/engines/qa-and-report-engine';
import { saveEncryptedFileToVault } from '@/lib/security/vault-and-auth';

const DEMO_SAMPLE_STATEMENTS: Array<{
  filename: string;
  mimeType: string;
  content: string;
}> = [
  {
    filename: '2025_Form_W2_and_1099_NEC_Summary.csv',
    mimeType: 'text/csv',
    content: [
      'Date,Description,Amount,Direction,Currency',
      '2025-01-31,Gusto Payroll Direct Deposit W-2 Wages,45000.00,inflow,USD',
      '2025-03-15,Form 1099-NEC Client Retainer - Apex FinTech Corp,38500.00,inflow,USD',
      '2025-06-20,Form 1099-NEC Consulting Milestone - NorthStar AI,44000.00,inflow,USD',
      '2025-09-18,Stripe Payout 1099-K SaaS Advisory Clients,27500.00,inflow,USD',
    ].join('\n'),
  },
  {
    filename: '2025_Business_Checking_and_Card_Statement_FullYear.csv',
    mimeType: 'text/csv',
    content: [
      'Date,Description,Amount,Direction,Currency',
      '2025-01-12,Stripe Fee - Payment Processing Commissions,895.00,outflow,USD',
      '2025-02-04,Google Ads Campaign - B2B Lead Gen,2400.00,outflow,USD',
      '2025-02-18,Hiscox Business Liability & E&O Insurance,1350.00,outflow,USD',
      '2025-03-05,WeWork Dedicated Desk Coworking Lease,3600.00,outflow,USD',
      '2025-03-22,Baker Tilly CPA & Legal Advisory Services,1850.00,outflow,USD',
      '2025-04-10,Adobe Creative Cloud Subscription,360.00,outflow,USD',
      '2025-05-10,Adobe Creative Cloud Subscription,360.00,outflow,USD',
      '2025-06-14,Amazon Web Services (AWS) Cloud Hosting,1480.00,outflow,USD',
      '2025-07-09,Amazon.com Marketplace Order #114-99210,1240.00,outflow,USD',
      '2025-08-15,United Airlines Flight SFO-NYC Client Summit,920.00,outflow,USD',
      '2025-09-03,Bistro Client Dinner with Apex VP Engineering,420.00,outflow,USD',
      '2025-10-11,Verizon Wireless & Fiber High-Speed Internet,1680.00,outflow,USD',
      '2025-11-02,Staples Office Supplies & Shipping Postage,410.00,outflow,USD',
      '2025-11-19,Transfer to Checking from Business Savings Account,5000.00,outflow,USD',
      '2025-12-01,Chase Credit Crd Epay - AutoPay Full Balance,4200.00,outflow,USD',
      '2025-12-10,Whole Foods Market Family Groceries,640.00,outflow,USD',
      '2025-12-10,Whole Foods Market Family Groceries,640.00,outflow,USD',
    ].join('\n'),
  },
];

function parseNumericRow<T>(row: T): T {
  const out: Record<string, unknown> = { ...(row as unknown as Record<string, unknown>) };
  for (const [k, v] of Object.entries(out)) {
    if (
      typeof v === 'string' &&
      /^-?\d+(\.\d+)?$/.test(v) &&
      !k.endsWith('_id') &&
      !k.endsWith('_code') &&
      !k.endsWith('_ref') &&
      k !== 'id' &&
      k !== 'version_id' &&
      k !== 'checksum_sha256'
    ) {
      out[k] = Number(v);
    }
  }
  return out as unknown as T;
}

/** Seeds the sample statements — only ever for an anonymous demo account (users.is_demo). */
export async function ensureDemoWorkspaceSeeded(userId: string): Promise<void> {
  const db = await getDb();
  const demoRes = await db.query<{ is_demo: boolean }>(`SELECT is_demo FROM users WHERE id = $1`, [userId]);
  if (!demoRes.rows[0]?.is_demo) return;
  const docCountRes = await db.query<{ cnt: string }>(
    `SELECT COUNT(*)::text as cnt FROM documents WHERE user_id = $1`,
    [userId]
  );
  const count = Number(docCountRes.rows[0]?.cnt || '0');
  if (count > 0) return;

  for (const sample of DEMO_SAMPLE_STATEMENTS) {
    await ingestDocumentForUser({
      userId,
      taxYear: 2025,
      filename: sample.filename,
      mimeType: sample.mimeType,
      buffer: Buffer.from(sample.content, 'utf8'),
      skipPipelineRecompute: true,
      bypassTrialLimit: true,
    });
  }

  await recomputeTaxWorkspaceForUser(userId, 2025);
}

export async function ingestDocumentForUser(params: {
  userId: string;
  taxYear: TaxYear;
  filename: string;
  mimeType: string;
  buffer: Buffer;
  skipPipelineRecompute?: boolean;
  bypassTrialLimit?: boolean;
}): Promise<{
  document: DocumentRecord;
  transactionsInserted: number;
  warnings: string[];
}> {
  const { userId, taxYear, filename, mimeType, buffer, skipPipelineRecompute, bypassTrialLimit } = params;
  const db = await getDb();

  const checksum = computeSha256(buffer);
  const dupDoc = await db.query<{ filename: string }>(
    `SELECT filename FROM documents WHERE user_id = $1 AND tax_year = $2 AND checksum_sha256 = $3 LIMIT 1`,
    [userId, taxYear, checksum]
  );
  if (dupDoc.rows[0]) {
    throw new Error(
      `DUPLICATE_DOCUMENT: this exact file was already uploaded as "${dupDoc.rows[0].filename}". It was not added again, so nothing is counted twice.`
    );
  }

  // Check Free Trial vs Subscription entitlement limit
  const subRes = await db.query<SubscriptionRecord>(
    `SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  const sub = subRes.rows[0];
  const existingDocsRes = await db.query<{ cnt: string }>(
    `SELECT COUNT(*)::text as cnt FROM documents WHERE user_id = $1 AND tax_year = $2`,
    [userId, taxYear]
  );
  const existingDocsCount = Number(existingDocsRes.rows[0]?.cnt || '0');

  if (
    (!sub || sub.plan !== 'pro_monthly' || sub.status !== 'active' || !sub.stripe_webhook_verified) &&
    existingDocsCount >= 1 &&
    !bypassTrialLimit
  ) {
    throw new Error(
      'FREE_TRIAL_LIMIT_REACHED: Free Trial allows uploading 1 bank statement. Upgrade to the $10/month Pro Subscription to upload unlimited tax documents, W-2s, 1099s, and receipts.'
    );
  }

  const docId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const storagePath = await saveEncryptedFileToVault(userId, docId, buffer);
  const format = detectDocumentFormat(filename, mimeType);

  const extraction = await extractTransactionsFromContent({
    filename,
    format,
    buffer,
    taxYear,
  });

  const existingTxRes = await db.query<TransactionRecord>(
    `SELECT * FROM transactions WHERE user_id = $1 AND tax_year = $2`,
    [userId, taxYear]
  );
  const existingTransactions = existingTxRes.rows.map((r) => parseNumericRow(r));

  const processed = reconcileAndNormalizeTransactions({
    userId,
    documentId: docId,
    filename,
    mimeType,
    format,
    documentType: extraction.documentType,
    fileSizeBytes: buffer.length,
    storagePath,
    buffer,
    taxYear,
    ocrUsed: extraction.ocrUsed,
    missingPagesDetected: extraction.missingPagesDetected,
    extractedMetadata: extraction.extractedMetadata,
    extractedRows: extraction.extractedRows,
    existingTransactions,
  });

  const doc = processed.document;
  if (extraction.extractionError) {
    doc.status = 'needs_review';
    doc.error_message = extraction.extractionError;
  } else if (
    processed.transactions.length === 0 &&
    Object.keys(extraction.extractedMetadata || {}).length === 0
  ) {
    doc.status = 'needs_review';
    doc.error_message =
      'No transactions or tax-form values could be recognised in this file. Nothing from it is used in the analysis. Upload a CSV/XLSX export or a text-based PDF, or enter the values manually.';
  }
  await db.query(
    `INSERT INTO documents (
      id, user_id, tax_year, filename, mime_type, format, document_type,
      file_size_bytes, storage_path, checksum_sha256, status, ocr_used,
      extraction_confidence, period_start, period_end, missing_pages_detected,
      missing_periods_warning, extracted_metadata, error_message, created_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
    )`,
    [
      doc.id,
      doc.user_id,
      doc.tax_year,
      doc.filename,
      doc.mime_type,
      doc.format,
      doc.document_type,
      doc.file_size_bytes,
      doc.storage_path,
      doc.checksum_sha256,
      doc.status,
      doc.ocr_used,
      doc.extraction_confidence,
      doc.period_start,
      doc.period_end,
      doc.missing_pages_detected,
      doc.missing_periods_warning,
      JSON.stringify(doc.extracted_metadata),
      doc.error_message,
      doc.created_at,
    ]
  );

  for (const tx of processed.transactions) {
    await db.query(
      `INSERT INTO transactions (
        id, user_id, document_id, tax_year, transaction_date, amount, currency,
        direction, merchant_name, raw_description, masked_description,
        source_page, source_line_ref, review_status, is_duplicate,
        duplicate_of_transaction_id, is_recurring, recurring_group_key,
        extraction_confidence, created_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
      )`,
      [
        tx.id,
        tx.user_id,
        tx.document_id,
        tx.tax_year,
        tx.transaction_date,
        tx.amount,
        tx.currency,
        tx.direction,
        tx.merchant_name,
        tx.raw_description,
        tx.masked_description,
        tx.source_page,
        tx.source_line_ref,
        tx.review_status,
        tx.is_duplicate,
        tx.duplicate_of_transaction_id,
        tx.is_recurring,
        tx.recurring_group_key,
        tx.extraction_confidence,
        tx.created_at,
      ]
    );

    const cls = classifyTransactionRecord({ tx });
    await db.query(
      `INSERT INTO transaction_classifications (
        id, transaction_id, user_id, initial_group, ai_group, user_confirmed_group,
        effective_group, sub_type, schedule_c_category, evidence_classification,
        business_use_pct, meal_deduction_limit_pct, is_user_overridden,
        confidence_score, applied_rule_ref, reasoning, missing_evidence_items,
        supporting_document_id, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
      )`,
      [
        cls.id,
        cls.transaction_id,
        cls.user_id,
        cls.initial_group,
        cls.ai_group,
        cls.user_confirmed_group,
        cls.effective_group,
        cls.sub_type,
        cls.schedule_c_category,
        cls.evidence_classification,
        cls.business_use_pct,
        cls.meal_deduction_limit_pct,
        cls.is_user_overridden,
        cls.confidence_score,
        cls.applied_rule_ref,
        cls.reasoning,
        JSON.stringify(cls.missing_evidence_items),
        cls.supporting_document_id,
        cls.updated_at,
      ]
    );
  }

  await writeAuditLog({
    userId,
    actorRole: 'user',
    action: 'DOCUMENT_UPLOADED_AND_PROCESSED',
    entityType: 'document',
    entityId: doc.id,
    metadata: {
      filename: doc.filename,
      format: doc.format,
      document_type: doc.document_type,
      transactions_extracted: processed.transactions.length,
    },
  });

  if (!skipPipelineRecompute) {
    await recomputeTaxWorkspaceForUser(userId, taxYear);
  }

  return {
    document: doc,
    transactionsInserted: processed.transactions.length,
    warnings: processed.warnings,
  };
}

export async function recomputeTaxWorkspaceForUser(
  userId: string,
  taxYear: TaxYear
): Promise<{
  calculationRun: CalculationRunRecord;
  report: GeneratedReportRecord;
  recommendations: TaxRecommendationRecord[];
  questions: AIQuestionRecord[];
}> {
  const db = await getDb();

  const profileRes = await db.query<UserProfileRecord>(
    `SELECT * FROM user_profiles WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  const profile = parseNumericRow(profileRes.rows[0]);
  profile.tax_year = taxYear;

  const docsRes = await db.query<DocumentRecord>(
    `SELECT * FROM documents WHERE user_id = $1 AND tax_year = $2 ORDER BY created_at ASC`,
    [userId, taxYear]
  );
  const documents = docsRes.rows.map((d) => parseNumericRow(d));

  const txRes = await db.query<TransactionRecord>(
    `SELECT * FROM transactions WHERE user_id = $1 AND tax_year = $2 ORDER BY transaction_date ASC NULLS LAST, created_at ASC`,
    [userId, taxYear]
  );
  const transactions = txRes.rows.map((t) => parseNumericRow(t));

  const clsRes = await db.query<TransactionClassificationRecord>(
    `SELECT tc.* FROM transaction_classifications tc
     JOIN transactions t ON t.id = tc.transaction_id
     WHERE tc.user_id = $1 AND t.tax_year = $2`,
    [userId, taxYear]
  );
  const classifications = clsRes.rows.map((c) => parseNumericRow(c));

  const existingQRes = await db.query<AIQuestionRecord>(
    `SELECT * FROM ai_questions WHERE user_id = $1 AND tax_year = $2 ORDER BY priority ASC, created_at ASC`,
    [userId, taxYear]
  );
  const existingQuestions = existingQRes.rows.map((q) => parseNumericRow(q));

  // 1. Update / Generate AI Interview Questions
  const questions = generateContextualInterviewQuestions({
    userId,
    taxYear,
    profile,
    transactions,
    classifications,
    existingQuestions,
  });

  for (const q of questions) {
    await db.query(
      `INSERT INTO ai_questions (
        id, user_id, tax_year, related_transaction_ids, question_key,
        category, question_text, context_summary, options, status, priority, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (user_id, tax_year, question_key) DO UPDATE SET
        related_transaction_ids = EXCLUDED.related_transaction_ids,
        question_text = EXCLUDED.question_text,
        context_summary = EXCLUDED.context_summary`,
      [
        q.id,
        q.user_id,
        q.tax_year,
        JSON.stringify(q.related_transaction_ids),
        q.question_key,
        q.category,
        q.question_text,
        q.context_summary,
        JSON.stringify(q.options),
        q.status,
        q.priority,
        q.created_at,
      ]
    );
  }

  // 2. Rule version: the code tables are the single source of truth (pinned by reference tests);
  // the DB copy exists for audit and the admin governance view.
  const ruleVersion: TaxRuleVersionRecord = getTaxRulesForYear(taxYear);

  // 3. Deterministic Tax Calculation Engine
  const calculationRun = runDeterministicTaxCalculation({
    userId,
    profile,
    transactions,
    classifications,
    ruleVersion,
    documentTypes: documents.map((d) => d.document_type),
  });

  await db.query(
    `INSERT INTO calculation_runs (
      id, user_id, tax_year, rule_version_id, status, additional_review_reasons,
      input_snapshot, scenarios, formula_trace, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      calculationRun.id,
      calculationRun.user_id,
      calculationRun.tax_year,
      calculationRun.rule_version_id,
      calculationRun.status,
      JSON.stringify(calculationRun.additional_review_reasons),
      JSON.stringify(calculationRun.input_snapshot),
      JSON.stringify(calculationRun.scenarios),
      JSON.stringify(calculationRun.formula_trace),
      calculationRun.created_at,
    ]
  );

  // 4. AI Tax Optimization Recommendations
  const recommendations = generateTaxOptimizationRecommendations({
    userId,
    profile,
    transactions,
    classifications,
    ruleVersion,
    calculationRun,
  });

  await db.query(
    `DELETE FROM tax_recommendations WHERE user_id = $1 AND tax_year = $2`,
    [userId, taxYear]
  );

  for (const rec of recommendations) {
    await db.query(
      `INSERT INTO tax_recommendations (
        id, user_id, tax_year, category, title, status, deduction_or_credit_type,
        gross_amount, eligible_deduction_or_credit_amount, estimated_real_tax_savings,
        applied_rule_ref, irs_citation, calculation_explanation, reasoning,
        confidence_score, source_transaction_ids, source_document_ids,
        missing_confirmations, created_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
      )`,
      [
        rec.id,
        rec.user_id,
        rec.tax_year,
        rec.category,
        rec.title,
        rec.status,
        rec.deduction_or_credit_type,
        rec.gross_amount,
        rec.eligible_deduction_or_credit_amount,
        rec.estimated_real_tax_savings,
        rec.applied_rule_ref,
        rec.irs_citation,
        rec.calculation_explanation,
        rec.reasoning,
        rec.confidence_score,
        JSON.stringify(rec.source_transaction_ids),
        JSON.stringify(rec.source_document_ids),
        JSON.stringify(rec.missing_confirmations),
        rec.created_at,
      ]
    );
  }

  // 5. Quality Assurance Engine
  const qaResult = runQualityAssuranceEngine({
    documents,
    transactions,
    classifications,
    calculationRun,
    recommendations,
    ruleVersion,
  });

  // 6. Structured Tax Optimization Report
  const report = buildStructuredTaxOptimizationReport({
    userId,
    profile,
    documents,
    transactions,
    classifications,
    questions,
    recommendations,
    calculationRun,
    qaResult,
  });

  await db.query(
    `INSERT INTO generated_reports (
      id, user_id, tax_year, calculation_run_id, rule_version_id, qa_status, report_payload, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      report.id,
      report.user_id,
      report.tax_year,
      report.calculation_run_id,
      report.rule_version_id,
      report.qa_status,
      JSON.stringify(report.report_payload),
      report.created_at,
    ]
  );

  // Also record in tax_analyses
  const analysisId = `ana_${taxYear}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await db.query(
    `INSERT INTO tax_analyses (
      id, user_id, tax_year, rule_version_id, status,
      baseline_tax_liability, confirmed_tax_liability, potential_tax_liability,
      confirmed_savings, potential_additional_savings, qa_passed, summary_json, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      analysisId,
      userId,
      taxYear,
      ruleVersion.version_id,
      qaResult.overall_status,
      report.report_payload.estimated_tax_impact.baseline_tax_liability,
      report.report_payload.estimated_tax_impact.confirmed_tax_liability,
      report.report_payload.estimated_tax_impact.potential_tax_liability,
      report.report_payload.estimated_tax_impact.confirmed_real_tax_savings,
      report.report_payload.estimated_tax_impact
        .additional_potential_tax_savings_requiring_confirmation,
      qaResult.passed,
      JSON.stringify(report.report_payload.financial_overview),
      report.created_at,
    ]
  );

  return {
    calculationRun,
    report,
    recommendations,
    questions,
  };
}

export async function getFullWorkspaceState(userId: string, taxYear?: TaxYear) {
  const db = await getDb();

  const userRes = await db.query(
    `SELECT id, email, full_name, role, status, is_demo, created_at FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const user = userRes.rows[0];

  const profileRes = await db.query<UserProfileRecord>(
    `SELECT * FROM user_profiles WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  const profile = parseNumericRow(profileRes.rows[0]);
  const activeYear: TaxYear = taxYear || profile.tax_year || 2025;

  const subRes = await db.query<SubscriptionRecord>(
    `SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  const subscription = subRes.rows[0] ? parseNumericRow(subRes.rows[0]) : null;

  const docsRes = await db.query<DocumentRecord>(
    `SELECT * FROM documents WHERE user_id = $1 AND tax_year = $2 ORDER BY created_at DESC`,
    [userId, activeYear]
  );
  const documents = docsRes.rows.map((d) => parseNumericRow(d));

  const txRes = await db.query<TransactionRecord>(
    `SELECT * FROM transactions WHERE user_id = $1 AND tax_year = $2 ORDER BY transaction_date DESC NULLS LAST, created_at DESC`,
    [userId, activeYear]
  );
  const transactions = txRes.rows.map((t) => parseNumericRow(t));

  const clsRes = await db.query<TransactionClassificationRecord>(
    `SELECT tc.* FROM transaction_classifications tc
     JOIN transactions t ON t.id = tc.transaction_id
     WHERE tc.user_id = $1 AND t.tax_year = $2`,
    [userId, activeYear]
  );
  const classifications = clsRes.rows.map((c) => parseNumericRow(c));

  const qRes = await db.query<AIQuestionRecord>(
    `SELECT * FROM ai_questions WHERE user_id = $1 AND tax_year = $2 ORDER BY priority ASC, created_at ASC`,
    [userId, activeYear]
  );
  const questions = qRes.rows.map((q) => parseNumericRow(q));

  const repRes = await db.query<GeneratedReportRecord>(
    `SELECT * FROM generated_reports WHERE user_id = $1 AND tax_year = $2 ORDER BY created_at DESC LIMIT 1`,
    [userId, activeYear]
  );

  let latestReport = repRes.rows[0] ? parseNumericRow(repRes.rows[0]) : null;
  let latestCalcRun: CalculationRunRecord | null = null;

  if (!latestReport) {
    const recomputed = await recomputeTaxWorkspaceForUser(userId, activeYear);
    latestReport = recomputed.report;
    latestCalcRun = recomputed.calculationRun;
  } else {
    const calcRes = await db.query<CalculationRunRecord>(
      `SELECT * FROM calculation_runs WHERE id = $1 LIMIT 1`,
      [latestReport.calculation_run_id]
    );
    latestCalcRun = calcRes.rows[0] ? parseNumericRow(calcRes.rows[0]) : null;
  }

  const exportsRes = await db.query<ExportPurchaseRecord>(
    `SELECT * FROM export_purchases WHERE user_id = $1 AND tax_year = $2 ORDER BY created_at DESC`,
    [userId, activeYear]
  );
  const exportPurchases = exportsRes.rows.map((e) => parseNumericRow(e));

  const ratingsRes = await db.query<RatingRecord>(
    `SELECT * FROM ratings WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  const ratings = ratingsRes.rows.map((r) => parseNumericRow(r));

  return {
    user,
    profile,
    subscription,
    documents,
    transactions,
    classifications,
    questions,
    report: latestReport,
    calculationRun: latestCalcRun,
    exportPurchases,
    ratings,
    serviceConfigStatus: {
      // Classification is rule-based; no external AI model is called by this build.
      openaiConfigured: false,
      aiMode: 'rule_based',
      stripeConfigured: isStripeConfigured(),
      storageMode: getStorageMode(),
      databaseEngine:
        getStorageMode() === 'postgres'
          ? 'PostgreSQL (DATABASE_URL)'
          : getStorageMode() === 'embedded_ephemeral'
          ? 'Temporary demo storage — data is lost when the server restarts'
          : 'Embedded PostgreSQL (local file)',
      privateVaultEncryption: 'AES-256-GCM, files kept in the database; signed 15-minute download links',
    },
  };
}

/** Creates the per-user profile row with neutral defaults (nothing pre-filled about the person). */
export async function createProfileForUser(userId: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.query(
    `INSERT INTO user_profiles (user_id, tax_year, filing_status, state_code, business_type, industry_code,
       has_w2_income, has_1099_income, has_schedule_c, home_total_sqft, updated_at)
     VALUES ($1, 2025, 'single', 'CA', 'Sole proprietor / freelancer', 'Not specified', TRUE, TRUE, TRUE, 0, $2)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, now]
  );
}

/** Sample profile used only for anonymous demo accounts. */
export async function applyDemoProfile(userId: string): Promise<void> {
  const db = await getDb();
  await db.query(
    `UPDATE user_profiles SET
       business_type = 'Sole proprietor — consultant (sample data)', industry_code = '541611',
       dependents_count = 1, qualifying_children_under_17 = 1, child_care_expenses_paid = 3200,
       home_total_sqft = 1600, home_office_sqft = 220, home_office_exclusive_regular_use = FALSE,
       home_annual_rent_or_mortgage_interest = 32400, home_annual_utilities_insurance = 4200,
       vehicle_total_miles = 12000, vehicle_business_miles = 4850, vehicle_actual_expenses = 3100,
       self_employed_health_insurance_premiums = 5400, sep_ira_solo_401k_contributions = 8000,
       estimated_tax_payments_made = 6500, updated_at = $2
     WHERE user_id = $1`,
    [userId, new Date().toISOString()]
  );
}
