import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

const db = vi.hoisted(() => ({
  family: { findUnique: vi.fn() },
  photo: { findFirst: vi.fn(), update: vi.fn() },
  photoLog: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
  photoLink: { deleteMany: vi.fn(), createMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('@/app/api/db', () => ({ default: db }));
vi.mock('@/app/api/utils/ip-lockout', () => ({ isTokenRevoked: vi.fn(async () => false), revokeToken: vi.fn() }));
import * as logs from '@/app/api/photo-log/route';
import * as photos from '@/app/api/photos/[id]/route';

const routes = [
  ['GET', '/api/photo-log?id=synthetic', logs.GET],
  ['POST', '/api/photo-log', logs.POST],
  ['PUT', '/api/photo-log?id=synthetic', logs.PUT],
  ['DELETE', '/api/photo-log?id=synthetic', logs.DELETE],
  ['PATCH', '/api/photos/synthetic', photos.PATCH],
  ['DELETE', '/api/photos/synthetic', photos.DELETE],
] as const;

describe('disabled durable-photo routes preserve metadata', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.JWT_SECRET = 'synthetic-photo-secret'; db.family.findUnique.mockResolvedValue({ id: 'own-family', account: null }); });

  for (const [method, path, route] of routes) {
    it(`${method} ${path} requires signed authentication`, async () => {
      const response = await route(new NextRequest(`https://synthetic.workers.dev${path}`, { method, headers: { cookie: 'caretakerId=synthetic-owner' } }));
      expect(response.status).toBe(401);
      expect(db.$transaction).not.toHaveBeenCalled();
      expect(db.photo.update).not.toHaveBeenCalled();
      expect(db.photoLog.update).not.toHaveBeenCalled();
    });

    it(`${method} ${path} returns explicit 501 to an authenticated family caregiver without mutating records or links`, async () => {
      const token = jwt.sign({ caretakerId: 'synthetic-owner', caretakerRole: 'ADMIN', familyId: 'own-family' }, process.env.JWT_SECRET!);
      // A body naming another family cannot enable this feature or mutate its data.
      const request = new NextRequest(`https://synthetic.workers.dev${path}`, {
        method, headers: { Authorization: `Bearer ${token}` },
        ...(method !== 'GET' && { body: JSON.stringify({ familyId: 'other-family', photoIds: ['foreign-photo'] }) }),
      });
      const response = await route(request);
      expect(response.status).toBe(501);
      expect(await response.json()).toMatchObject({ success: false, code: 'FEATURE_UNAVAILABLE', error: expect.stringContaining('storage is not configured') });
      expect(db.family.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'own-family' } }));
      expect(db.$transaction).not.toHaveBeenCalled();
      for (const model of [db.photo, db.photoLog, db.photoLink]) {
        for (const operation of Object.values(model)) expect(operation).not.toHaveBeenCalled();
      }
    });
  }
});
