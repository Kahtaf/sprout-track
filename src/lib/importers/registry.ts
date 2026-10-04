import { ExternalImportProvider } from '@/src/types/external-import';
import { babyBuddyImportProvider } from './baby-buddy';

export const externalImportProviders: readonly ExternalImportProvider[] = [
  babyBuddyImportProvider,
  { id: 'nara', name: 'Nara Baby', description: 'Nara complete CSV export', acceptedExtensions: ['.csv'], supportsMultipleFiles: false },
  { id: 'babycare', name: 'Babycare', description: 'Recovered Babycare JSON export', acceptedExtensions: ['.json'], supportsMultipleFiles: false },
];

export function getExternalImportProvider(
  providerId: string,
): ExternalImportProvider | undefined {
  return externalImportProviders.find(
    provider => provider.id === providerId,
  );
}
