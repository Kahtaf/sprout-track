import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { lazyRequestClient } from '@/prisma/request-client';
import { withDatabaseScope, getRequestDatabaseClients, getDatabaseBinding } from '@/src/lib/cloudflare/runtime';

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const name of ['0001_application', '0002_optional_logs', '0003_auth_security', '0004_reference_data', '0005_exact_durations']) {
    db.exec(readFileSync(`prisma/d1-migrations/${name}.sql`, 'utf8'));
  }
  db.prepare('INSERT INTO Family(id, slug, name, updatedAt) VALUES (?, ?, ?, ?)').run('family', 'family', 'Test family', '2026-01-01');
  db.prepare('INSERT INTO Baby(id, firstName, lastName, birthDate, updatedAt, familyId) VALUES (?, ?, ?, ?, ?, ?)').run('baby', 'Test', 'Baby', '2026-01-01', '2026-01-01', 'family');
  return db;
}

describe('D1 schema baseline', () => {
  it('retains incomplete historic pumps and prevents duplicate source imports within a family', () => {
    const db = database();
    try {
      db.prepare('INSERT INTO PumpLog(id, startTime, updatedAt, babyId, familyId) VALUES (?, ?, ?, ?, ?)').run('pump', '2026-01-02', '2026-01-02', 'baby', 'family');
      const pump = db.prepare('SELECT endTime, duration, totalAmount FROM PumpLog WHERE id = ?').get('pump');
      expect({ ...pump }).toEqual({ endTime: null, duration: null, totalAmount: null });
      db.prepare('UPDATE PumpLog SET durationSeconds = ? WHERE id = ?').run(61, 'pump');
      expect(db.prepare('SELECT durationSeconds FROM PumpLog').get()?.durationSeconds).toBe(61);
      const insert = db.prepare('INSERT INTO ExternalImportRecord(id, providerId, sourceEntityType, sourceRecordId, targetEntityType, targetRecordId, rawSource, reviewFlags, familyId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      insert.run('import', 'babycare', 'pumping', 'source', 'pump', 'pump', '{"unknownField":true}', '["unit-review"]', 'family');
      expect(() => insert.run('again', 'babycare', 'pumping', 'source', 'pump', 'pump', null, null, 'family')).toThrow(/UNIQUE/);
      expect(() => insert.run('wrong-family', 'nara', 'pumping', 'source', 'pump', 'pump', null, null, 'missing')).toThrow(/FOREIGN KEY/);
      expect(db.prepare('SELECT rawSource FROM ExternalImportRecord').get()?.rawSource).toBe('{"unknownField":true}');
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(db.prepare('SELECT count(*) AS count FROM Unit').get()?.count).toBe(28);
      expect(Number(db.prepare('SELECT count(*) AS count FROM WhoWeightForAge').get()?.count)).toBeGreaterThan(40);
    } finally { db.close(); }
  });
});

describe('request-scoped Prisma resolution', () => {
  it('does not open a database on import or promise inspection and preserves method receivers', () => {
    let resolutions = 0;
    const real = { number: 3, method() { return this.number; } };
    const proxy = lazyRequestClient(() => { resolutions++; return real; });
    expect((proxy as any).then).toBeUndefined();
    expect(resolutions).toBe(0);
    expect(proxy.method()).toBe(3);
  });
  it('isolates client caches and bindings across concurrent requests and fails outside scope', async () => {
    const a = {} as D1Database;
    const b = {} as D1Database;
    await Promise.all([a, b].map(binding => withDatabaseScope(binding, async () => {
      getRequestDatabaseClients().set('client', binding);
      await Promise.resolve();
      expect(getDatabaseBinding()).toBe(binding);
      expect(getRequestDatabaseClients().get('client')).toBe(binding);
    })));
    expect(() => getDatabaseBinding()).toThrow(/request scope/);
  });
});
