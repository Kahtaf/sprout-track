import { NextResponse } from 'next/server';

// This personal deployment uses family/caretaker PIN sessions, without SaaS accounts.
export async function POST() {
  return NextResponse.json({
    success: false,
    error: 'Account linking is unavailable on this personal Cloudflare deployment. Manage caregivers through family settings.',
  }, { status: 501 });
}
