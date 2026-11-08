import {
  AIQuestionRecord,
  TaxYear,
  TransactionClassificationRecord,
  TransactionRecord,
  UserProfileRecord,
} from '@/types/tax';

const STANDARD_BUSINESS_USE_OPTIONS = [
  { value: '100_business', label: '100% business use', business_use_pct: 100 },
  { value: 'partially_business', label: 'Partially business use (60%)', business_use_pct: 60 },
  { value: 'personal_use', label: 'Personal use (0% deductible)', business_use_pct: 0 },
  { value: 'not_sure', label: 'Not sure (Keep as unconfirmed)' },
];

export function generateContextualInterviewQuestions(params: {
  userId: string;
  taxYear: TaxYear;
  profile: UserProfileRecord;
  transactions: TransactionRecord[];
  classifications: TransactionClassificationRecord[];
  existingQuestions: AIQuestionRecord[];
}): AIQuestionRecord[] {
  const { userId, taxYear, profile, transactions, classifications, existingQuestions } = params;
  const now = new Date().toISOString();

  const existingByKey = new Map<string, AIQuestionRecord>();
  for (const q of existingQuestions) {
    existingByKey.set(q.question_key, q);
  }

  const clsByTxId = new Map<string, TransactionClassificationRecord>();
  for (const c of classifications) {
    clsByTxId.set(c.transaction_id, c);
  }

  const generated: AIQuestionRecord[] = [];

  // 1. Group recurring software/subscription & telecom expenses by merchant
  const merchantGroups = new Map<
    string,
    { merchantLabel: string; txIds: string[]; totalAmount: number; clsList: TransactionClassificationRecord[] }
  >();

  for (const tx of transactions) {
    if (tx.is_duplicate || tx.direction !== 'outflow') continue;
    const cls = clsByTxId.get(tx.id);
    if (!cls || cls.is_user_overridden) continue;

    if (
      cls.evidence_classification === 'potentially_deductible_confirmation_required' ||
      cls.evidence_classification === 'additional_info_required' ||
      cls.evidence_classification === 'partially_deductible'
    ) {
      const normKey = tx.merchant_name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const existingGroup = merchantGroups.get(normKey);
      if (existingGroup) {
        existingGroup.txIds.push(tx.id);
        existingGroup.totalAmount = Math.round((existingGroup.totalAmount + tx.amount) * 100) / 100;
        existingGroup.clsList.push(cls);
      } else {
        merchantGroups.set(normKey, {
          merchantLabel: tx.merchant_name,
          txIds: [tx.id],
          totalAmount: tx.amount,
          clsList: [cls],
        });
      }
    }
  }

  for (const [normKey, group] of merchantGroups.entries()) {
    const questionKey = `q_merchant_${taxYear}_${normKey}`;
    if (existingByKey.has(questionKey)) {
      generated.push(existingByKey.get(questionKey)!);
      continue;
    }

    const firstCls = group.clsList[0];
    const isAmbiguous = firstCls.evidence_classification === 'additional_info_required';
    const isRecurringSub = group.txIds.length >= 2 || firstCls.schedule_c_category === 'software_and_subscriptions';

    const formattedTotal = `$${group.totalAmount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

    let questionText = '';
    let contextSummary = '';
    let category: AIQuestionRecord['category'] = 'merchant_business_purpose';

    if (isAmbiguous) {
      category = 'merchant_business_purpose';
      questionText = `We found ${group.txIds.length} purchase(s) at ${group.merchantLabel} totaling ${formattedTotal} in ${taxYear}. Retailers like ${group.merchantLabel} cannot be deducted by store name alone—were these items purchased for your business and do you have an itemized invoice?`;
      contextSummary = `IRC §162(a) requires verifying specific items purchased at general retailers.`;
    } else if (isRecurringSub) {
      category = 'recurring_subscription';
      questionText = `We detected ${group.txIds.length} payment(s) to ${group.merchantLabel} totaling ${formattedTotal} for the ${taxYear} tax year. Was this subscription or service used for your business activity?`;
      contextSummary = `Schedule C (${firstCls.schedule_c_category.replace(/_/g, ' ')}) — ${group.txIds.length} transaction(s).`;
    } else {
      category = 'mixed_use_split';
      questionText = `We identified ${formattedTotal} spent at ${group.merchantLabel} (${firstCls.schedule_c_category.replace(/_/g, ' ')}). What portion of this expenditure was directly for business use?`;
      contextSummary = firstCls.reasoning;
    }

    generated.push({
      id: `aiq_${Date.now()}_${normKey.slice(0, 12)}`,
      user_id: userId,
      tax_year: taxYear,
      related_transaction_ids: group.txIds,
      question_key: questionKey,
      category,
      question_text: questionText,
      context_summary: contextSummary,
      options: STANDARD_BUSINESS_USE_OPTIONS,
      status: 'pending',
      priority: isAmbiguous ? 1 : 2,
      created_at: now,
    });
  }

  // 2. Profile-level Home Office eligibility question if user has Schedule C
  const homeOfficeKey = `q_profile_${taxYear}_home_office`;
  if (existingByKey.has(homeOfficeKey)) {
    generated.push(existingByKey.get(homeOfficeKey)!);
  } else if (profile.has_schedule_c) {
    generated.push({
      id: `aiq_${taxYear}_home_office`,
      user_id: userId,
      tax_year: taxYear,
      related_transaction_ids: [],
      question_key: homeOfficeKey,
      category: 'home_office',
      question_text: `Did you use a dedicated area of your home (${profile.home_office_sqft || 200} sq ft of ${profile.home_total_sqft || 1600} sq ft) exclusively and regularly as your principal place of business in ${taxYear}?`,
      context_summary: `IRC §280A — Compares Simplified Method ($5/sq ft up to 300 sq ft) vs. Regular Actual Expense Method (Form 8829).`,
      options: [
        { value: '100_business', label: 'Yes — exclusive and regular business use', business_use_pct: 100 },
        { value: 'personal_use', label: 'No — shared/personal living space (Not eligible)', business_use_pct: 0 },
        { value: 'not_sure', label: 'Not sure / Skip for now' },
      ],
      status: profile.home_office_exclusive_regular_use ? 'answered' : 'pending',
      priority: 3,
      created_at: now,
    });
  }

  // 3. Vehicle Mileage & contemporaneous log verification
  const mileageKey = `q_profile_${taxYear}_vehicle_mileage`;
  if (existingByKey.has(mileageKey)) {
    generated.push(existingByKey.get(mileageKey)!);
  } else if (profile.has_schedule_c && profile.vehicle_business_miles > 0) {
    generated.push({
      id: `aiq_${taxYear}_vehicle_mileage`,
      user_id: userId,
      tax_year: taxYear,
      related_transaction_ids: [],
      question_key: mileageKey,
      category: 'vehicle_mileage',
      question_text: `You have ${profile.vehicle_business_miles.toLocaleString()} business miles recorded out of ${profile.vehicle_total_miles.toLocaleString()} total miles in ${taxYear}. Do you maintain a written or app-based mileage log under IRC §274(d)?`,
      context_summary: `Standard Mileage Rate (${taxYear === 2025 ? '70¢' : '71¢'}/mile) vs. Actual Vehicle Expense comparison.`,
      options: [
        { value: '100_business', label: 'Yes — contemporaneous mileage log maintained', business_use_pct: 100 },
        { value: 'personal_use', label: 'No log maintained — exclude mileage deduction', business_use_pct: 0 },
        { value: 'not_sure', label: 'Not sure' },
      ],
      status: 'pending',
      priority: 3,
      created_at: now,
    });
  }

  return generated.sort((a, b) => a.priority - b.priority);
}
