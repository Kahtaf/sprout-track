import { describe, it, expect } from 'vitest';
import { createReplaySafeActivity, softDeleteActivity, offlineMutationVersion, offlineRequestId } from '@/prisma/offline-activity';
const id = '23842884-a779-4a9a-ad8a-ec2cbe1941b3';
const version = new Date('2026-10-04T14:00:00.000Z');
function request(method = 'POST', key = id, base?: string) {
  return new Request('https://example.test/api/note?id=' + id, { method, headers: { 'X-Offline-Request-Id': key, ...(base ? { 'X-Offline-Base-Version': base } : {}) } });
}
function store() {
  const records = new Map<string, any>();
  const delegate = {
    async findUnique({ where }: any) { return records.get(where.id) ?? null; },
    async update({ where, data }: any) {
      const row = records.get(where.id);
      if (!row || row.familyId !== where.familyId || (where.updatedAt && row.updatedAt.getTime() !== where.updatedAt.getTime())) throw { code: 'P2025' };
      Object.assign(row, data); return row;
    },
  };
  let creations = 0;
  async function create(key = id) {
    if (records.has(key)) throw new Error('UNIQUE');
    const row = { id: key, familyId: 'family', babyId: 'baby', content: 'Original', deletedAt: null, updatedAt: version };
    records.set(key, row); creations++; return row;
  }
  return { records, delegate, create, count: () => creations };
}

describe('offline activity replay safety', () => {
  it('uses the client UUID, returns later caregiver edits on lost-ack replay, and creates exactly once', async () => {
    const s = store();
    const first = await createReplaySafeActivity(request(), s.delegate, 'family', 'baby', s.create);
    expect(first.record.id).toBe(id);
    first.record.content = 'Later caregiver edit';
    const replay = await createReplaySafeActivity(request(), s.delegate, 'family', 'baby', s.create);
    expect(replay.created).toBe(false);
    expect(replay.record.content).toBe('Later caregiver edit');
    expect(s.count()).toBe(1);
  });
  it('handles simultaneous same-UUID retries and an acknowledgement lost immediately after commit', async () => {
    const s = store();
    const replies = await Promise.all([1, 2].map(() => createReplaySafeActivity(request(), s.delegate, 'family', 'baby', s.create)));
    expect(replies.filter(reply => reply.created)).toHaveLength(1);
    expect(s.count()).toBe(1);
    const t = store();
    const reply = await createReplaySafeActivity(request(), t.delegate, 'family', 'baby', async key => { await t.create(key); throw new Error('Lost acknowledgement'); });
    expect(reply.record.id).toBe(id);
    expect(t.count()).toBe(1);
  });
  it('retains tombstones, acknowledges repeated deletion, and never resurrects a deleted POST UUID', async () => {
    const s = store(); await s.create();
    await softDeleteActivity(request('DELETE', id, version.toISOString()), s.delegate, 'family', id);
    await softDeleteActivity(request('DELETE'), s.delegate, 'family', id);
    await expect(createReplaySafeActivity(request(), s.delegate, 'family', 'baby', s.create)).rejects.toMatchObject({ status: 410 });
    expect(s.count()).toBe(1);
  });
  it('rejects cross-family or different-baby IDs and cannot delete the collided record', async () => {
    const s = store(); await s.create();
    await expect(createReplaySafeActivity(request(), s.delegate, 'other', 'baby', s.create)).rejects.toMatchObject({ status: 409 });
    await expect(createReplaySafeActivity(request(), s.delegate, 'family', 'other-baby', s.create)).rejects.toMatchObject({ status: 409 });
    await expect(softDeleteActivity(request('DELETE', id, version.toISOString()), s.delegate, 'other', id)).rejects.toMatchObject({ status: 404 });
    expect(s.records.get(id).deletedAt).toBeNull();
  });
  it('requires a cached version and blocks stale offline updates before mutation', () => {
    const record = { id, familyId: 'family', babyId: 'baby', deletedAt: null, updatedAt: version };
    expect(offlineMutationVersion(request('PUT', id, version.toISOString()), record)?.getTime()).toBe(version.getTime());
    expect(() => offlineMutationVersion(request('PUT'), record)).toThrow(/cached server version/);
    expect(() => offlineMutationVersion(request('PUT', id, '2026-10-01T00:00:00Z'), record)).toThrow(/changed while offline/);
  });
  it('validates UUID headers and restricts the contract to core routes', () => {
    expect(() => offlineRequestId(request('POST', 'malformed'))).toThrow(/Invalid/);
    expect(() => offlineRequestId(new Request('https://example.test/api/auth', { headers: { 'X-Offline-Request-Id': id } }))).toThrow(/Invalid/);
  });
});
