import { describe, it, expect, beforeAll } from 'vitest';
import Stripe from 'stripe';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import {
  createSessionToken,
  getAuthenticatedUser,
  readSessionToken,
  requireAdmin,
  SESSION_COOKIE,
} from '@/lib/security/vault-and-auth';
import {
  createSignedDownloadToken,
  hashPassword,
  maskSensitivePII,
  verifyPassword,
  verifySignedDownloadToken,
} from '@/lib/security/crypto-and-masking';
import { authenticate, createDemoAccount, registerUser } from '@/lib/services/auth-service';
import { constructVerifiedEvent, handleVerifiedStripeEvent } from '@/lib/services/stripe-billing';
import { getFullWorkspaceState, ingestDocumentForUser } from '@/lib/services/workspace-service';

const WEBHOOK_SECRET = 'whsec_test_' + 'x'.repeat(32);

function req(headers: Record<string, string> = {}, cookie?: string): NextRequest {
  const h = new Headers(headers);
  if (cookie) h.set('cookie', `${SESSION_COOKIE}=${cookie}`);
  return new NextRequest('http://localhost/api/workspace', { headers: h });
}

let userA = '';
let userB = '';

beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  await getDb();
  userA = await registerUser({ email: 'a@example.com', password: 'correct horse battery', fullName: 'A' });
  userB = await registerUser({ email: 'b@example.com', password: 'another long password', fullName: 'B' });
});

describe('Authentication', () => {
  it('no seeded demo or admin accounts exist', async () => {
    const db = await getDb();
    const r = await db.query<{ id: string }>(`SELECT id FROM users WHERE id IN ('user_alex_morgan','user_admin_staff')`);
    expect(r.rows).toHaveLength(0);
  });
  it('passwords are salted per user and verified', () => {
    const h1 = hashPassword('same password here');
    const h2 = hashPassword('same password here');
    expect(h1).not.toBe(h2);
    expect(verifyPassword('same password here', h1)).toBe(true);
    expect(verifyPassword('wrong', h1)).toBe(false);
  });
  it('login checks the password', async () => {
    await expect(authenticate({ email: 'a@example.com', password: 'nope' })).rejects.toThrow(/incorrect/);
    expect(await authenticate({ email: 'a@example.com', password: 'correct horse battery' })).toBe(userA);
  });
  it('an x-user-id header or unsigned cookie grants nothing', async () => {
    await expect(getAuthenticatedUser(req({ 'x-user-id': userA }))).rejects.toThrow(/Unauthorized/);
    await expect(getAuthenticatedUser(req({}, userA))).rejects.toThrow(/Unauthorized/);
  });
  it('a tampered session token is rejected; a valid one resolves the user', async () => {
    const token = createSessionToken(userA);
    const [payload, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ u: userB, exp: 9999999999 })).toString('base64url');
    expect(readSessionToken(`${forged}.${sig}`)).toBeNull();
    expect(readSessionToken(`${payload}.${sig}`)).toBe(userA);
    expect((await getAuthenticatedUser(req({}, token))).id).toBe(userA);
  });
  it('admin endpoints need the admin role', async () => {
    await expect(requireAdmin(req({}, createSessionToken(userA)))).rejects.toThrow(/administrator/);
  });
});

describe('Tenant isolation and data', () => {
  it('a new account starts empty — no sample data', async () => {
    const state = await getFullWorkspaceState(userA, 2025);
    expect(state.documents).toHaveLength(0);
    expect(state.transactions).toHaveLength(0);
  });
  it("one user's documents never appear for another", async () => {
    await ingestDocumentForUser({
      userId: userB,
      taxYear: 2025,
      filename: 'b.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Date,Description,Amount,Direction\n2025-02-01,Client payment 1099-NEC,1000.00,inflow\n'),
    });
    expect((await getFullWorkspaceState(userB, 2025)).transactions).toHaveLength(1);
    expect((await getFullWorkspaceState(userA, 2025)).transactions).toHaveLength(0);
  });
  it('the same file cannot be uploaded twice', async () => {
    await expect(
      ingestDocumentForUser({
        userId: userB,
        taxYear: 2025,
        filename: 'b-again.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from('Date,Description,Amount,Direction\n2025-02-01,Client payment 1099-NEC,1000.00,inflow\n'),
      })
    ).rejects.toThrow(/DUPLICATE_DOCUMENT/);
  });
  it('the free trial allows one statement', async () => {
    await expect(
      ingestDocumentForUser({
        userId: userB,
        taxYear: 2025,
        filename: 'second.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from('Date,Description,Amount,Direction\n2025-03-01,Other,5.00,outflow\n'),
      })
    ).rejects.toThrow(/FREE_TRIAL_LIMIT_REACHED/);
  });
  it('demo accounts get their own labelled sample data', async () => {
    const demo = await createDemoAccount();
    const state = await getFullWorkspaceState(demo, 2025);
    expect(state.documents.length).toBeGreaterThan(0);
    expect((state.user as { is_demo: boolean }).is_demo).toBe(true);
    // The sample duplicate grocery line is excluded, the transfer and card repayment are not income/expense.
    expect(state.transactions.some((t) => t.is_duplicate)).toBe(true);
  });
});

describe('Signed links and masking', () => {
  it('download links expire and are bound to their owner', () => {
    const { token } = createSignedDownloadToken({ userId: userA, resourceType: 'export_package', resourceId: 'r1' });
    expect(verifySignedDownloadToken(token, userA).valid).toBe(true);
    expect(verifySignedDownloadToken(token, userB).valid).toBe(false);
    const expired = createSignedDownloadToken({ userId: userA, resourceType: 'export_package', resourceId: 'r1', expiresInSeconds: -1 });
    expect(verifySignedDownloadToken(expired.token, userA).valid).toBe(false);
  });
  it('masks SSNs and account numbers before anything leaves the server', () => {
    const out = maskSensitivePII('SSN 123-45-6789 card 4111 1111 1111 1111 ACCT#12345678');
    expect(out).not.toMatch(/123-45-6789|4111 1111|12345678/);
  });
});

describe('Stripe: entitlements only from verified webhooks', () => {
  const stripe = new Stripe('sk_test_dummy');
  function signed(event: object) {
    const payload = JSON.stringify(event);
    return { payload, header: stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET }) };
  }
  const paidExport = (id: string) => ({
    id,
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_${id}`,
        object: 'checkout.session',
        mode: 'payment',
        payment_status: 'paid',
        amount_total: 5000,
        payment_intent: `pi_${id}`,
        client_reference_id: userA,
        metadata: { user_id: userA, kind: 'export', tier: 'essential_50', tax_year: '2025' },
      },
    },
  });

  it('rejects a forged signature', () => {
    const { payload } = signed(paidExport('evt_forged'));
    expect(() => constructVerifiedEvent(payload, 't=1,v1=deadbeef')).toThrow();
  });
  it('a verified checkout.session.completed grants the export once (idempotent)', async () => {
    const { payload, header } = signed(paidExport('evt_ok_1'));
    const event = constructVerifiedEvent(payload, header);
    expect(await handleVerifiedStripeEvent(event)).toBe(true);
    expect(await handleVerifiedStripeEvent(event)).toBe(false);
    const state = await getFullWorkspaceState(userA, 2025);
    const paid = state.exportPurchases.filter((p) => p.status === 'paid' && p.stripe_webhook_verified);
    expect(paid).toHaveLength(1);
    expect(paid[0].amount_cents).toBe(5000);
  });
});
