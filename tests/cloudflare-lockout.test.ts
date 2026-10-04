import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { withDatabaseScope } from '@/src/lib/cloudflare/runtime';
import { checkIpLockout, recordFailedAttempt, resetFailedAttempts, isTokenRevoked, revokeToken } from '@/app/api/utils/ip-lockout';

// Execute the production SQL against SQLite, through the D1 prepared statement interface.
function binding(db: DatabaseSync): D1Database {
  return { prepare(sql: string) { let values: any[] = []; return {
    bind(...args: any[]) { values = args; return this; },
    async first() { return db.prepare(sql).get(...values) ?? null; },
    async run() { return db.prepare(sql).run(...values); },
  }; } } as unknown as D1Database;
}

describe('distributed login protection', () => {
  it('shares atomic attempt counters and logout revocations across fresh requests, expires state', async () => {
    const db = new DatabaseSync(':memory:');
    db.exec(readFileSync('prisma/d1-migrations/0003_auth_security.sql','utf8'));
    const request = <T>(run: () => T) => withDatabaseScope(binding(db), run);
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      expect((await request(() => checkIpLockout('192.0.2.1'))).locked).toBe(false);
      await Promise.all([1,2,3].map(() => request(() => recordFailedAttempt('192.0.2.1'))));
      expect((await request(() => checkIpLockout('192.0.2.1'))).locked).toBe(true);
      expect((await request(() => checkIpLockout('192.0.2.2'))).locked).toBe(false);
      await request(() => revokeToken('synthetic-token', now + 1000));
      expect(await request(() => isTokenRevoked('synthetic-token'))).toBe(true);
      expect(db.prepare('SELECT key FROM AuthSecurity').all().every(row => !String(row.key).includes('synthetic-token') && !String(row.key).includes('192.0.2.1'))).toBe(true);
      vi.mocked(Date.now).mockReturnValue(now + 300001);
      expect((await request(() => checkIpLockout('192.0.2.1'))).locked).toBe(false);
      expect(await request(() => isTokenRevoked('synthetic-token'))).toBe(false);
      await request(() => recordFailedAttempt('192.0.2.1'));
      expect((await request(() => checkIpLockout('192.0.2.1'))).locked).toBe(false);
      await request(() => resetFailedAttempts('192.0.2.1'));
      expect(Number(db.prepare("SELECT COUNT(*) AS n FROM AuthSecurity WHERE key LIKE 'login:%'").get()?.n)).toBe(0);
    } finally { vi.restoreAllMocks(); db.close(); }
  });
});
