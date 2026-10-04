import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const delegates = vi.hoisted(() => new Map<string, { findMany: ReturnType<typeof vi.fn> }>());
vi.mock('@/app/api/db', () => ({ default: new Proxy({}, {
  get: (_target, name: string) => delegates.get(name),
}) }));
import { exportToJSON, importFromJSON, importFromSQLiteFile } from '@/app/api/utils/db-backup';

beforeEach(() => {
  delegates.clear();
  for (const model of Object.values(Prisma.ModelName)) {
    delegates.set(model.charAt(0).toLowerCase() + model.slice(1), { findMany: vi.fn().mockResolvedValue([]) });
  }
});

describe('Cloudflare history backups', () => {
  it('includes every generated model and retains deleted history and source provenance', async () => {
    const rows = [{ id: 'synthetic', deletedAt: '2026-01-01T00:00:00Z', notes: 'Synthetic history' }];
    delegates.get('feedLog')!.findMany.mockResolvedValue(rows);
    delegates.get('externalImportRecord')!.findMany.mockResolvedValue([{ id: 'source', raw: '{"synthetic":true}' }]);
    const data = await exportToJSON();
    expect(Object.keys(data).sort()).toEqual(Object.values(Prisma.ModelName).sort());
    expect(data.FeedLog).toEqual(rows);
    expect(data.ExternalImportRecord).toEqual([{ id: 'source', raw: '{"synthetic":true}' }]);
  });

  it('rejects a backup if any table cannot be read, rather than producing an incomplete download', async () => {
    delegates.get('feedLog')!.findMany.mockRejectedValue(new Error('Synthetic database failure'));
    await expect(exportToJSON()).rejects.toThrow('Synthetic database failure');
  });

  it('refuses legacy restores before writing any records', async () => {
    await expect(importFromJSON({ FeedLog: [{ id: 'synthetic' }] })).rejects.toThrow('administrator-managed');
    await expect(importFromSQLiteFile(Buffer.from('SQLite'))).rejects.toThrow('unavailable');
    for (const delegate of delegates.values()) expect(delegate.findMany).not.toHaveBeenCalled();
  });
});
