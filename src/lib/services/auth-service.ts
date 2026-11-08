import crypto from 'crypto';
import { z } from 'zod';
import { getDb, writeAuditLog } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/security/crypto-and-masking';
import {
  applyDemoProfile,
  createProfileForUser,
  ensureDemoWorkspaceSeeded,
} from '@/lib/services/workspace-service';

export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(10, 'Password must be at least 10 characters').max(200),
  fullName: z.string().trim().min(1).max(120),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

function newUserId(): string {
  return `user_${crypto.randomBytes(12).toString('hex')}`;
}

export async function registerUser(input: z.infer<typeof signupSchema>): Promise<string> {
  const db = await getDb();
  const exists = await db.query(`SELECT 1 FROM users WHERE email = $1`, [input.email]);
  if (exists.rows.length > 0) throw new Error('An account with this email already exists');
  const id = newUserId();
  const now = new Date().toISOString();
  await db.query(
    `INSERT INTO users (id, email, password_hash, full_name, role, status, is_demo, created_at)
     VALUES ($1, $2, $3, $4, 'user', 'active', FALSE, $5)`,
    [id, input.email, hashPassword(input.password), input.fullName, now]
  );
  await createProfileForUser(id);
  await db.query(
    `INSERT INTO subscriptions (id, user_id, plan, status, price_cents, stripe_webhook_verified, current_period_end, created_at)
     VALUES ($1, $2, 'free_trial', 'active', 0, FALSE, $3, $3)`,
    [`sub_trial_${id}`, id, now]
  );
  await writeAuditLog({ userId: id, actorRole: 'user', action: 'USER_REGISTERED', entityType: 'user', entityId: id });
  return id;
}

export async function authenticate(input: z.infer<typeof loginSchema>): Promise<string> {
  const db = await getDb();
  const res = await db.query<{ id: string; password_hash: string; status: string }>(
    `SELECT id, password_hash, status FROM users WHERE email = $1 AND is_demo = FALSE LIMIT 1`,
    [input.email]
  );
  const row = res.rows[0];
  // Always run a hash comparison so response time does not reveal whether the email exists.
  const ok = verifyPassword(input.password, row?.password_hash || 'scrypt:00:00');
  if (!row || !ok) throw new Error('Email or password is incorrect');
  if (row.status === 'blocked') throw new Error('This account is blocked');
  await writeAuditLog({ userId: row.id, actorRole: 'user', action: 'USER_SIGNED_IN', entityType: 'user', entityId: row.id });
  return row.id;
}

/** A private, throw-away account filled with clearly labelled sample data. */
export async function createDemoAccount(): Promise<string> {
  const db = await getDb();
  const id = `demo_${crypto.randomBytes(10).toString('hex')}`;
  const now = new Date().toISOString();
  await db.query(
    `INSERT INTO users (id, email, password_hash, full_name, role, status, is_demo, created_at)
     VALUES ($1, $2, $3, 'Demo user (sample data)', 'user', 'active', TRUE, $4)`,
    [id, `${id}@demo.invalid`, hashPassword(crypto.randomBytes(24).toString('hex')), now]
  );
  await createProfileForUser(id);
  await applyDemoProfile(id);
  await db.query(
    `INSERT INTO subscriptions (id, user_id, plan, status, price_cents, stripe_webhook_verified, current_period_end, created_at)
     VALUES ($1, $2, 'free_trial', 'active', 0, FALSE, $3, $3)`,
    [`sub_trial_${id}`, id, now]
  );
  await ensureDemoWorkspaceSeeded(id);
  return id;
}
