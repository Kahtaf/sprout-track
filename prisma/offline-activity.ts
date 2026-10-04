const allowedPaths = new Set(['/api/feed-log', '/api/diaper-log', '/api/sleep-log', '/api/pump-log', '/api/note']);
export class OfflineActivityError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = 'OfflineActivityError'; }
}
export function offlineRequestId(request: Request): string | undefined {
  const value = request.headers.get('X-Offline-Request-Id');
  if (value === null) return undefined;
  if (!allowedPaths.has(new URL(request.url).pathname) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new OfflineActivityError('Invalid offline request ID', 400);
  }
  return value.toLowerCase();
}
interface ActivityRecord { id: string; familyId: string | null; babyId: string; deletedAt: Date | null; updatedAt?: Date; }
interface ActivityReader<T extends ActivityRecord> { findUnique(args: any): Promise<T | null>; }
/** Require the cached server version for queued edits/deletes. Conditional SQL
 * writes use the returned Date too, preventing a read/write race after this check. */
export function offlineMutationVersion(request: Request, record: ActivityRecord): Date | undefined {
  if (!offlineRequestId(request)) return undefined;
  const value = request.headers.get('X-Offline-Base-Version');
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime()) || !record.updatedAt) throw new OfflineActivityError('Offline edits require the cached server version', 400);
  if (date.getTime() !== record.updatedAt.getTime()) throw new OfflineActivityError('This activity changed while offline. Review the queued change before retrying.', 409);
  return date;
}
export function offlineWriteConflict(error: unknown, request: Request): boolean {
  return request.headers.has('X-Offline-Request-Id') && !!error && typeof error === 'object' && 'code' in error && error.code === 'P2025';
}
export function requireActiveActivity(record: ActivityRecord) {
  if (record.deletedAt) throw new OfflineActivityError('This activity was removed. Discard its queued change or create a new activity.', 410);
}
/** Stable UUIDs are persisted as activity IDs. Replay returns current state,
 * preserving any later caregiver edits, rather than writing the old payload. */
export async function createReplaySafeActivity<T extends ActivityRecord>(
  request: Request, delegate: ActivityReader<T>, familyId: string | null | undefined,
  babyId: string, create: (id: string | undefined, timestamp?: Date) => Promise<T>,
): Promise<{ record: T; created: boolean }> {
  if (!familyId) throw new OfflineActivityError('Family access required', 403);
  const id = offlineRequestId(request);
  if (!id) return { record: await create(undefined), created: true };
  const replay = (record: T) => {
    if (record.familyId !== familyId || record.babyId !== babyId) throw new OfflineActivityError('Offline request ID is already in use', 409);
    requireActiveActivity(record);
    return { record, created: false };
  };
  const existing = await delegate.findUnique({ where: { id } });
  if (existing) return replay(existing);
  try { return { record: await create(id, new Date()), created: true }; }
  catch (error) {
    // A simultaneous request can win the same primary key. Scope-check its row
    // before treating the failure as a successful replay. No fallback mutation.
    const raced = await delegate.findUnique({ where: { id } });
    if (raced) return replay(raced);
    throw error;
  }
}
/** Tombstones prevent a lost POST acknowledgement from resurrecting a record
 * after another caregiver deletes it. Repeated DELETE is naturally successful. */
export async function softDeleteActivity<T extends ActivityRecord>(
  request: Request, delegate: ActivityReader<T> & { update(args: any): Promise<T> },
  familyId: string | null | undefined, id: string,
) {
  if (!familyId) throw new OfflineActivityError('Family access required', 403);
  const offlineId = offlineRequestId(request);
  const existing = await delegate.findUnique({ where: { id } });
  if (!existing) {
    if (offlineId) return;
    throw new OfflineActivityError('Activity not found', 404);
  }
  if (existing.familyId !== familyId) throw new OfflineActivityError('Activity not found', 404);
  if (existing.deletedAt) return;
  const version = offlineMutationVersion(request, existing);
  await delegate.update({ where: { id, familyId, deletedAt: null, ...(version ? { updatedAt: version } : {}) }, data: { deletedAt: new Date() } });
}
