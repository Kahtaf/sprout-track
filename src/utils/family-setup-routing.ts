/** Public projection for root navigation; credentials and household details stay private. */
export interface FamilySetupRoute {
  slug: string;
  setupComplete?: boolean;
}

export function needsInitialFamilySetup(families: FamilySetupRoute[], hasCaretakers: boolean): boolean {
  if (families.length === 0) return true;
  const family = families[0];
  // A completed SYSTEM family legitimately has no non-system caretakers.
  // Preserve the upstream unfinished-default-family detection for legacy seeds.
  return families.length === 1 && family.slug === 'my-family' &&
    !(family.setupComplete === true || hasCaretakers);
}
