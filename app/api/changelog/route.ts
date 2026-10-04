import { NextResponse } from 'next/server';
import content from '@/src/lib/changelog-content.json';

export async function GET() {
  return NextResponse.json({ content });
}
