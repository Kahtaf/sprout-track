import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { processPhoto } from '@/app/api/photos/photo-processing';
import { encryptAndStore, decryptFile, deleteEncryptedFile, generateStoredName } from '@/src/lib/file-encryption';
import { FILE_STORAGE_UNAVAILABLE } from '@/src/lib/worker-capabilities';

// A Worker filesystem is ephemeral: accepting these uploads would create
// history records whose attachments disappear between requests.
describe('Cloudflare deployment without durable attachment storage', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])(
    'refuses %s processing instead of returning an apparently saved attachment', async (mime) => {
      const write = vi.spyOn(fs, 'writeFileSync');
      await expect(processPhoto(Buffer.from('synthetic-image'), mime)).rejects.toThrow(FILE_STORAGE_UNAVAILABLE);
      expect(write).not.toHaveBeenCalled();
    },
  );

  it('refuses encrypted file operations before any filesystem mutation', () => {
    const write = vi.spyOn(fs, 'writeFileSync');
    const unlink = vi.spyOn(fs, 'unlinkSync');
    const mkdir = vi.spyOn(fs, 'mkdirSync');
    expect(() => encryptAndStore(Buffer.from('synthetic'), 'synthetic.enc')).toThrow(FILE_STORAGE_UNAVAILABLE);
    expect(() => decryptFile('synthetic.enc')).toThrow(FILE_STORAGE_UNAVAILABLE);
    expect(() => deleteEncryptedFile('synthetic.enc')).toThrow(FILE_STORAGE_UNAVAILABLE);
    expect(write).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
    expect(mkdir).not.toHaveBeenCalled();
  });

  it('generates unique opaque names without using persistent storage', () => {
    const first = generateStoredName();
    expect(first).toMatch(/^[0-9a-f-]{36}\.enc$/);
    expect(generateStoredName()).not.toBe(first);
  });
});
