import { describe, expect, it } from 'vitest';
import { normalizePinEntry } from '@/src/utils/pin-entry';

describe('native family PIN entry', () => {
  it('accepts a copied ten-digit PIN, preserves zeros, and enforces digit limits', () => {
    expect(normalizePinEntry('0012345678')).toBe('0012345678');
    expect(normalizePinEntry(' 0012345678\n')).toBe('0012345678');
    expect(normalizePinEntry('12a34!?5678901')).toBe('1234567890');
    expect(normalizePinEntry('01',2)).toBe('01');
    expect(normalizePinEntry('')).toBe('');
  });
});
