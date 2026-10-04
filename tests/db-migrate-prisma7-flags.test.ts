import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

const db = vi.hoisted(() => ({ family: { findUnique: vi.fn() } }));
const shell = vi.hoisted(() => ({ exec: vi.fn(), execSync: vi.fn(), spawn: vi.fn() }));
vi.mock('@/app/api/db', () => ({ default: db }));
vi.mock('@/app/api/utils/ip-lockout', () => ({ isTokenRevoked: vi.fn(async () => false), revokeToken: vi.fn() }));
vi.mock('child_process', () => shell);
vi.mock('node:child_process', () => shell);
import { POST as migrate } from '@/app/api/database/migrate/route';
import { POST as migrateInitial } from '@/app/api/database/migrate-initial/route';

// Deployment tooling manages D1 schema. Web requests cannot spawn Prisma,
// alter deployment secrets, or silently report a migration that never ran.
describe('Cloudflare runtime migration routes', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.JWT_SECRET = 'synthetic-migration-secret'; });

  for (const [path, route] of [['migrate', migrate], ['migrate-initial', migrateInitial]] as const) {
    it(`${path} requires authentication before returning capability information`, async () => {
      const response = await route(new NextRequest(`https://synthetic.workers.dev/api/database/${path}`, { method: 'POST' }));
      expect(response.status).toBe(401);
      expect((await response.json()).error).toBe('Authentication required');
      expect(shell.exec).not.toHaveBeenCalled();
    });

    it(`${path} tells an authenticated administrator migration is unavailable without running shell commands`, async () => {
      const token = jwt.sign({ isSysAdmin: true, caretakerId: 'synthetic-admin', caretakerRole: 'ADMIN' }, process.env.JWT_SECRET!);
      const response = await route(new NextRequest(`https://synthetic.workers.dev/api/database/${path}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      }));
      expect(response.status).toBe(501);
      expect(await response.json()).toMatchObject({ success: false, code: 'FEATURE_UNAVAILABLE', error: expect.stringContaining('Cloudflare') });
      for (const command of Object.values(shell)) expect(command).not.toHaveBeenCalled();
      expect(db.family.findUnique).not.toHaveBeenCalled();
    });
  }

  it('does not allow a normal authenticated caregiver to enter the administrator migration route', async () => {
    const token = jwt.sign({ caretakerId: 'synthetic-caregiver', caretakerRole: 'USER' }, process.env.JWT_SECRET!);
    const response = await migrate(new NextRequest('https://synthetic.workers.dev/api/database/migrate', {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    }));
    expect(response.status).toBe(403);
    for (const command of Object.values(shell)) expect(command).not.toHaveBeenCalled();
  });
});
