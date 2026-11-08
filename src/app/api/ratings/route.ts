import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/security/vault-and-auth';
import { getDb, writeAuditLog } from '@/lib/db';
import { getFullWorkspaceState } from '@/lib/services/workspace-service';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();
    const stars = Number(body.stars);
    const comment = body.comment ? String(body.comment).slice(0, 500) : null;
    const exportPurchaseId = body.exportPurchaseId || null;

    if (isNaN(stars) || stars < 1 || stars > 5) {
      return NextResponse.json(
        { ok: false, error: 'Stars rating must be between 1 and 5' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const ratingId = `rat_${Date.now()}`;
    await db.query(
      `INSERT INTO ratings (id, user_id, export_purchase_id, stars, comment, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [ratingId, user.id, exportPurchaseId, stars, comment, new Date().toISOString()]
    );

    await writeAuditLog({
      userId: user.id,
      actorRole: 'user',
      action: 'OPTIONAL_RATING_SUBMITTED',
      entityType: 'rating',
      entityId: ratingId,
      metadata: { stars },
    });

    const updatedState = await getFullWorkspaceState(user.id);
    return NextResponse.json({ ok: true, data: updatedState });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Rating submission failed' },
      { status: 400 }
    );
  }
}
