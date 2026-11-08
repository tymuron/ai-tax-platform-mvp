import crypto from 'crypto';

/**
 * Server secrets. Never fall back to a constant from source code: the repository is
 * readable, so a constant key protects nothing.
 *
 * - With persistent storage (DATABASE_URL) a missing secret is a configuration error.
 * - Without it (local dev, tests, or the throw-away demo storage on Vercel) a random
 *   per-process secret is generated. Data in that mode is temporary anyway, so sessions,
 *   signed links and encrypted files simply end when the process ends.
 */
const generated = new Map<string, string>();

export class ConfigurationError extends Error {}

export function getSecret(name: 'SESSION_SECRET' | 'FILE_SIGNING_SECRET' | 'VAULT_ENCRYPTION_KEY'): string {
  const fromEnv = process.env[name];
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  if (fromEnv && fromEnv.length < 32) {
    throw new ConfigurationError(`${name} must be at least 32 characters.`);
  }
  if (process.env.DATABASE_URL) {
    throw new ConfigurationError(
      `${name} is not set. It is required when DATABASE_URL (persistent storage) is configured. See ENVIRONMENT.md.`
    );
  }
  let value = generated.get(name);
  if (!value) {
    value = crypto.randomBytes(32).toString('hex');
    generated.set(name, value);
  }
  return value;
}
