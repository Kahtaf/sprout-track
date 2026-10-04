import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse } from '../../types';
import { checkIpLockout } from '../../utils/ip-lockout';

/**
 * API endpoint to check if an IP is locked out
 */
export async function GET(req: NextRequest) {
  // Get the client IP
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') ||
             req.headers.get('x-real-ip') || 
             'unknown';
  
  const { locked, remainingTime } = await checkIpLockout(ip);
  
  return NextResponse.json<ApiResponse<{ locked: boolean; remainingTime: number }>>(
    {
      success: true,
      data: { locked, remainingTime }
    }
  );
}

// Failed attempts are recorded by authentication itself; exposing a reset permits brute force.
export async function POST() { return NextResponse.json({ success: false, error: 'Method not allowed' }, { status: 405 }); }
export async function DELETE() { return NextResponse.json({ success: false, error: 'Method not allowed' }, { status: 405 }); }
