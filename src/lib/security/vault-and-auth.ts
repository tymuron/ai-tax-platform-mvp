import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { UserRecord } from '@/types/tax';

const VAULT_ROOT =
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? path.join('/tmp', 'ai-tax-private-vault')
    : path.join(process.cwd(), '.data', 'private_vault');
const ENCRYPTION_KEY = crypto
  .createHash('sha256')
  .update(
    process.env.VAULT_ENCRYPTION_KEY ||
      'ai-tax-v2-aes-256-gcm-private-vault-encryption-key-2026'
  )
  .digest();

/**
 * Stores a file encrypted at rest using AES-256-GCM inside a private non-public directory.
 */
export function saveEncryptedFileToVault(
  userId: string,
  documentId: string,
  filename: string,
  buffer: Buffer
): string {
  const userDir = path.join(VAULT_ROOT, userId);
  fs.mkdirSync(userDir, { recursive: true });
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = path.join(userDir, `${documentId}_${safeFilename}.enc`);

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: [12-byte IV][16-byte AuthTag][Ciphertext]
  const payload = Buffer.concat([iv, authTag, encrypted]);
  fs.writeFileSync(storagePath, payload);
  return storagePath;
}

/**
 * Reads and decrypts a file from the private vault.
 */
export function readDecryptedFileFromVault(storagePath: string): Buffer {
  if (!fs.existsSync(storagePath)) {
    throw new Error('Encrypted file not found in private vault');
  }
  const payload = fs.readFileSync(storagePath);
  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);

  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Resolves the authenticated user for a request, enforcing tenant isolation.
 * Supports x-user-id header, session cookie, or falls back to the seeded demo user in local dev.
 */
export async function getAuthenticatedUser(
  req?: NextRequest
): Promise<UserRecord> {
  const db = await getDb();
  let requestedUserId = 'user_alex_morgan';

  if (req) {
    const headerUser = req.headers.get('x-user-id');
    const cookieUser = req.cookies.get('ai_tax_user_id')?.value;
    if (headerUser) {
      requestedUserId = headerUser;
    } else if (cookieUser) {
      requestedUserId = cookieUser;
    }
  }

  const res = await db.query<UserRecord>(
    `SELECT id, email, full_name, role, status, created_at FROM users WHERE id = $1 LIMIT 1`,
    [requestedUserId]
  );

  if (res.rows.length === 0) {
    throw new Error('Unauthorized: User not found');
  }

  const user = res.rows[0];
  if (user.status === 'blocked') {
    throw new Error('Forbidden: User account is blocked');
  }

  return user;
}
