import { FILE_STORAGE_UNAVAILABLE } from '@/src/lib/worker-capabilities';

export interface ProcessedPhoto {
  display: { data: Buffer; mimeType: string };
  thumbnail: { data: Buffer; mimeType: string };
  exifTakenAt: Date | null;
}
export async function processPhoto(_buffer: Buffer, _mimeType: string): Promise<ProcessedPhoto> {
  throw new Error(FILE_STORAGE_UNAVAILABLE);
}
