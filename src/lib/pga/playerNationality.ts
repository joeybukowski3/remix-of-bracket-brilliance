import { normalizePlayerKey } from "@/lib/pga/historyModel";

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
  jespernsvensson: { countryCode: "SE", countryName: "Sweden" },
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

export function getPgaPlayerNationality(player: string): PgaPlayerNationality | null {
  return PLAYER_NATIONALITIES[normalizePlayerKey(player)] ?? null;
}

export function countryCodeToFlag(countryCode: string): string | null {
  const normalized = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return null;
  return normalized.replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}
