import { NextResponse } from 'next/server';

// A configuration flag must not reopen unported, interactive-transaction setup.
export async function POST() {
  return NextResponse.json({
    success: false,
    error: 'Online setup invitations are disabled on this Cloudflare deployment. Use the private bootstrap script.',
  }, { status: 403 });
}
