import { NextResponse } from 'next/server';

export const FILE_STORAGE_UNAVAILABLE = 'Photo and document storage is not configured for this deployment. Activity records and history exports remain available.';
export const DATABASE_RESTORE_UNAVAILABLE = 'Database file restore and runtime migrations are unavailable on Cloudflare. Use the external history importer, or restore D1 from an administrator-managed backup.';

export function unavailableFeature(error: string) {
  return NextResponse.json({ success: false, error, code: 'FEATURE_UNAVAILABLE' }, { status: 501 });
}
