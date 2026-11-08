import { NextRequest, NextResponse } from 'next/server';
import { attachSessionCookie, errorResponse } from '@/lib/security/vault-and-auth';
import { createDemoAccount } from '@/lib/services/auth-service';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';

/** Creates a private demo account with labelled sample data. Each visitor gets their own. */
export async function POST(req: NextRequest) {
  try {
    if (!rateLimit(`demo:${clientIp(req)}`, 20, 60 * 60 * 1000)) {
      return NextResponse.json({ ok: false, error: 'Too many demo accounts from this address. Try again later.' }, { status: 429 });
    }
    const userId = await createDemoAccount();
    return attachSessionCookie(NextResponse.json({ ok: true }), userId);
  } catch (err) {
    return errorResponse(err, 500);
  }
}
