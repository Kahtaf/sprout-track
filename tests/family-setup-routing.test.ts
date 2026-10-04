import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { needsInitialFamilySetup } from '@/src/utils/family-setup-routing';

const db = vi.hoisted(() => ({ family: { findMany: vi.fn() } }));
vi.mock('@/app/api/db', () => ({ default: db }));
import { GET } from '@/app/api/family/public-list/route';

describe('completed shared PIN family root navigation', () => {
  beforeEach(() => { process.env.DEPLOYMENT_MODE = 'cloudflare'; vi.clearAllMocks(); });
  it('projects only safe fields and bypasses initial setup for completed SYSTEM seed', async () => {
    // Unexpected fields from a mocked adapter must never be forwarded publicly.
    db.family.findMany.mockResolvedValue([{ id: 'family', name: 'Synthetic', slug: 'my-family', setupStage: 3, accountId: 'private-account', securityPin: 'private-pin' }]);
    const response = await GET(new NextRequest('https://synthetic.workers.dev/api/family/public-list'));
    const body = await response.json();
    expect(body.data).toEqual([{ id: 'family', name: 'Synthetic', slug: 'my-family', setupComplete: true }]);
    expect(db.family.findMany).toHaveBeenCalledWith(expect.objectContaining({ select: { id: true, name: true, slug: true, setupStage: true } }));
    expect(needsInitialFamilySetup(body.data, false)).toBe(false);
  });
  it('preserves unfinished/empty legacy setup and existing-caretaker routing', () => {
    expect(needsInitialFamilySetup([], false)).toBe(true);
    expect(needsInitialFamilySetup([{ slug:'my-family', setupComplete:false }], false)).toBe(true);
    expect(needsInitialFamilySetup([{ slug:'my-family' }], false)).toBe(true);
    expect(needsInitialFamilySetup([{ slug:'my-family', setupComplete:false }], true)).toBe(false);
    expect(needsInitialFamilySetup([{ slug:'renamed-family' }], false)).toBe(false);
    expect(needsInitialFamilySetup([{ slug:'my-family' },{ slug:'other' }], false)).toBe(false);
  });
});
