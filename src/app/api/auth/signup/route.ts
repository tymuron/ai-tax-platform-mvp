import { NextRequest, NextResponse } from 'next/server';
import { attachSessionCookie, errorResponse } from '@/lib/security/vault-and-auth';
import { registerUser, signupSchema } from '@/lib/services/auth-service';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';

export async function POST(req: NextRequest) {
  try {
    if (!rateLimit(`signup:${clientIp(req)}`, 10, 60 * 60 * 1000)) {
      return NextResponse.json({ ok: false, error: 'Too many sign-ups from this address. Try again later.' }, { status: 429 });
    }
    const parsed = signupSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 });
    }
    const userId = await registerUser(parsed.data);
    return attachSessionCookie(NextResponse.json({ ok: true }), userId);
  } catch (err) {
    return errorResponse(err);
  }
}
