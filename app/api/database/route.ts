import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { withSysAdminAuth, ApiResponse } from '../utils/auth';
import { exportToJSON } from '../utils/db-backup';
import { unavailableFeature, DATABASE_RESTORE_UNAVAILABLE } from '@/src/lib/worker-capabilities';

export const GET = withSysAdminAuth(async () => {
  try {
    const zip = new JSZip();
    zip.file('data.json', JSON.stringify(await exportToJSON()));
    zip.file('README.txt', 'Sprout Track Cloudflare data backup. Contains private application records including deleted history and import provenance. Does not contain deployment secrets or attachment files. Restore through administrator-managed D1 tooling.');
    const body = await zip.generateAsync({ type: 'uint8array' });
    return new NextResponse<ApiResponse<unknown>>(new Uint8Array(body).buffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="sprout-track-backup-${new Date().toISOString().slice(0, 10)}.zip"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json<ApiResponse<unknown>>({ success: false, error: 'Failed to export complete database backup.' }, { status: 500 });
  }
});
export const POST = withSysAdminAuth(async () => unavailableFeature(DATABASE_RESTORE_UNAVAILABLE));
