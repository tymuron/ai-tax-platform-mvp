import { NextRequest, NextResponse } from 'next/server';
import { getDb, writeAuditLog } from '@/lib/db';
import { recomputeTaxWorkspaceForUser } from '@/lib/services/workspace-service';
import { errorResponse, requireAdmin } from '@/lib/security/vault-and-auth';
import { refundExportPurchase } from '@/lib/services/stripe-billing';
import { SEEDED_TAX_RULE_VERSIONS } from '@/lib/tax-rules/seed-rules';
import { TaxYear } from '@/types/tax';

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    return await adminSnapshot(admin.id);
  } catch (err) {
    return errorResponse(err, 500);
  }
}

async function adminSnapshot(adminId: string) {
  {
    const db = await getDb();

    const usersRes = await db.query(
      `SELECT u.id, u.email, u.full_name, u.role, u.status, u.created_at,
              s.plan, s.status as subscription_status, s.price_cents, s.stripe_webhook_verified
       FROM users u
       LEFT JOIN subscriptions s ON s.user_id = u.id
       ORDER BY u.created_at DESC`
    );

    const docsRes = await db.query(
      `SELECT id, user_id, tax_year, filename, format, document_type, file_size_bytes,
              status, ocr_used, extraction_confidence, period_start, period_end,
              missing_pages_detected, missing_periods_warning, error_message, created_at
       FROM documents
       ORDER BY created_at DESC`
    );

    const subsRes = await db.query(`SELECT * FROM subscriptions ORDER BY created_at DESC`);
    const exportsRes = await db.query(`SELECT * FROM export_purchases ORDER BY created_at DESC`);
    const rulesRes = await db.query(`SELECT * FROM tax_rule_versions ORDER BY tax_year DESC`);
    const auditRes = await db.query(
      `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 40`
    );
    const reportsRes = await db.query(
      `SELECT id, user_id, tax_year, rule_version_id, qa_status, report_payload, created_at
       FROM generated_reports ORDER BY created_at DESC LIMIT 5`
    );

    const subRows = subsRes.rows as Array<Record<string, unknown>>;
    const expRows = exportsRes.rows as Array<Record<string, unknown>>;

    const subRevenueCents = subRows
      .filter((s) => s.status === 'active')
      .reduce((acc, s) => acc + Number(s.price_cents || 0), 0);
    const exportRevenueCents = expRows
      .filter((e) => e.status === 'paid')
      .reduce((acc, e) => acc + Number(e.amount_cents || 0), 0);

    return NextResponse.json({
      ok: true,
      data: {
        users: usersRes.rows,
        documents: docsRes.rows,
        subscriptions: subsRes.rows,
        exportPurchases: exportsRes.rows,
        revenueSummary: {
          subscriptionMrrUsd: subRevenueCents / 100,
          exportPackagesRevenueUsd: exportRevenueCents / 100,
          totalRevenueUsd: (subRevenueCents + exportRevenueCents) / 100,
        },
        taxRules: rulesRes.rows,
        auditLogs: auditRes.rows,
        latestQaSummary:
          (reportsRes.rows[0] as { report_payload?: { qa_summary?: unknown } })?.report_payload
            ?.qa_summary || null,
      },
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const body = await req.json();
    const { action, targetId } = body as { action: string; targetId: string };
    const db = await getDb();
    const now = new Date().toISOString();

    if (action === 'toggle_user_status') {
      if (targetId === admin.id) throw new Error('You cannot block your own account');
      const uRes = await db.query<{ status: string }>(
        `SELECT status FROM users WHERE id = $1`,
        [targetId]
      );
      const nextStatus = uRes.rows[0]?.status === 'blocked' ? 'active' : 'blocked';
      await db.query(`UPDATE users SET status = $2 WHERE id = $1`, [targetId, nextStatus]);
      await writeAuditLog({
        userId: admin.id,
        actorRole: 'admin',
        action: `ADMIN_USER_STATUS_${nextStatus.toUpperCase()}`,
        entityType: 'user',
        entityId: targetId,
      });
    } else if (action === 'reprocess_document') {
      const docRes = await db.query<{ user_id: string; tax_year: number }>(
        `SELECT user_id, tax_year FROM documents WHERE id = $1`,
        [targetId]
      );
      const doc = docRes.rows[0];
      if (!doc) throw new Error('Document not found');
      await recomputeTaxWorkspaceForUser(doc.user_id, (doc.tax_year === 2026 ? 2026 : 2025) as TaxYear);
      await writeAuditLog({
        userId: admin.id,
        actorRole: 'admin',
        action: 'ADMIN_REPROCESSED_DOCUMENT_PIPELINE',
        entityType: 'document',
        entityId: targetId,
      });
    } else if (action === 'verify_tax_rule_version') {
      if (!SEEDED_TAX_RULE_VERSIONS.some((v) => v.version_id === targetId)) {
        throw new Error('Only the current rule versions shipped with the engine can be re-verified');
      }
      await db.query(
        `UPDATE tax_rule_versions SET last_verified_at = $2, status = 'active' WHERE version_id = $1`,
        [targetId, now]
      );
      await writeAuditLog({
        userId: admin.id,
        actorRole: 'admin',
        action: 'ADMIN_APPROVED_TAX_RULE_VERSION',
        entityType: 'tax_rule_version',
        entityId: targetId,
      });
    } else if (action === 'refund_export_purchase') {
      // Real refund in Stripe; the status flips to "refunded" when Stripe's charge.refunded webhook arrives.
      const p = await db.query<{ stripe_payment_intent_id: string; status: string }>(
        `SELECT stripe_payment_intent_id, status FROM export_purchases WHERE id = $1`,
        [targetId]
      );
      if (!p.rows[0] || p.rows[0].status !== 'paid') throw new Error('Purchase not found or not paid');
      await refundExportPurchase(p.rows[0].stripe_payment_intent_id);
      await writeAuditLog({
        userId: admin.id,
        actorRole: 'admin',
        action: 'ADMIN_REFUNDED_EXPORT_PURCHASE',
        entityType: 'export_purchase',
        entityId: targetId,
      });
    }

    return await adminSnapshot(admin.id);
  } catch (err) {
    return errorResponse(err);
  }
}
