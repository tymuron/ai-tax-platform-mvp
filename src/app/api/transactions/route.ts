import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/security/vault-and-auth';
import { getDb, writeAuditLog } from '@/lib/db';
import {
  getFullWorkspaceState,
  recomputeTaxWorkspaceForUser,
} from '@/lib/services/workspace-service';
import {
  EvidenceClassification,
  ScheduleCCategory,
  TaxYear,
  TransactionGroup,
} from '@/types/tax';

export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();
    const {
      transactionId,
      effectiveGroup,
      scheduleCCategory,
      evidenceClassification,
      businessUsePct,
      confirmedDate,
      confirmedAmount,
      taxYear = 2025,
    } = body as {
      transactionId: string;
      effectiveGroup?: TransactionGroup;
      scheduleCCategory?: ScheduleCCategory;
      evidenceClassification?: EvidenceClassification;
      businessUsePct?: number;
      confirmedDate?: string;
      confirmedAmount?: number;
      taxYear?: TaxYear;
    };

    if (!transactionId) {
      return NextResponse.json({ ok: false, error: 'Missing transactionId' }, { status: 400 });
    }

    const db = await getDb();
    // Strictly enforce user_id ownership
    const txRes = await db.query(
      `SELECT id, user_id, tax_year FROM transactions WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [transactionId, user.id]
    );
    if (txRes.rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Transaction not found or cross-tenant access denied' },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();

    if (confirmedDate || confirmedAmount !== undefined) {
      await db.query(
        `UPDATE transactions SET
          transaction_date = COALESCE($3, transaction_date),
          amount = COALESCE($4, amount),
          review_status = 'ok',
          extraction_confidence = 1.0
        WHERE id = $1 AND user_id = $2`,
        [transactionId, user.id, confirmedDate ?? null, confirmedAmount ?? null]
      );
    }

    await db.query(
      `UPDATE transaction_classifications SET
        user_confirmed_group = COALESCE($3, user_confirmed_group),
        effective_group = COALESCE($3, effective_group),
        schedule_c_category = COALESCE($4, schedule_c_category),
        evidence_classification = COALESCE($5, evidence_classification),
        business_use_pct = COALESCE($6, business_use_pct),
        is_user_overridden = TRUE,
        confidence_score = 1.0,
        missing_evidence_items = '[]'::jsonb,
        updated_at = $7
      WHERE transaction_id = $1 AND user_id = $2`,
      [
        transactionId,
        user.id,
        effectiveGroup ?? null,
        scheduleCCategory ?? null,
        evidenceClassification ?? 'verified_by_document',
        businessUsePct ?? null,
        now,
      ]
    );

    await writeAuditLog({
      userId: user.id,
      actorRole: 'user',
      action: 'TRANSACTION_CLASSIFICATION_OVERRIDDEN',
      entityType: 'transaction',
      entityId: transactionId,
      metadata: {
        effectiveGroup,
        scheduleCCategory,
        evidenceClassification,
        businessUsePct,
      },
    });

    const activeYear: TaxYear = taxYear === 2026 ? 2026 : 2025;
    await recomputeTaxWorkspaceForUser(user.id, activeYear);
    const updatedState = await getFullWorkspaceState(user.id, activeYear);

    return NextResponse.json({ ok: true, data: updatedState });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Update failed' },
      { status: 400 }
    );
  }
}
