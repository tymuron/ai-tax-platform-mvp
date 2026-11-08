import { NextRequest, NextResponse } from 'next/server';
import { attachSessionCookie, errorResponse } from '@/lib/security/vault-and-auth';
import { authenticate, loginSchema } from '@/lib/services/auth-service';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';

export async function POST(req: NextRequest) {
  try {
    if (!rateLimit(`login:${clientIp(req)}`, 10, 15 * 60 * 1000)) {
      return NextResponse.json({ ok: false, error: 'Too many attempts. Wait 15 minutes and try again.' }, { status: 429 });
    }
    const parsed = loginSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Enter your email and password' }, { status: 400 });
    }
    const userId = await authenticate(parsed.data);
    return attachSessionCookie(NextResponse.json({ ok: true }), userId);
  } catch (err) {
    return errorResponse(err, 401);
  }
}
