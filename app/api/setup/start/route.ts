import { NextResponse } from 'next/server';

// Provision the private family locally in one D1 batch before deployment.
// Never expose partially atomic interactive-Prisma setup on a public Worker.
export async function POST() {
  return NextResponse.json({
    success: false,
    error: 'Online family setup is disabled on this Cloudflare deployment. Use the private bootstrap script before deployment.',
  }, { status: 403 });
}
