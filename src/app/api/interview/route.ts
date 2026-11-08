import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, getAuthenticatedUser } from '@/lib/security/vault-and-auth';
import { getDb, writeAuditLog } from '@/lib/db';
import {
  getFullWorkspaceState,
  recomputeTaxWorkspaceForUser,
} from '@/lib/services/workspace-service';
import { AIQuestionRecord, TaxYear } from '@/types/tax';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();
    const {
      questionId,
      selectedOption,
      customBusinessPct,
      notes,
      taxYear = 2025,
    } = body as {
      questionId: string;
      selectedOption: string;
      customBusinessPct?: number;
      notes?: string;
      taxYear?: TaxYear;
    };

    const db = await getDb();
    const qRes = await db.query<AIQuestionRecord>(
      `SELECT * FROM ai_questions WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [questionId, user.id]
    );

    if (qRes.rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Question not found or access denied' },
        { status: 404 }
      );
    }

    const question = qRes.rows[0];
    const now = new Date().toISOString();
    const isSkip = selectedOption === 'not_sure' || selectedOption === 'skip';

    await db.query(
      `UPDATE ai_questions SET status = $3 WHERE id = $1 AND user_id = $2`,
      [questionId, user.id, isSkip ? 'skipped' : 'answered']
    );

    const ansId = `ans_${Date.now()}`;
    await db.query(
      `INSERT INTO ai_answers (
        id, question_id, user_id, selected_option, custom_business_pct, custom_numeric_value, notes, answered_at
      ) VALUES ($1,$2,$3,$4,$5,NULL,$6,$7)`,
      [
        ansId,
        questionId,
        user.id,
        selectedOption,
        customBusinessPct ?? null,
        notes ?? null,
        now,
      ]
    );

    // Apply answer to related transactions or user profile
    const txIds: string[] = Array.isArray(question.related_transaction_ids)
      ? question.related_transaction_ids
      : [];

    if (!isSkip && txIds.length > 0) {
      let pct = customBusinessPct ?? 100;
      if (selectedOption === '100_business') pct = 100;
      else if (selectedOption === 'partially_business') pct = customBusinessPct ?? 60;
      else if (selectedOption === 'personal_use') pct = 0;

      for (const txId of txIds) {
        if (pct === 0) {
          await db.query(
            `UPDATE transaction_classifications SET
              user_confirmed_group = 'Personal expenses',
              effective_group = 'Personal expenses',
              evidence_classification = 'non_deductible',
              business_use_pct = 0,
              is_user_overridden = TRUE,
              confidence_score = 1.0,
              missing_evidence_items = '[]'::jsonb,
              updated_at = $3
            WHERE transaction_id = $1 AND user_id = $2`,
            [txId, user.id, now]
          );
        } else {
          await db.query(
            `UPDATE transaction_classifications SET
              user_confirmed_group = 'Business expenses',
              effective_group = 'Business expenses',
              evidence_classification = $3,
              business_use_pct = $4,
              is_user_overridden = TRUE,
              confidence_score = 1.0,
              missing_evidence_items = '[]'::jsonb,
              updated_at = $5
            WHERE transaction_id = $1 AND user_id = $2`,
            [
              txId,
              user.id,
              pct === 100 ? 'verified_by_document' : 'partially_deductible',
              pct,
              now,
            ]
          );
        }
      }
    }

    if (!isSkip && question.category === 'home_office') {
      const eligible = selectedOption === '100_business';
      await db.query(
        `UPDATE user_profiles SET home_office_exclusive_regular_use = $2, updated_at = $3 WHERE user_id = $1`,
        [user.id, eligible, now]
      );
    }

    if (!isSkip && question.category === 'vehicle_mileage') {
      // Only a confirmed contemporaneous log (IRC §274(d)) moves mileage into the confirmed scenario.
      await db.query(
        `UPDATE user_profiles SET vehicle_mileage_log_confirmed = $2, updated_at = $3 WHERE user_id = $1`,
        [user.id, selectedOption === '100_business', now]
      );
    }

    await writeAuditLog({
      userId: user.id,
      actorRole: 'user',
      action: 'AI_INTERVIEW_QUESTION_ANSWERED',
      entityType: 'ai_question',
      entityId: questionId,
      metadata: { selectedOption, customBusinessPct, affectedTransactions: txIds.length },
    });

    const activeYear: TaxYear = taxYear === 2026 ? 2026 : 2025;
    await recomputeTaxWorkspaceForUser(user.id, activeYear);
    const updatedState = await getFullWorkspaceState(user.id, activeYear);

    return NextResponse.json({ ok: true, data: updatedState });
  } catch (err) {
    return errorResponse(err, 400);
  }
}
