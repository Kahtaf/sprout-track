import { FILE_STORAGE_UNAVAILABLE } from './worker-capabilities';

// Workers' temporary filesystem is not durable storage. Refuse writes/deletes
// rather than create database records pointing at files that disappear.
export function encryptAndStore(_data: Buffer, _storedName: string, _subdir?: string): string {
  throw new Error(FILE_STORAGE_UNAVAILABLE);
}
export function decryptFile(_storedName: string, _subdir?: string): Buffer {
  throw new Error(FILE_STORAGE_UNAVAILABLE);
}
export function deleteEncryptedFile(_storedName: string, _subdir?: string): void {
  throw new Error(FILE_STORAGE_UNAVAILABLE);
}
export function generateStoredName(): string {
  return `${crypto.randomUUID()}.enc`;
}
