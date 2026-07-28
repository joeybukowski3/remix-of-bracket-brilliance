export type PgaPlayerNationality = {
  countryCode: string;
  countryName: string;
};

const PLAYER_NATIONALITIES: Record<string, PgaPlayerNationality> = {
  adamsvensson: { countryCode: "CA", countryName: "Canada" },
  adriendumontdechassart: { countryCode: "BE", countryName: "Belgium" },
  adriensaddier: { countryCode: "FR", countryName: "France" },
  aldrichpotgieter: { countryCode: "ZA", countryName: "South Africa" },
  alejandrotosti: { countryCode: "AR", countryName: "Argentina" },
  brookskoepka: { countryCode: "US", countryName: "United States" },
  camdavis: { countryCode: "AU", countryName: "Australia" },
  christiaanbezuidenhout: { countryCode: "ZA", countryName: "South Africa" },
  christolamprecht: { countryCode: "ZA", countryName: "South Africa" },
  coreyconners: { countryCode: "CA", countryName: "Canada" },
  emilianogrillo: { countryCode: "AR", countryName: "Argentina" },
  erikvanrooyen: { countryCode: "ZA", countryName: "South Africa" },
  garrickhiggo: { countryCode: "ZA", countryName: "South Africa" },
  haotongli: { countryCode: "CN", countryName: "China" },
  harryhall: { countryCode: "GB", countryName: "United Kingdom" },
  hidekimatsuyama: { countryCode: "JP", countryName: "Japan" },
  jespersvensson: { countryCode: "SE", countryName: "Sweden" },
  johnparry: { countryCode: "GB", countryName: "United Kingdom" },
  jordansmith: { countryCode: "GB", countryName: "United Kingdom" },
  justinquiban: { countryCode: "PH", countryName: "Philippines" },
  karlvilips: { countryCode: "AU", countryName: "Australia" },
  keitanakajima: { countryCode: "JP", countryName: "Japan" },
  kenseihirata: { countryCode: "JP", countryName: "Japan" },
  kevinyu: { countryCode: "TW", countryName: "Taiwan" },
  kristofferventura: { countryCode: "NO", countryName: "Norway" },
  mackenziehughes: { countryCode: "CA", countryName: "Canada" },
  marcelorozo: { countryCode: "CO", countryName: "Colombia" },
  marcopenge: { countryCode: "GB", countryName: "United Kingdom" },
  mattwallace: { countryCode: "GB", countryName: "United Kingdom" },
  matthieupavon: { countryCode: "FR", countryName: "France" },
  mattischmid: { countryCode: "DE", countryName: "Germany" },
  nicktaylor: { countryCode: "CA", countryName: "Canada" },
  nicoechavarria: { countryCode: "CO", countryName: "Colombia" },
  nicolaihojgaard: { countryCode: "DK", countryName: "Denmark" },
  pontusnyholm: { countryCode: "SE", countryName: "Sweden" },
  rafaelcampos: { countryCode: "PR", countryName: "Puerto Rico" },
  rasmushojgaard: { countryCode: "DK", countryName: "Denmark" },
  rasmusneergaardpetersen: { countryCode: "DK", countryName: "Denmark" },
  ricohoey: { countryCode: "PH", countryName: "Philippines" },
  ryanruffels: { countryCode: "AU", countryName: "Australia" },
  ryohisatsune: { countryCode: "JP", countryName: "Japan" },
  seamuspower: { countryCode: "IE", countryName: "Ireland" },
  siwookim: { countryCode: "KR", countryName: "South Korea" },
  stefanomazzoli: { countryCode: "IT", countryName: "Italy" },
  stephanjaeger: { countryCode: "DE", countryName: "Germany" },
  sudarshanyellamaraju: { countryCode: "CA", countryName: "Canada" },
  sungjaeim: { countryCode: "KR", countryName: "South Korea" },
  takumikanaya: { countryCode: "JP", countryName: "Japan" },
  taylorpendrith: { countryCode: "CA", countryName: "Canada" },
  thorbjornolesen: { countryCode: "DK", countryName: "Denmark" },
  xanderschauffele: { countryCode: "US", countryName: "United States" },
  zechengdou: { countryCode: "CN", countryName: "China" },
};

const SPECIAL_LATIN_REPLACEMENTS: Record<string, string> = {
  æ: "ae",
  ð: "d",
  ł: "l",
  ø: "o",
  œ: "oe",
  ß: "ss",
  þ: "th",
};

const TWEMOJI_ASSET_BASE = "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg";

export function normalizePgaPlayerNationalityKey(player: string): string {
  return player
    .normalize("NFKD")
    .replace(/[æðłøœßþ]/gi, (character) => SPECIAL_LATIN_REPLACEMENTS[character.toLowerCase()] ?? character)
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function getPgaPlayerNationality(player: string): PgaPlayerNationality | null {
  return PLAYER_NATIONALITIES[normalizePgaPlayerNationalityKey(player)] ?? null;
}

export function countryCodeToFlag(countryCode: string): string | null {
  const normalized = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return null;
  return normalized.replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

/**
 * Twemoji image URL for a Unicode flag sequence. This avoids Windows rendering
 * regional-indicator pairs as visible two-letter codes instead of a flag.
 */
export function countryCodeToFlagEmojiUrl(countryCode: string): string | null {
  const flag = countryCodeToFlag(countryCode);
  if (!flag) return null;
  const codePoints = Array.from(flag)
    .map((character) => character.codePointAt(0)?.toString(16))
    .filter((value): value is string => Boolean(value));
  if (codePoints.length !== 2) return null;
  return `${TWEMOJI_ASSET_BASE}/${codePoints.join("-")}.svg`;
}
