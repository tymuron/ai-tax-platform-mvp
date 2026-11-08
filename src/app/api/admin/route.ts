import { NextRequest, NextResponse } from 'next/server';
import { getDb, writeAuditLog } from '@/lib/db';
import { recomputeTaxWorkspaceForUser } from '@/lib/services/workspace-service';

export async function GET() {
  try {
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
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Admin query failed' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, targetId, userId = 'user_alex_morgan', taxYear = 2025 } = body;
    const db = await getDb();
    const now = new Date().toISOString();

    if (action === 'toggle_user_status') {
      const uRes = await db.query<{ status: string }>(
        `SELECT status FROM users WHERE id = $1`,
        [targetId]
      );
      const nextStatus = uRes.rows[0]?.status === 'blocked' ? 'active' : 'blocked';
      await db.query(`UPDATE users SET status = $2 WHERE id = $1`, [targetId, nextStatus]);
      await writeAuditLog({
        userId: 'user_admin_staff',
        actorRole: 'admin',
        action: `ADMIN_USER_STATUS_${nextStatus.toUpperCase()}`,
        entityType: 'user',
        entityId: targetId,
      });
    } else if (action === 'reprocess_document') {
      await recomputeTaxWorkspaceForUser(userId, taxYear);
      await writeAuditLog({
        userId: 'user_admin_staff',
        actorRole: 'admin',
        action: 'ADMIN_REPROCESSED_DOCUMENT_PIPELINE',
        entityType: 'document',
        entityId: targetId,
      });
    } else if (action === 'verify_tax_rule_version') {
      await db.query(
        `UPDATE tax_rule_versions SET last_verified_at = $2, status = 'active' WHERE version_id = $1`,
        [targetId, now]
      );
      await writeAuditLog({
        userId: 'user_admin_staff',
        actorRole: 'admin',
        action: 'ADMIN_APPROVED_TAX_RULE_VERSION',
        entityType: 'tax_rule_version',
        entityId: targetId,
      });
    } else if (action === 'refund_export_purchase') {
      await db.query(
        `UPDATE export_purchases SET status = 'refunded' WHERE id = $1`,
        [targetId]
      );
      await writeAuditLog({
        userId: 'user_admin_staff',
        actorRole: 'admin',
        action: 'ADMIN_REFUNDED_EXPORT_PURCHASE',
        entityType: 'export_purchase',
        entityId: targetId,
      });
    }

    const refreshed = await GET();
    return refreshed;
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Admin action failed' },
      { status: 400 }
    );
  }
}
