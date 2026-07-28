export const X_CHARACTER_LIMIT = 280;

export const EditionSentence = Object.freeze({
  morning: "Lineups not confirmed. Odds may not yet be available.",
  morning_catch_up: "Lineups not confirmed. Odds may not yet be available.",
  confirmed: "Updated with confirmed lineups and current market value.",
  pregame_fallback: "Pregame update using the latest available confirmed lineups.",
});

export function editionSentenceFor(languageMode) {
  const sentence = EditionSentence[languageMode];
  if (!sentence) throw new Error(`Unknown languageMode "${languageMode}".`);
  return sentence;
}

const URL_PATTERN = /\bhttps?:\/\/\S+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/gi;
const T_CO_WEIGHT = 23;

function weighNonUrl(segment) {
  let total = 0;
  for (const character of segment) {
    const code = character.codePointAt(0);
    const wide = (code >= 0x1100 && code <= 0x115f) || (code >= 0x2e80 && code <= 0xa4cf)
      || (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff)
      || (code >= 0xfe30 && code <= 0xfe6f) || (code >= 0xff00 && code <= 0xff60)
      || (code >= 0xffe0 && code <= 0xffe6);
    total += wide ? 2 : 1;
  }
  return total;
}

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
  return total + weighNonUrl(String(text).slice(cursor));
}

export function fitsBudget(text, limit = X_CHARACTER_LIMIT) {
  return weightedLength(text) <= limit;
}

export function candidateSplits(countA, countB, maxPerGroup = 3) {
  const maxA = Math.min(maxPerGroup, Math.max(0, countA));
  const maxB = Math.min(maxPerGroup, Math.max(0, countB));
  const candidates = [];
  for (let a = maxA; a >= 0; a -= 1) {
    for (let b = maxB; b >= 0; b -= 1) {
      if (a + b > 0) candidates.push({ a, b });
    }
  }
  candidates.sort((left, right) => {
    const total = (right.a + right.b) - (left.a + left.b);
    if (total !== 0) return total;
    const leftSingle = left.a > 0 && left.b > 0 ? 0 : 1;
    const rightSingle = right.a > 0 && right.b > 0 ? 0 : 1;
    if (leftSingle !== rightSingle) return leftSingle - rightSingle;
    return Math.abs(left.a - left.b) - Math.abs(right.a - right.b);
  });
  return candidates;
}

export function fitCaption({ groupA = [], groupB = [], render, variants = [null], limit = X_CHARACTER_LIMIT, maxPerGroup = 3 }) {
  const attempted = [];
  for (const { a, b } of candidateSplits(groupA.length, groupB.length, maxPerGroup)) {
    const rowsA = groupA.slice(0, a);
    const rowsB = groupB.slice(0, b);
    for (const variant of variants) {
      const caption = render({ rowsA, rowsB, variant });
      const length = weightedLength(caption);
      attempted.push({ a, b, variant, length });
      if (length <= limit) {
        return {
          ok: true,
          caption,
          rowsA,
          rowsB,
          variant,
          includedCount: rowsA.length + rowsB.length,
          omittedCount: groupA.length + groupB.length - rowsA.length - rowsB.length,
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

export function compactPlayerName(fullName) {
  const parts = String(fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts[0][0]}. ${parts.at(-1)}`;
}
