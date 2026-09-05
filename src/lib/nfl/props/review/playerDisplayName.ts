/** Presentation-only last-name extraction for the compact mobile row. Never used for lookups/keys. */
export function lastNameOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] || fullName;
}
