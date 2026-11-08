import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSecret } from '@/lib/security/secrets';
import { UserRecord } from '@/types/tax';

export const SESSION_COOKIE = 'ai_tax_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function vaultKey(): Buffer {
  return crypto.createHash('sha256').update(getSecret('VAULT_ENCRYPTION_KEY')).digest();
}

/** Encrypts the original file (AES-256-GCM) and stores it in the private document_blobs table. */
export async function saveEncryptedFileToVault(
  userId: string,
  documentId: string,
  buffer: Buffer
): Promise<string> {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', vaultKey(), iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const payload = Buffer.concat([iv, cipher.getAuthTag(), encrypted]); // [IV 12][tag 16][ciphertext]
  const db = await getDb();
  await db.query(
    `INSERT INTO document_blobs (document_id, user_id, ciphertext, created_at) VALUES ($1, $2, $3, $4)`,
    [documentId, userId, payload, new Date().toISOString()]
  );
  return `db://document_blobs/${documentId}`;
}

export async function readDecryptedFileFromVault(userId: string, documentId: string): Promise<Buffer> {
  const db = await getDb();
  const res = await db.query<{ ciphertext: Uint8Array }>(
    `SELECT ciphertext FROM document_blobs WHERE document_id = $1 AND user_id = $2`,
    [documentId, userId]
  );
  if (!res.rows[0]) throw new Error('Encrypted file not found');
  const payload = Buffer.from(res.rows[0].ciphertext);
  const decipher = crypto.createDecipheriv('aes-256-gcm', vaultKey(), payload.subarray(0, 12));
  decipher.setAuthTag(payload.subarray(12, 28));
  return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]);
}

// ---------------- Sessions ----------------

function sign(value: string): string {
  return crypto.createHmac('sha256', getSecret('SESSION_SECRET')).update(value).digest('base64url');
}

export function createSessionToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ u: userId, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS })
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.u !== 'string' || typeof data.exp !== 'number') return null;
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return data.u;
  } catch {
    return null;
  }
}

export function attachSessionCookie(res: NextResponse, userId: string): NextResponse {
  res.cookies.set(SESSION_COOKIE, createSessionToken(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}

export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}

export class AuthError extends Error {
  constructor(message: string, public status: 401 | 403) {
    super(message);
  }
}

/**
 * Resolves the signed-in user from the HttpOnly session cookie. There is no other way in:
 * headers or plain cookies naming a user id are ignored.
 */
export async function getAuthenticatedUser(req: NextRequest): Promise<UserRecord> {
  const userId = readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) throw new AuthError('Unauthorized: please sign in', 401);
  const db = await getDb();
  const res = await db.query<UserRecord>(
    `SELECT id, email, full_name, role, status, created_at FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const user = res.rows[0];
  if (!user) throw new AuthError('Unauthorized: session no longer valid', 401);
  if (user.status === 'blocked') throw new AuthError('Forbidden: account is blocked', 403);
  return user;
}

export async function requireAdmin(req: NextRequest): Promise<UserRecord> {
  const user = await getAuthenticatedUser(req);
  if (user.role !== 'admin') throw new AuthError('Forbidden: administrator access required', 403);
  return user;
}

/** Maps thrown errors to a JSON response with the right status code. */
export function errorResponse(err: unknown, fallbackStatus = 400): NextResponse {
  const message = err instanceof Error ? err.message : 'Request failed';
  const status = err instanceof AuthError ? err.status : fallbackStatus;
  if (!(err instanceof AuthError) && fallbackStatus >= 500) {
    console.error('[api]', err instanceof Error ? err.name : 'Error'); // no payloads in logs
  }
  return NextResponse.json({ ok: false, error: message }, { status });
}
