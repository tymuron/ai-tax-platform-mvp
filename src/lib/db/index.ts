import { PGlite } from '@electric-sql/pglite';
import path from 'path';
import fs from 'fs';
import { SEEDED_TAX_RULE_VERSIONS } from '@/lib/tax-rules/seed-rules';
import { hashPassword } from '@/lib/security/crypto-and-masking';

const DDL_SCHEMA = `
-- 1. users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

-- 2. user_profiles
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL DEFAULT 2025,
  filing_status TEXT NOT NULL DEFAULT 'single',
  state_code TEXT NOT NULL DEFAULT 'CA',
  business_type TEXT NOT NULL DEFAULT 'Sole Proprietorship / Freelancer',
  industry_code TEXT NOT NULL DEFAULT '541511 - Custom Computer Programming & Consulting',
  has_w2_income BOOLEAN NOT NULL DEFAULT TRUE,
  has_1099_income BOOLEAN NOT NULL DEFAULT TRUE,
  has_schedule_c BOOLEAN NOT NULL DEFAULT TRUE,
  dependents_count INTEGER NOT NULL DEFAULT 0,
  qualifying_children_under_17 INTEGER NOT NULL DEFAULT 0,
  child_care_expenses_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  education_expenses_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  education_years_claimed INTEGER NOT NULL DEFAULT 0,
  is_student_at_least_half_time BOOLEAN NOT NULL DEFAULT FALSE,
  home_total_sqft NUMERIC(10,2) NOT NULL DEFAULT 1500,
  home_office_sqft NUMERIC(10,2) NOT NULL DEFAULT 0,
  home_office_exclusive_regular_use BOOLEAN NOT NULL DEFAULT FALSE,
  home_annual_rent_or_mortgage_interest NUMERIC(12,2) NOT NULL DEFAULT 0,
  home_annual_utilities_insurance NUMERIC(12,2) NOT NULL DEFAULT 0,
  vehicle_total_miles NUMERIC(10,2) NOT NULL DEFAULT 0,
  vehicle_business_miles NUMERIC(10,2) NOT NULL DEFAULT 0,
  vehicle_actual_expenses NUMERIC(12,2) NOT NULL DEFAULT 0,
  vehicle_placed_in_service_date TEXT,
  self_employed_health_insurance_premiums NUMERIC(12,2) NOT NULL DEFAULT 0,
  sep_ira_solo_401k_contributions NUMERIC(12,2) NOT NULL DEFAULT 0,
  estimated_tax_payments_made NUMERIC(12,2) NOT NULL DEFAULT 0,
  has_unsupported_complex_entity BOOLEAN NOT NULL DEFAULT FALSE,
  unsupported_entity_notes TEXT,
  updated_at TEXT NOT NULL
);

-- 3. subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free_trial',
  status TEXT NOT NULL DEFAULT 'active',
  price_cents INTEGER NOT NULL DEFAULT 0,
  stripe_subscription_id TEXT,
  stripe_webhook_verified BOOLEAN NOT NULL DEFAULT FALSE,
  current_period_end TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 4. documents
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL DEFAULT 2025,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  format TEXT NOT NULL,
  document_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processed',
  ocr_used BOOLEAN NOT NULL DEFAULT FALSE,
  extraction_confidence NUMERIC(5,2) NOT NULL DEFAULT 0.98,
  period_start TEXT,
  period_end TEXT,
  missing_pages_detected BOOLEAN NOT NULL DEFAULT FALSE,
  missing_periods_warning TEXT,
  extracted_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TEXT NOT NULL
);

-- 5. transactions
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL DEFAULT 2025,
  transaction_date TEXT,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  direction TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  raw_description TEXT NOT NULL,
  masked_description TEXT NOT NULL,
  source_page INTEGER DEFAULT 1,
  source_line_ref TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'ok',
  is_duplicate BOOLEAN NOT NULL DEFAULT FALSE,
  duplicate_of_transaction_id TEXT,
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  recurring_group_key TEXT,
  extraction_confidence NUMERIC(5,2) NOT NULL DEFAULT 0.98,
  created_at TEXT NOT NULL
);

-- 6. transaction_classifications
CREATE TABLE IF NOT EXISTS transaction_classifications (
  id TEXT PRIMARY KEY,
  transaction_id TEXT UNIQUE NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  initial_group TEXT NOT NULL,
  ai_group TEXT NOT NULL,
  user_confirmed_group TEXT,
  effective_group TEXT NOT NULL,
  sub_type TEXT NOT NULL,
  schedule_c_category TEXT NOT NULL DEFAULT 'none',
  evidence_classification TEXT NOT NULL,
  business_use_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  meal_deduction_limit_pct NUMERIC(5,2) NOT NULL DEFAULT 100,
  is_user_overridden BOOLEAN NOT NULL DEFAULT FALSE,
  confidence_score NUMERIC(5,2) NOT NULL DEFAULT 0.9,
  applied_rule_ref TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  missing_evidence_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  supporting_document_id TEXT,
  updated_at TEXT NOT NULL
);

-- 7. ai_questions
CREATE TABLE IF NOT EXISTS ai_questions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL DEFAULT 2025,
  related_transaction_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  question_key TEXT NOT NULL,
  category TEXT NOT NULL,
  question_text TEXT NOT NULL,
  context_summary TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, tax_year, question_key)
);

-- 8. ai_answers
CREATE TABLE IF NOT EXISTS ai_answers (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES ai_questions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  selected_option TEXT NOT NULL,
  custom_business_pct NUMERIC(5,2),
  custom_numeric_value NUMERIC(12,2),
  notes TEXT,
  answered_at TEXT NOT NULL
);

-- 9. tax_analyses
CREATE TABLE IF NOT EXISTS tax_analyses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL,
  rule_version_id TEXT NOT NULL,
  status TEXT NOT NULL,
  baseline_tax_liability NUMERIC(12,2) NOT NULL,
  confirmed_tax_liability NUMERIC(12,2) NOT NULL,
  potential_tax_liability NUMERIC(12,2) NOT NULL,
  confirmed_savings NUMERIC(12,2) NOT NULL,
  potential_additional_savings NUMERIC(12,2) NOT NULL,
  qa_passed BOOLEAN NOT NULL,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL
);

-- 10. tax_recommendations
CREATE TABLE IF NOT EXISTS tax_recommendations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  deduction_or_credit_type TEXT NOT NULL,
  gross_amount NUMERIC(12,2) NOT NULL,
  eligible_deduction_or_credit_amount NUMERIC(12,2) NOT NULL,
  estimated_real_tax_savings NUMERIC(12,2) NOT NULL,
  applied_rule_ref TEXT NOT NULL,
  irs_citation TEXT NOT NULL,
  calculation_explanation TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  confidence_score NUMERIC(5,2) NOT NULL,
  source_transaction_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_document_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_confirmations JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TEXT NOT NULL
);

-- 11. generated_reports
CREATE TABLE IF NOT EXISTS generated_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL,
  calculation_run_id TEXT NOT NULL,
  rule_version_id TEXT NOT NULL,
  qa_status TEXT NOT NULL,
  report_payload JSONB NOT NULL,
  created_at TEXT NOT NULL
);

-- 12. export_purchases
CREATE TABLE IF NOT EXISTS export_purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL,
  tier TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  stripe_payment_intent_id TEXT NOT NULL,
  stripe_webhook_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL
);

-- 13. ratings
CREATE TABLE IF NOT EXISTS ratings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  export_purchase_id TEXT,
  stars INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
  comment TEXT,
  created_at TEXT NOT NULL
);

-- 14. audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL
);

-- 15. tax_rule_versions
CREATE TABLE IF NOT EXISTS tax_rule_versions (
  version_id TEXT PRIMARY KEY,
  tax_year INTEGER NOT NULL,
  effective_date TEXT NOT NULL,
  last_verified_at TEXT NOT NULL,
  status TEXT NOT NULL,
  official_sources JSONB NOT NULL,
  rules_payload JSONB NOT NULL
);

-- 16. calculation_runs
CREATE TABLE IF NOT EXISTS calculation_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL,
  rule_version_id TEXT NOT NULL,
  status TEXT NOT NULL,
  additional_review_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  input_snapshot JSONB NOT NULL,
  scenarios JSONB NOT NULL,
  formula_trace JSONB NOT NULL,
  created_at TEXT NOT NULL
);
`;

declare global {
  // eslint-disable-next-line no-var
  var __aiTaxPgInstance: PGlite | undefined;
  // eslint-disable-next-line no-var
  var __aiTaxPgInitPromise: Promise<PGlite> | undefined;
}

export async function getDb(): Promise<PGlite> {
  if (global.__aiTaxPgInstance) {
    return global.__aiTaxPgInstance;
  }
  if (global.__aiTaxPgInitPromise) {
    return global.__aiTaxPgInitPromise;
  }

  global.__aiTaxPgInitPromise = (async () => {
    const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
    const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    let db: PGlite;
    if (isTest) {
      db = new PGlite();
    } else if (isServerless) {
      const dataDir = path.join('/tmp', 'ai-tax-pgdata');
      fs.mkdirSync(dataDir, { recursive: true });
      db = new PGlite(dataDir);
    } else {
      const dataDir = path.join(process.cwd(), '.data', 'pgdata');
      fs.mkdirSync(dataDir, { recursive: true });
      db = new PGlite(dataDir);
    }

    await db.exec(DDL_SCHEMA);

    // Seed tax_rule_versions
    for (const ruleVersion of SEEDED_TAX_RULE_VERSIONS) {
      await db.query(
        `INSERT INTO tax_rule_versions (version_id, tax_year, effective_date, last_verified_at, status, official_sources, rules_payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (version_id) DO UPDATE SET
           last_verified_at = EXCLUDED.last_verified_at,
           status = EXCLUDED.status,
           official_sources = EXCLUDED.official_sources,
           rules_payload = EXCLUDED.rules_payload`,
        [
          ruleVersion.version_id,
          ruleVersion.tax_year,
          ruleVersion.effective_date,
          ruleVersion.last_verified_at,
          ruleVersion.status,
          JSON.stringify(ruleVersion.official_sources),
          JSON.stringify(ruleVersion.rules_payload),
        ]
      );
    }

    // Seed default demo user & admin user
    const now = new Date().toISOString();
    const demoUserId = 'user_alex_morgan';
    const adminUserId = 'user_admin_staff';

    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, role, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [
        demoUserId,
        'alex.morgan@consulting.io',
        hashPassword('TaxOpt2026!'),
        'Alex Morgan (W-2 & 1099 Consultant)',
        'user',
        'active',
        now,
      ]
    );

    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, role, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [
        adminUserId,
        'admin@aitax.us',
        hashPassword('AdminTax2026!'),
        'Sarah Chen (Staff Tax & Compliance Admin)',
        'admin',
        'active',
        now,
      ]
    );

    await db.query(
      `INSERT INTO user_profiles (
        user_id, tax_year, filing_status, state_code, business_type, industry_code,
        has_w2_income, has_1099_income, has_schedule_c, dependents_count, qualifying_children_under_17,
        child_care_expenses_paid, education_expenses_paid, education_years_claimed, is_student_at_least_half_time,
        home_total_sqft, home_office_sqft, home_office_exclusive_regular_use,
        home_annual_rent_or_mortgage_interest, home_annual_utilities_insurance,
        vehicle_total_miles, vehicle_business_miles, vehicle_actual_expenses, vehicle_placed_in_service_date,
        self_employed_health_insurance_premiums, sep_ira_solo_401k_contributions, estimated_tax_payments_made,
        has_unsupported_complex_entity, unsupported_entity_notes, updated_at
      ) VALUES (
        $1, 2025, 'single', 'CA', 'Sole Proprietorship / AI & Product Consultant', '541511 - Custom Computer Programming',
        TRUE, TRUE, TRUE, 1, 1,
        3200, 0, 0, FALSE,
        1600, 220, TRUE,
        32400, 4200,
        12000, 4850, 3100, '2025-01-15',
        5400, 8000, 6500,
        FALSE, NULL, $2
      ) ON CONFLICT (user_id) DO NOTHING`,
      [demoUserId, now]
    );

    await db.query(
      `INSERT INTO subscriptions (
        id, user_id, plan, status, price_cents, stripe_subscription_id, stripe_webhook_verified, current_period_end, created_at
      ) VALUES ($1, $2, 'pro_monthly', 'active', 1000, 'sub_verified_seed_01', TRUE, '2026-12-31T23:59:59Z', $3)
      ON CONFLICT (id) DO NOTHING`,
      ['sub_alex_01', demoUserId, now]
    );

    global.__aiTaxPgInstance = db;
    return db;
  })();

  return global.__aiTaxPgInitPromise;
}

export async function writeAuditLog(params: {
  userId: string | null;
  actorRole: 'user' | 'admin' | 'system';
  action: string;
  entityType: string;
  entityId: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const db = await getDb();
  const id = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  // Ensure no raw PII or unmasked account numbers enter audit logs
  const safeMeta = params.metadata ? { ...params.metadata } : {};
  delete safeMeta.raw_description;
  delete safeMeta.account_number;
  delete safeMeta.ssn;

  await db.query(
    `INSERT INTO audit_logs (id, user_id, actor_role, action, entity_type, entity_id, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      params.userId,
      params.actorRole,
      params.action,
      params.entityType,
      params.entityId,
      JSON.stringify(safeMeta),
      new Date().toISOString(),
    ]
  );
}
