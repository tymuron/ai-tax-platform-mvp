import { NextRequest } from 'next/server';

/**
 * Best-effort fixed-window limiter kept in memory. On serverless it is per instance, so it
 * slows brute force down but is not a hard guarantee — put a shared limiter (e.g. Upstash,
 * Vercel Firewall rules) in front for production.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function clientIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
}

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}
