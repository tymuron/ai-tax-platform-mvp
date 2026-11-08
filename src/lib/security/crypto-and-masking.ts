import crypto from 'crypto';
import { getSecret } from '@/lib/security/secrets';

const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // US SSN (XXX-XX-XXXX)
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[REDACTED-SSN]' },
  // US EIN (XX-XXXXXXX)
  { pattern: /\b\d{2}-\d{7}\b/g, replacement: '[REDACTED-EIN]' },
  // Credit Card / Bank Account Numbers (8 to 19 consecutive digits or spaced 4x4)
  { pattern: /\b(?:\d[ -]*?){12,19}\b/g, replacement: '[REDACTED-ACCOUNT]' },
  { pattern: /\b(?:ACCT|ACCOUNT|ROUTING|ABA|CARD|CHK)[:#\s]*\d{4,17}\b/gi, replacement: '[REDACTED-BANK-ID]' },
  // Email addresses
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[REDACTED-EMAIL]' },
  // Phone numbers
  { pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: '[REDACTED-PHONE]' },
];

/**
 * Masks sensitive bank, SSN, EIN, card, routing, and personal identifiers
 * before sending any text to an external AI service or displaying in logs.
 */
export function maskSensitivePII(input: string): string {
  if (!input) return '';
  let sanitized = input;
  for (const { pattern, replacement } of PII_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  return sanitized;
}


/**
 * Generates a temporary HMAC-SHA256 signed token for private file or export downloads.
 */
export function createSignedDownloadToken(params: {
  userId: string;
  resourceType: 'document' | 'export_package';
  resourceId: string;
  format?: string;
  expiresInSeconds?: number;
}): { token: string; expiresAt: number } {
  const expiresAt =
    Math.floor(Date.now() / 1000) + (params.expiresInSeconds ?? 900); // 15 min default
  const payload = JSON.stringify({
    u: params.userId,
    t: params.resourceType,
    r: params.resourceId,
    f: params.format || 'PDF',
    exp: expiresAt,
  });
  const encodedPayload = Buffer.from(payload, 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSecret('FILE_SIGNING_SECRET'))
    .update(encodedPayload)
    .digest('base64url');
  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt,
  };
}

/**
 * Verifies a temporary signed download token and enforces user ownership and expiration.
 */
export function verifySignedDownloadToken(token: string, expectedUserId?: string): {
  valid: boolean;
  reason?: string;
  payload?: {
    userId: string;
    resourceType: 'document' | 'export_package';
    resourceId: string;
    format: string;
    expiresAt: number;
  };
} {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) {
      return { valid: false, reason: 'Malformed signed token' };
    }
    const [encodedPayload, providedSig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', getSecret('FILE_SIGNING_SECRET'))
      .update(encodedPayload)
      .digest('base64url');

    const sigBufA = Buffer.from(providedSig);
    const sigBufB = Buffer.from(expectedSig);
    if (sigBufA.length !== sigBufB.length || !crypto.timingSafeEqual(sigBufA, sigBufB)) {
      return { valid: false, reason: 'Invalid token signature' };
    }

    const decoded = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    );
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof decoded.exp !== 'number' || decoded.exp < nowSec) {
      return { valid: false, reason: 'Signed link has expired' };
    }
    if (expectedUserId && decoded.u !== expectedUserId) {
      return { valid: false, reason: 'Cross-tenant access denied' };
    }

    return {
      valid: true,
      payload: {
        userId: decoded.u,
        resourceType: decoded.t,
        resourceId: decoded.r,
        format: decoded.f,
        expiresAt: decoded.exp,
      },
    };
  } catch {
    return { valid: false, reason: 'Failed to parse token' };
  }
}

export function computeSha256(buffer: Buffer | string): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/** scrypt with a random per-user salt, stored as "scrypt:<salt>:<hash>". */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return ['scrypt', salt, hash].join(':');
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const expected = Buffer.from(parts[2], 'hex');
  const actual = crypto.scryptSync(password, parts[1], expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
