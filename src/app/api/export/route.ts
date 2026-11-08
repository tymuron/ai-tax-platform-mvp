import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/security/vault-and-auth';
import {
  createSignedDownloadToken,
  verifySignedDownloadToken,
} from '@/lib/security/crypto-and-masking';
import { getFullWorkspaceState } from '@/lib/services/workspace-service';
import { generateExportPackageBuffer } from '@/lib/services/payment-and-export-service';
import { writeAuditLog } from '@/lib/db';
import { TaxYear } from '@/types/tax';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();
    const format: 'PDF' | 'CSV' | 'XLSX' =
      body.format === 'CSV' || body.format === 'XLSX' ? body.format : 'PDF';
    const taxYear: TaxYear = body.taxYear === 2026 ? 2026 : 2025;

    const state = await getFullWorkspaceState(user.id, taxYear);
    const hasPaidVerifiedExport = state.exportPurchases.some(
      (p) => p.status === 'paid' && p.stripe_webhook_verified
    );

    if (!hasPaidVerifiedExport) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'EXPORT_ENTITLEMENT_REQUIRED: Document Export Package ($50 / $100 / $200) must be purchased and verified via server Stripe webhook before downloading.',
        },
        { status: 402 }
      );
    }

    const signed = createSignedDownloadToken({
      userId: user.id,
      resourceType: 'export_package',
      resourceId: state.report.id,
      format,
      expiresInSeconds: 900,
    });

    await writeAuditLog({
      userId: user.id,
      actorRole: 'user',
      action: 'SIGNED_EXPORT_DOWNLOAD_LINK_ISSUED',
      entityType: 'generated_report',
      entityId: state.report.id,
      metadata: { format, expiresAt: signed.expiresAt },
    });

    return NextResponse.json({
      ok: true,
      downloadUrl: `/api/export?token=${encodeURIComponent(signed.token)}&taxYear=${taxYear}`,
      expiresAt: signed.expiresAt,
      format,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Export token issue failed' },
      { status: 400 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const token = req.nextUrl.searchParams.get('token') || '';
    const yearStr = req.nextUrl.searchParams.get('taxYear') || '2025';
    const taxYear: TaxYear = yearStr === '2026' ? 2026 : 2025;

    const check = verifySignedDownloadToken(token, user.id);
    if (!check.valid || !check.payload) {
      return NextResponse.json(
        { ok: false, error: `Invalid or expired signed link: ${check.reason}` },
        { status: 403 }
      );
    }

    const state = await getFullWorkspaceState(user.id, taxYear);
    if (!state.report || !state.calculationRun) {
      return NextResponse.json({ ok: false, error: 'Report not ready' }, { status: 404 });
    }

    const pkg = generateExportPackageBuffer({
      format: (check.payload.format as 'PDF' | 'CSV' | 'XLSX') || 'PDF',
      profile: state.profile,
      report: state.report,
      calculationRun: state.calculationRun,
      transactions: state.transactions,
      classifications: state.classifications,
    });

    return new NextResponse(new Uint8Array(pkg.buffer), {
      status: 200,
      headers: {
        'Content-Type': pkg.mimeType,
        'Content-Disposition': `attachment; filename="${pkg.filename}"`,
        'Cache-Control': 'no-store, private',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Download failed' },
      { status: 400 }
    );
  }
}
