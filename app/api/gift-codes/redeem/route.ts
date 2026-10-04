import { NextResponse } from 'next/server';

// No subscription or gift-code billing exists on this private family Worker.
export async function POST() {
  return NextResponse.json({
    success: false,
    error: 'Gift codes and subscription billing are disabled on this personal Cloudflare deployment.',
  }, { status: 403 });
}
