import Stripe from 'stripe';
import { getDb, writeAuditLog } from '@/lib/db';
import { ExportPurchaseRecord, UserRecord } from '@/types/tax';

/**
 * Payments go through Stripe Checkout. Entitlements are granted ONLY from a webhook whose
 * signature Stripe's SDK verified with STRIPE_WEBHOOK_SECRET — never from the browser.
 */

export const EXPORT_TIERS: Record<ExportPurchaseRecord['tier'], { cents: number; label: string }> = {
  essential_50: { cents: 5000, label: 'Essential export package' },
  professional_100: { cents: 10000, label: 'Professional export package' },
  complete_audit_200: { cents: 20000, label: 'Complete export package' },
};
export const PRO_MONTHLY_CENTS = 1000;

export class PaymentsNotConfiguredError extends Error {
  constructor() {
    super(
      'PAYMENTS_NOT_CONFIGURED: Stripe is not set up on this server (STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET). No payment can be taken and nothing was unlocked.'
    );
  }
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

let client: Stripe | null = null;
function stripe(): Stripe {
  if (!isStripeConfigured()) throw new PaymentsNotConfiguredError();
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY as string);
  return client;
}

export async function createCheckoutSession(params: {
  user: UserRecord;
  kind: 'subscription' | 'export';
  tier?: ExportPurchaseRecord['tier'];
  taxYear: number;
  origin: string;
}): Promise<string> {
  const { user, kind, taxYear, origin } = params;
  const metadata: Record<string, string> = { user_id: user.id, kind, tax_year: String(taxYear) };

  let session: Stripe.Checkout.Session;
  if (kind === 'subscription') {
    session = await stripe().checkout.sessions.create({
      mode: 'subscription',
      client_reference_id: user.id,
      customer_email: user.email,
      line_items: [
        process.env.STRIPE_PRICE_PRO_MONTHLY
          ? { price: process.env.STRIPE_PRICE_PRO_MONTHLY, quantity: 1 }
          : {
              quantity: 1,
              price_data: {
                currency: 'usd',
                unit_amount: PRO_MONTHLY_CENTS,
                recurring: { interval: 'month' },
                product_data: { name: 'AI Tax — full workspace (monthly)' },
              },
            },
      ],
      metadata,
      subscription_data: { metadata },
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancelled`,
    });
  } else {
    const tier = params.tier && EXPORT_TIERS[params.tier] ? params.tier : 'professional_100';
    metadata.tier = tier;
    session = await stripe().checkout.sessions.create({
      mode: 'payment',
      client_reference_id: user.id,
      customer_email: user.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: EXPORT_TIERS[tier].cents,
            product_data: {
              name: `AI Tax — ${EXPORT_TIERS[tier].label} (${taxYear})`,
              description: 'Fee for the document export package (PDF/CSV/XLSX). Not a tip or donation.',
            },
          },
        },
      ],
      metadata,
      payment_intent_data: { metadata },
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancelled`,
    });
  }
  if (!session.url) throw new Error('Stripe did not return a checkout URL');
  return session.url;
}

/** Verifies the Stripe-Signature header with the SDK. Throws on any mismatch. */
export function constructVerifiedEvent(rawBody: string, signature: string): Stripe.Event {
  return stripe().webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET as string);
}

function mapSubscriptionStatus(s: Stripe.Subscription.Status): 'active' | 'past_due' | 'canceled' {
  if (s === 'active' || s === 'trialing') return 'active';
  if (s === 'past_due' || s === 'unpaid' || s === 'incomplete') return 'past_due';
  return 'canceled';
}

function periodEnd(sub: Stripe.Subscription): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anySub = sub as any;
  const ts: number | undefined = anySub.items?.data?.[0]?.current_period_end ?? anySub.current_period_end;
  return ts ? new Date(ts * 1000).toISOString() : new Date().toISOString();
}

async function upsertSubscriptionFromStripe(userId: string, sub: Stripe.Subscription): Promise<void> {
  const db = await getDb();
  const status = mapSubscriptionStatus(sub.status);
  const existing = await db.query<{ id: string }>(
    `SELECT id FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  const now = new Date().toISOString();
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null;
  if (existing.rows[0]) {
    await db.query(
      `UPDATE subscriptions SET plan = 'pro_monthly', status = $2, price_cents = $3, stripe_subscription_id = $4,
         stripe_customer_id = $5, stripe_webhook_verified = TRUE, current_period_end = $6 WHERE id = $1`,
      [existing.rows[0].id, status, PRO_MONTHLY_CENTS, sub.id, customerId, periodEnd(sub)]
    );
  } else {
    await db.query(
      `INSERT INTO subscriptions (id, user_id, plan, status, price_cents, stripe_subscription_id, stripe_customer_id,
         stripe_webhook_verified, current_period_end, created_at)
       VALUES ($1,$2,'pro_monthly',$3,$4,$5,$6,TRUE,$7,$8)`,
      [`sub_${Date.now()}`, userId, status, PRO_MONTHLY_CENTS, sub.id, customerId, periodEnd(sub), now]
    );
  }
  await writeAuditLog({
    userId,
    actorRole: 'system',
    action: 'STRIPE_SUBSCRIPTION_SYNCED',
    entityType: 'subscription',
    entityId: sub.id,
    metadata: { status },
  });
}

/** Applies a verified event. Returns false if the event was already processed (idempotent). */
export async function handleVerifiedStripeEvent(event: Stripe.Event): Promise<boolean> {
  const db = await getDb();
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO stripe_events (id, type, created_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING RETURNING id`,
    [event.id, event.type, new Date().toISOString()]
  );
  if (!inserted.rows[0]) return false;

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.user_id || session.client_reference_id;
    if (!userId) return true;
    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') return true;

    if (session.mode === 'subscription' && session.subscription) {
      const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
      const sub = await stripe().subscriptions.retrieve(subId);
      await upsertSubscriptionFromStripe(userId, sub);
    } else if (session.mode === 'payment') {
      const tier = (session.metadata?.tier || 'professional_100') as ExportPurchaseRecord['tier'];
      const paymentIntent =
        typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || session.id;
      await db.query(
        `INSERT INTO export_purchases (id, user_id, tax_year, tier, amount_cents, status, stripe_payment_intent_id,
           stripe_checkout_session_id, stripe_webhook_verified, created_at)
         VALUES ($1,$2,$3,$4,$5,'paid',$6,$7,TRUE,$8)`,
        [
          `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          userId,
          Number(session.metadata?.tax_year) || 2025,
          tier,
          session.amount_total ?? EXPORT_TIERS[tier]?.cents ?? 0,
          paymentIntent,
          session.id,
          new Date().toISOString(),
        ]
      );
      await writeAuditLog({
        userId,
        actorRole: 'system',
        action: 'STRIPE_EXPORT_PURCHASE_PAID',
        entityType: 'export_purchase',
        entityId: session.id,
        metadata: { tier, amount_cents: session.amount_total },
      });
    }
  } else if (
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const userId = sub.metadata?.user_id;
    if (userId) await upsertSubscriptionFromStripe(userId, sub);
  } else if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
    if (pi && charge.refunded) {
      await db.query(`UPDATE export_purchases SET status = 'refunded' WHERE stripe_payment_intent_id = $1`, [pi]);
    }
  }
  return true;
}

export async function cancelSubscriptionAtPeriodEnd(stripeSubscriptionId: string): Promise<void> {
  await stripe().subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: true });
}

/** Admin refund: refunds the money in Stripe; the DB status changes when charge.refunded arrives. */
export async function refundExportPurchase(paymentIntentId: string): Promise<void> {
  await stripe().refunds.create({ payment_intent: paymentIntentId });
}
