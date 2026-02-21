/**
 * Extract US ZIP code from an address string.
 * Matches 5-digit or 5+4 (ZIP+4) at end of string or before trailing content.
 */
export function extractZipFromAddress(address: string): string | null {
  const trimmed = address.trim();
  if (!trimmed) return null;
  // US ZIP: 5 digits, optionally -4 more. Prefer last match (zip usually at end).
  const match = trimmed.match(/\b(\d{5})(?:-\d{4})?\b/g);
  return match && match.length > 0 ? match[match.length - 1].slice(0, 5) : null;
}
