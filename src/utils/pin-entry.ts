/** Native keyboard, paste and password-manager entry share the same digit limits. */
export function normalizePinEntry(value: string, maxLength = 10): string {
  return value.replace(/[^0-9]/g, '').slice(0, maxLength);
}
