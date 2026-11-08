import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/security/vault-and-auth';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    return NextResponse.json({ ok: true, user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role } });
  } catch {
    return NextResponse.json({ ok: true, user: null });
  }
}
