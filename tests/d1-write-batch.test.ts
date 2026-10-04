import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { withDatabaseScope } from '@/src/lib/cloudflare/runtime';
import { insertRow, updateRows, deleteRows, executeWriteBatch, settingsGuard } from '@/prisma/d1-batch';

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(readFileSync('prisma/d1-migrations/0001_application.sql', 'utf8'));
  sqlite.exec(readFileSync('prisma/d1-migrations/0005_exact_durations.sql', 'utf8'));
  sqlite.prepare('INSERT INTO Family(id, slug, name, updatedAt) VALUES (?, ?, ?, ?)').run('family', 'test', 'Test', 1);
  sqlite.prepare('INSERT INTO Baby(id, firstName, lastName, birthDate, updatedAt, familyId) VALUES (?, ?, ?, ?, ?, ?)').run('baby', 'Test', 'Baby', 1, 1, 'family');
  sqlite.prepare('INSERT INTO Unit(id, unitAbbr, unitName, updatedAt) VALUES (?, ?, ?, ?)').run('ml', 'ML', 'Milliliters', 1);
  const binding = {
    prepare(sql: string) { return { bind(...values: any[]) { return { sql, values }; } }; },
    async batch(statements: { sql: string; values: any[] }[]) {
      sqlite.exec('BEGIN');
      try {
        const result = statements.map(({ sql, values }) => {
          const rows = sqlite.prepare(sql).all(...values);
          return { results: rows, meta: { changes: sqlite.prepare('SELECT changes() AS n').get()?.n } };
        });
        sqlite.exec('COMMIT');
        return result;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  } as unknown as D1Database;
  return { sqlite, binding };
}

describe('explicit D1 write batches', () => {
  it('commits linked pump/feed changes together and rolls back a later foreign-key failure', async () => {
    const { sqlite, binding } = setup();
    try {
      await withDatabaseScope(binding, () => executeWriteBatch([
        insertRow('PumpLog', { id: 'pump', babyId: 'baby', familyId: 'family', startTime: new Date(1000), totalAmount: 20, unitAbbr: 'ML', pumpAction: 'FED' }),
        insertRow('FeedLog', { id: 'feed', babyId: 'baby', familyId: 'family', time: new Date(1000), type: 'BOTTLE', sourcePumpId: 'pump', amount: 20, unitAbbr: 'ML' }),
      ]));
      expect(sqlite.prepare('SELECT amount FROM FeedLog').get()?.amount).toBe(20);
      await expect(withDatabaseScope(binding, () => executeWriteBatch([
        updateRows('PumpLog', { totalAmount: 25 }, '"id" = ?', ['pump']),
        updateRows('FeedLog', { amount: 25, unitAbbr: 'INVALID' }, '"id" = ?', ['feed']),
      ]))).rejects.toThrow(/FOREIGN KEY/);
      expect(sqlite.prepare('SELECT totalAmount FROM PumpLog').get()?.totalAmount).toBe(20);
      await withDatabaseScope(binding, () => executeWriteBatch([
        deleteRows('FeedLog', '"id" = ?', ['feed']), deleteRows('PumpLog', '"id" = ?', ['pump']),
      ]));
      expect(sqlite.prepare('SELECT count(*) AS n FROM PumpLog').get()?.n).toBe(0);
    } finally { sqlite.close(); }
  });
  it('rejects stale settings snapshots and rolls back associated sleep location renames', async () => {
    const { sqlite, binding } = setup();
    try {
      sqlite.prepare('INSERT INTO Settings(id, familyId, updatedAt, sleepLocationSettings) VALUES (?, ?, ?, ?)').run('settings', 'family', 1, '{"hiddenLocations":[]}');
      const snapshot = { id: 'settings', updatedAt: new Date(1), sleepLocationSettings: '{"hiddenLocations":[]}' };
      sqlite.prepare('UPDATE Settings SET sleepLocationSettings = ?').run('{"hiddenLocations":["Crib"]}');
      sqlite.prepare('INSERT INTO SleepLog(id, babyId, familyId, startTime, type, location, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)').run('sleep', 'baby', 'family', 1, 'NAP', 'Crib', 1);
      await expect(withDatabaseScope(binding, () => executeWriteBatch([
        updateRows('SleepLog', { location: 'Cot' }, '"id" = ?', ['sleep']),
        settingsGuard(snapshot),
        updateRows('Settings', { sleepLocationSettings: '{}' }, '"id" = ?', ['settings']),
      ]))).rejects.toThrow(/record changed/);
      expect(sqlite.prepare('SELECT location FROM SleepLog').get()?.location).toBe('Crib');
      expect(sqlite.prepare('SELECT sleepLocationSettings FROM Settings').get()?.sleepLocationSettings).toBe('{"hiddenLocations":["Crib"]}');
    } finally { sqlite.close(); }
  });
  it('binds user strings and rejects nested data and unexpected tables', () => {
    const plan = insertRow('Family', { id: 'family', name: "O'Brien; DROP TABLE Baby", slug: 'test' });
    expect(plan.sql).not.toContain("O'Brien");
    expect(plan.values).toContain("O'Brien; DROP TABLE Baby");
    expect(() => insertRow('Family', { babies: { create: {} } })).toThrow(/scalar/);
    expect(() => deleteRows('Unknown', '1 = 1', [])).toThrow(/Unsupported/);
  });
});
