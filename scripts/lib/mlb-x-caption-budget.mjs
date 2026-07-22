/**
 * Shared 280-character budget fitting for the MLB X captions.
 *
 * Not a new caption system: the caption TEXT still lives in
 * mlb-k-caption-core.mjs and mlb-x-artifact-caption.mjs. This module only
 * decides how many picks fit and in what form, so both cores reduce
 * identically instead of each inventing its own truncation rules.
 *
 * The old behavior hard-failed the whole post once the caption exceeded 280 --
 * measurably at four or more K rows. A six-row edition therefore could not
 * publish at all. Here a caption that does not fit is reduced, never skipped:
 * the attached graphic remains the complete visual card, so the caption only
 * has to carry the largest balanced, unambiguous subset.
 */

export const X_CHARACTER_LIMIT = 280;

/** Edition status wording. Fixed strings -- a poster may not phrase its own. */
export const EditionSentence = Object.freeze({
  morning: "Morning model card — check confirmed lineups before betting.",
  confirmed: "Updated with confirmed lineups.",
  pregame_fallback: "Pregame update using the latest available lineups.",
});

export function editionSentenceFor(languageMode) {
  const sentence = EditionSentence[languageMode];
  if (!sentence) throw new Error(`Unknown languageMode "${languageMode}".`);
  return sentence;
}

/**
 * X's weighted character count, not String.length.
 *
 * Every URL is billed at 23 characters regardless of its real length (t.co
 * wrapping), and CJK codepoints cost 2. Measuring with String.length would
 * under-count a long canonical link and let a caption ship that X rejects.
 */
const URL_PATTERN = /\bhttps?:\/\/\S+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/gi;
const T_CO_WEIGHT = 23;

export function weightedLength(text) {
  if (!text) return 0;
  let total = 0;
  let cursor = 0;
  URL_PATTERN.lastIndex = 0;
  for (const match of String(text).matchAll(URL_PATTERN)) {
    total += weighNonUrl(String(text).slice(cursor, match.index));
    total += T_CO_WEIGHT;
    cursor = match.index + match[0].length;
  }
  total += weighNonUrl(String(text).slice(cursor));
  return total;
}

function weighNonUrl(segment) {
  let total = 0;
  for (const character of segment) {
    const code = character.codePointAt(0);
    // CJK / fullwidth ranges bill as 2 on X.
    const wide = (code >= 0x1100 && code <= 0x115f) || (code >= 0x2e80 && code <= 0xa4cf)
      || (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff)
      || (code >= 0xfe30 && code <= 0xfe6f) || (code >= 0xff00 && code <= 0xff60)
      || (code >= 0xffe0 && code <= 0xffe6);
    total += wide ? 2 : 1;
  }
  return total;
}

export function fitsBudget(text, limit = X_CHARACTER_LIMIT) {
  return weightedLength(text) <= limit;
}

/**
 * Candidate (a, b) group sizes in preference order.
 *
 * Largest total first; among equal totals, prefer keeping BOTH categories
 * represented, then the most balanced split. That yields 3+3, then 3+2 / 2+3,
 * then 2+2, and only collapses to a single category when one side is empty or
 * nothing else fits.
 */
export function candidateSplits(countA, countB, maxPerGroup = 3) {
  const maxA = Math.min(maxPerGroup, Math.max(0, countA));
  const maxB = Math.min(maxPerGroup, Math.max(0, countB));
  const candidates = [];
  for (let a = maxA; a >= 0; a -= 1) {
    for (let b = maxB; b >= 0; b -= 1) {
      if (a + b > 0) candidates.push({ a, b });
    }
  }
  candidates.sort((x, y) => {
    const byTotal = (y.a + y.b) - (x.a + x.b);
    if (byTotal !== 0) return byTotal;
    const bothX = x.a > 0 && x.b > 0 ? 0 : 1;
    const bothY = y.a > 0 && y.b > 0 ? 0 : 1;
    if (bothX !== bothY) return bothX - bothY;
    return Math.abs(x.a - x.b) - Math.abs(y.a - y.b);
  });
  return candidates;
}

/**
 * Picks the largest caption that fits.
 *
 * @param {object} params
 * @param {object[]} params.groupA first category rows, already ranked
 * @param {object[]} params.groupB second category rows, already ranked
 * @param {Function} params.render ({ rowsA, rowsB, variant }) -> string
 * @param {any[]}    [params.variants] richest-to-leanest formatting variants
 * @returns {{ ok, caption, rowsA, rowsB, variant, includedCount, omittedCount, diagnostics }}
 */
export function fitCaption({ groupA = [], groupB = [], render, variants = [null], limit = X_CHARACTER_LIMIT, maxPerGroup = 3 }) {
  const attempted = [];
  // Largest split first, and within a split the richest formatting that fits,
  // so picks are preserved ahead of decoration.
  for (const { a, b } of candidateSplits(groupA.length, groupB.length, maxPerGroup)) {
    const rowsA = groupA.slice(0, a);
    const rowsB = groupB.slice(0, b);
    for (const variant of variants) {
      const caption = render({ rowsA, rowsB, variant });
      const length = weightedLength(caption);
      attempted.push({ a, b, variant, length });
      if (length <= limit) {
        const totalAvailable = groupA.length + groupB.length;
        const includedCount = rowsA.length + rowsB.length;
        return {
          ok: true,
          caption,
          rowsA,
          rowsB,
          variant,
          includedCount,
          omittedCount: totalAvailable - includedCount,
          diagnostics: {
            weightedLength: length,
            includedA: rowsA.length,
            includedB: rowsB.length,
            availableA: groupA.length,
            availableB: groupB.length,
            omittedA: groupA.length - rowsA.length,
            omittedB: groupB.length - rowsB.length,
            attempts: attempted.length,
          },
        };
      }
    }
  }
  // Only reachable when even one pick in the leanest form cannot fit beside
  // the required elements -- a genuine data problem, not a length problem.
  return {
    ok: false,
    caption: "",
    rowsA: [],
    rowsB: [],
    variant: null,
    includedCount: 0,
    omittedCount: groupA.length + groupB.length,
    diagnostics: { weightedLength: attempted.at(-1)?.length ?? 0, attempts: attempted.length, availableA: groupA.length, availableB: groupB.length },
  };
}

/** "Sandy Alcantara" -> "S. Alcantara". Never collapses to bare initials. */
export function compactPlayerName(fullName) {
  const parts = String(fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "";
  const last = parts.at(-1);
  const first = parts[0];
  return `${first[0]}. ${last}`;
}
