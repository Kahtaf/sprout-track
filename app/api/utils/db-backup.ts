import { Prisma } from '@prisma/client';
import prisma from '../db';

/** Export every model, including deleted rows and importer provenance.
 * An unreadable table fails the backup instead of silently omitting history.
 * Environment secrets and attachment bytes are not part of this JSON backup.
 */
export async function exportToJSON(): Promise<Record<string, unknown[]>> {
  const data: Record<string, unknown[]> = {};
  for (const tableName of Object.values(Prisma.ModelName)) {
    const modelName = tableName.charAt(0).toLowerCase() + tableName.slice(1);
    const delegate = (prisma as unknown as Record<string, { findMany(): Promise<unknown[]> }>)[modelName];
    data[tableName] = await delegate.findMany();
  }
  return data;
}

export function backfillNotificationPreferenceOwners(
  rows: Record<string, any>[],
  subscriptionOwners: Map<string, { familyId: string | null; caretakerId: string | null; accountId: string | null }>
): Record<string, any>[] {
  return rows.map((row) => {
    if (row.familyId != null) return row;
    const sub = row.subscriptionId ? subscriptionOwners.get(row.subscriptionId) : undefined;
    if (!sub) return row;
    return {
      ...row,
      familyId: sub.familyId ?? null,
      caretakerId: row.caretakerId ?? sub.caretakerId ?? null,
      accountId: row.accountId ?? sub.accountId ?? null,
    };
  });
}


export async function importFromSQLiteFile(_buffer: Buffer): Promise<never> {
  throw new Error('SQLite file restore is unavailable on Cloudflare.');
}
export async function importFromJSON(_data: Record<string, unknown[]>): Promise<never> {
  throw new Error('Full database restore is administrator-managed on Cloudflare. Use the external history importer for activity records.');
}
