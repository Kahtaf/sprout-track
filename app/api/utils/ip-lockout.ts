import { createHash } from 'node:crypto';
import { getDatabaseBinding } from '@/src/lib/cloudflare/runtime';

const WINDOW = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const keyFor = (ip: string) => 'login:' + createHash('sha256').update(ip).digest('hex');

// D1 is shared by isolates. No client can reset the counter through a public route.
export async function checkIpLockout(ip: string) {
  const row = await getDatabaseBinding().prepare('SELECT count, expiresAt FROM AuthSecurity WHERE key = ?').bind(keyFor(ip)).first<{count: number; expiresAt: number}>();
  const remainingTime = row ? Math.max(0, row.expiresAt - Date.now()) : 0;
  return { locked: !!row && row.count >= MAX_ATTEMPTS && remainingTime > 0, remainingTime: row && row.count >= MAX_ATTEMPTS ? remainingTime : 0 };
}

export async function recordFailedAttempt(ip: string) {
  const now = Date.now();
  await getDatabaseBinding().prepare(`INSERT INTO AuthSecurity (key, count, expiresAt) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET count = CASE WHEN expiresAt <= ? THEN 1 ELSE count + 1 END,
    expiresAt = CASE WHEN expiresAt <= ? THEN ? ELSE expiresAt END`).bind(keyFor(ip), now + WINDOW, now, now, now + WINDOW).run();
  return checkIpLockout(ip);
}

export async function resetFailedAttempts(ip: string) {
  await getDatabaseBinding().prepare('DELETE FROM AuthSecurity WHERE key = ?').bind(keyFor(ip)).run();
}

export async function isTokenRevoked(token: string) {
  const key = 'token:' + createHash('sha256').update(token).digest('hex');
  const row = await getDatabaseBinding().prepare('SELECT expiresAt FROM AuthSecurity WHERE key = ?').bind(key).first<{expiresAt: number}>();
  return !!row && row.expiresAt > Date.now();
}

export async function revokeToken(token: string, expiresAt: number) {
  const key = 'token:' + createHash('sha256').update(token).digest('hex');
  await getDatabaseBinding().prepare('INSERT OR REPLACE INTO AuthSecurity (key, count, expiresAt) VALUES (?, 0, ?)').bind(key, expiresAt).run();
  await getDatabaseBinding().prepare('DELETE FROM AuthSecurity WHERE expiresAt <= ?').bind(Date.now()).run();
}
