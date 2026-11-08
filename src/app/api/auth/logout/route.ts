import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/security/vault-and-auth';

export async function POST() {
  return clearSessionCookie(NextResponse.json({ ok: true }));
}
