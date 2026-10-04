import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

const db = vi.hoisted(() => ({ caretaker: { findFirst: vi.fn() }, appConfig: { findFirst: vi.fn() } }));
vi.mock('@/app/api/db', () => ({ default: db }));
vi.mock('../app/api/db', () => ({ default: db }));
const state = vi.hoisted(() => ({ isTokenRevoked: vi.fn(async () => false), revokeToken: vi.fn(), checkIpLockout: vi.fn(async () => ({ locked: false, remainingTime: 0 })), resetFailedAttempts: vi.fn(), recordFailedAttempt: vi.fn() }));
vi.mock('@/app/api/utils/ip-lockout', () => state);
import { getAuthenticatedUser, verifyRefreshToken, createRefreshToken, invalidateToken } from '@/app/api/utils/auth';
import { POST as login } from '@/app/api/auth/route';
import { POST as setupToken } from '@/app/api/auth/token/route';
import { getClientInfo } from '@/app/api/utils/api-logger';

describe('private Worker authentication', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.JWT_SECRET = 'synthetic-test-secret'; process.env.ALLOW_FAMILY_SETUP = 'false'; state.isTokenRevoked.mockResolvedValue(false); });
  it('never authenticates an unsigned caretaker identity cookie', async () => {
    const req = new NextRequest('https://synthetic.workers.dev/api/baby', { headers: { cookie: 'caretakerId=known-admin-id' } });
    expect((await getAuthenticatedUser(req)).authenticated).toBe(false);
    expect(db.caretaker.findFirst).not.toHaveBeenCalled();
  });
  it('rejects setup tokens after deployment closes setup', async () => {
    const token = jwt.sign({ isSetupAuth: true, setupToken: 'synthetic' }, process.env.JWT_SECRET!);
    const req = new NextRequest('https://synthetic.workers.dev/api/baby', { headers: { Authorization: `Bearer ${token}` } });
    expect((await getAuthenticatedUser(req)).authenticated).toBe(false);
    expect((await setupToken()).status).toBe(403);
  });
  it('does not grant administrator access from an empty stored password', async () => {
    db.appConfig.findFirst.mockResolvedValue({ adminPass: '' });
    const req = new NextRequest('https://synthetic.workers.dev/api/auth', { method: 'POST', body: JSON.stringify({ adminPassword: 'admin' }) });
    expect((await login(req)).status).toBe(503);
  });
  it('rejects revoked refresh tokens across isolates and stores revocation by expiry', async () => {
    const token = createRefreshToken({ userId: 'synthetic', authType: 'SYSTEM', familyId: 'family', accountId: null });
    state.isTokenRevoked.mockResolvedValue(true);
    expect(await verifyRefreshToken(token)).toBeNull();
    await invalidateToken(token);
    expect(state.revokeToken).toHaveBeenCalledWith(token, expect.any(Number));
  });
  it('issues different refresh sessions for caregivers logging in together', () => {
    const payload = { userId: 'synthetic', authType: 'SYSTEM' as const, familyId: 'family', accountId: null };
    expect(createRefreshToken(payload)).not.toBe(createRefreshToken(payload));
  });
  it('trusts Cloudflare client IP before attacker supplied forwarded headers', () => {
    const req = new NextRequest('https://synthetic.workers.dev', { headers: { 'cf-connecting-ip': '192.0.2.1', 'x-forwarded-for': 'spoofed' } });
    expect(getClientInfo(req).ip).toBe('192.0.2.1');
  });
});
