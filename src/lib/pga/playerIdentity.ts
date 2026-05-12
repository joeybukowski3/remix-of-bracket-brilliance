export type PgaPlayerMatchMethod = "exact" | "canonical" | "alias" | "fuzzy" | "none";

export type PgaPlayerRecord = {
  player: string;
};

export type PgaPlayerLookup<T extends PgaPlayerRecord> = {
  byExact: Map<string, T>;
  byNormalized: Map<string, T[]>;
};

export type PgaPlayerMatchResult<T extends PgaPlayerRecord> = {
  input: string;
  exactKey: string;
  canonicalKey: string;
  candidateKeys: string[];
  method: PgaPlayerMatchMethod;
  matchedPlayer: T | null;
  matchedKey: string | null;
};

const PLAYER_NAME_ALIASES: Record<string, string[]> = {
  "matthew mccarty": ["matt mccarty"],
  "jordan l smith": ["jordan smith"],
  "nicolas echavarria": ["nico echavarria"],
  "john keefer": ["johnny keefer"],
};

const SUFFIX_PATTERN = /\b(jr|sr|ii|iii|iv|v)\b/g;
const SPACE_PATTERN = /\s+/g;
const NON_ALNUM_PATTERN = /[^a-z0-9]+/g;
const COMBINING_MARKS_PATTERN = /[\u0300-\u036f]/g;

const CHARACTER_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\u00c6/g, "AE"],
  [/\u00e6/g, "ae"],
  [/\u00d8/g, "O"],
  [/\u00f8/g, "o"],
  [/\u00c5/g, "A"],
  [/\u00e5/g, "a"],
  [/\u00d6/g, "O"],
  [/\u00f6/g, "o"],
  [/\u00c4/g, "A"],
  [/\u00e4/g, "a"],
  [/\u00dc/g, "U"],
  [/\u00fc/g, "u"],
  [/\u0152/g, "OE"],
  [/\u0153/g, "oe"],
];

function normalizeWhitespace(value: string) {
  return value.replace(/\u00a0/g, " ").replace(SPACE_PATTERN, " ").trim();
}

function swapLastFirstName(value: string) {
  if (!value.includes(",")) return value;

  const [lastName, ...rest] = value.split(",");
  const firstName = rest.join(",").trim();
  const trimmedLastName = lastName.trim();

  if (!firstName || !trimmedLastName) {
    return value;
  }

  return `${firstName} ${trimmedLastName}`;
}

function stripDiacritics(value: string) {
  let text = value;

  CHARACTER_REPLACEMENTS.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });

  return text.normalize("NFKD").replace(COMBINING_MARKS_PATTERN, "");
}

function stripSuffixTokens(value: string) {
  return value.replace(SUFFIX_PATTERN, " ");
}

export function normalizePgaPlayerExactName(value: string) {
  return normalizeWhitespace(value).toLowerCase();
}

export function normalizePgaPlayerName(value: string) {
  const reordered = swapLastFirstName(normalizeWhitespace(value));
  const stripped = stripDiacritics(reordered).toLowerCase().replace(/&/g, " and ");
  const punctuationNormalized = stripped
    .replace(/[.'\u2019`]/g, " ")
    .replace(/[-_]/g, " ")
    .replace(/\//g, " ");

  return normalizeWhitespace(stripSuffixTokens(punctuationNormalized).replace(NON_ALNUM_PATTERN, " "));
}

export function normalizePgaPlayerCompactName(value: string) {
  return normalizePgaPlayerName(value).replace(SPACE_PATTERN, "");
}

export function getPgaPlayerNameCandidates(value: string) {
  const normalized = normalizePgaPlayerName(value);
  const candidates = new Set<string>();

  const addCandidate = (candidate: string) => {
    const compactCandidate = normalizePgaPlayerCompactName(candidate);
    if (candidate) candidates.add(candidate);
    if (compactCandidate) candidates.add(compactCandidate);
  };

  if (normalized) {
    addCandidate(normalized);
    const aliases = PLAYER_NAME_ALIASES[normalized] ?? [];
    aliases.forEach(addCandidate);
  }

  return Array.from(candidates);
}

export function buildPgaPlayerLookup<T extends PgaPlayerRecord>(players: readonly T[]): PgaPlayerLookup<T> {
  const byExact = new Map<string, T>();
  const byNormalized = new Map<string, T[]>();

  players.forEach((player) => {
    const exactKey = normalizePgaPlayerExactName(player.player);
    if (exactKey && !byExact.has(exactKey)) {
      byExact.set(exactKey, player);
    }

    const normalizedKeys = [normalizePgaPlayerName(player.player), normalizePgaPlayerCompactName(player.player)];
    normalizedKeys.forEach((key) => {
      if (!key) return;
      const existing = byNormalized.get(key) ?? [];
      existing.push(player);
      byNormalized.set(key, existing);
    });
  });

  return { byExact, byNormalized };
}

export function resolvePgaPlayerMatch<T extends PgaPlayerRecord>(value: string, lookup: PgaPlayerLookup<T>): PgaPlayerMatchResult<T> {
  const exactKey = normalizePgaPlayerExactName(value);
  const exactMatch = lookup.byExact.get(exactKey) ?? null;
  if (exactMatch) {
    return {
      input: value,
      exactKey,
      canonicalKey: normalizePgaPlayerName(value),
      candidateKeys: getPgaPlayerNameCandidates(value),
      method: "exact",
      matchedPlayer: exactMatch,
      matchedKey: exactKey,
    };
  }

  const canonicalKey = normalizePgaPlayerName(value);
  const candidateKeys = getPgaPlayerNameCandidates(value);

  for (const candidateKey of candidateKeys) {
    const matches = lookup.byNormalized.get(candidateKey) ?? [];
    if (matches.length === 1) {
      return {
        input: value,
        exactKey,
        canonicalKey,
        candidateKeys,
        method: candidateKey === canonicalKey ? "canonical" : "alias",
        matchedPlayer: matches[0] ?? null,
        matchedKey: candidateKey,
      };
    }
  }

  return {
    input: value,
    exactKey,
    canonicalKey,
    candidateKeys,
    method: "none",
    matchedPlayer: null,
    matchedKey: null,
  };
}
