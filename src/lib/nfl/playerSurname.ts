// Presentation-only surname extraction (mobile compact identity columns).
//
// Never used for identity resolution, lookups or keys -- purely for showing a
// short label when horizontal space is tight. Strips recognized generational
// suffixes and returns the true surname token, preserving hyphenated and
// apostrophe surnames (which are single whitespace-delimited tokens).

const NAME_SUFFIXES: ReadonlySet<string> = new Set([
  "jr", "jr.", "jnr", "sr", "sr.", "snr", "ii", "iii", "iv", "v",
]);

/** Normalize a token for suffix comparison: lowercase, drop a trailing comma. */
function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/,+$/, "");
}

/**
 * Returns the surname token of a full name.
 *
 * - "Justin Herbert" -> "Herbert"
 * - "Marvin Harrison Jr." -> "Harrison"
 * - "Robert Griffin III" -> "Griffin"
 * - "Amon-Ra St. Brown" -> "St. Brown" is a two-token surname; this returns
 *   "Brown" (the last non-suffix token). Multi-token surnames are a known
 *   limitation of a whitespace tokenizer.
 * - Hyphenated ("Michael Pittman-Jones") and apostrophe ("Ka'imi O'Brien")
 *   surnames are single tokens and are returned intact.
 */
export function playerSurname(fullName: string): string {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return trimmed;

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0];

  let index = parts.length - 1;
  while (index > 0 && NAME_SUFFIXES.has(normalizeToken(parts[index]))) {
    index -= 1;
  }
  return parts[index] || trimmed;
}
