import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, getAuthenticatedUser } from '@/lib/security/vault-and-auth';
import {
  cancelSubscriptionAtPeriodEnd,
  constructVerifiedEvent,
  createCheckoutSession,
  handleVerifiedStripeEvent,
  isStripeConfigured,
  PaymentsNotConfiguredError,
} from '@/lib/services/stripe-billing';
import { getDb } from '@/lib/db';
import { ExportPurchaseRecord } from '@/types/tax';

export const runtime = 'nodejs';

/**
 * POST with a Stripe-Signature header  -> Stripe webhook (the only place entitlements are granted)
 * POST from a signed-in user            -> starts Stripe Checkout and returns its URL
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (signature) {
    if (!isStripeConfigured()) {
      return NextResponse.json({ ok: false, error: 'Webhook received but Stripe is not configured' }, { status: 503 });
    }
    let event;
    try {
      event = constructVerifiedEvent(rawBody, signature);
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid Stripe signature' }, { status: 400 });
    }
    try {
      const applied = await handleVerifiedStripeEvent(event);
      return NextResponse.json({ ok: true, received: true, duplicate: !applied });
    } catch (err) {
      return errorResponse(err, 500); // non-2xx makes Stripe retry
    }
  }

  try {
    const user = await getAuthenticatedUser(req);
    const body = JSON.parse(rawBody || '{}') as {
      action?: 'subscribe_pro' | 'purchase_export_package' | 'cancel_subscription';
      exportTier?: ExportPurchaseRecord['tier'];
      taxYear?: number;
    };
    const taxYear = body.taxYear === 2026 ? 2026 : 2025;
    if (!isStripeConfigured()) throw new PaymentsNotConfiguredError();

    if (body.action === 'cancel_subscription') {
      const db = await getDb();
      const sub = await db.query<{ stripe_subscription_id: string | null }>(
        `SELECT stripe_subscription_id FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [user.id]
      );
      const id = sub.rows[0]?.stripe_subscription_id;
      if (!id) throw new Error('No active subscription to cancel');
      await cancelSubscriptionAtPeriodEnd(id);
      return NextResponse.json({ ok: true, message: 'Subscription will end at the close of the current period.' });
    }

    const origin = req.headers.get('origin') || req.nextUrl.origin;
    const checkoutUrl = await createCheckoutSession({
      user,
      kind: body.action === 'purchase_export_package' ? 'export' : 'subscription',
      tier: body.exportTier,
      taxYear,
      origin,
    });
    return NextResponse.json({ ok: true, checkoutUrl });
  } catch (err) {
    if (err instanceof PaymentsNotConfiguredError) return errorResponse(err, 503);
    return errorResponse(err);
  }
}
