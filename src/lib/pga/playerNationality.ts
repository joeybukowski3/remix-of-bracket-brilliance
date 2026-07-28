export type PgaPlayerNationality = {
  countryCode: string;
  countryName: string;
};

type PgaNationalityGroup = PgaPlayerNationality & {
  players: string[];
};

const PGA_NATIONALITY_GROUPS: PgaNationalityGroup[] = [
  { countryCode: "AR", countryName: "Argentina", players: ["Alejandro Tosti", "Emiliano Grillo"] },
  { countryCode: "AT", countryName: "Austria", players: ["Sepp Straka"] },
  { countryCode: "AU", countryName: "Australia", players: ["Adam Scott", "Cam Davis", "Jason Day", "Karl Vilips", "Min Woo Lee", "Ryan Ruffels"] },
  { countryCode: "BE", countryName: "Belgium", players: ["Adrien Dumont de Chassart"] },
  { countryCode: "CA", countryName: "Canada", players: ["A.J. Ewart", "Adam Svensson", "Corey Conners", "Mackenzie Hughes", "Nick Taylor", "Sudarshan Yellamaraju", "Taylor Pendrith"] },
  { countryCode: "CN", countryName: "China", players: ["Haotong Li", "Zecheng Dou"] },
  { countryCode: "CO", countryName: "Colombia", players: ["Marcelo Rozo", "Nico Echavarria"] },
  { countryCode: "DE", countryName: "Germany", players: ["Matti Schmid", "Stephan Jaeger"] },
  { countryCode: "DK", countryName: "Denmark", players: ["Nicolai Højgaard", "Rasmus Højgaard", "Rasmus Neergaard-Petersen", "Thorbjørn Olesen"] },
  { countryCode: "FI", countryName: "Finland", players: ["Sami Valimaki"] },
  { countryCode: "FR", countryName: "France", players: ["Adrien Saddier", "Matthieu Pavon"] },
  { countryCode: "GB", countryName: "United Kingdom", players: ["Aaron Rai", "Dan Brown", "Harry Hall", "John Parry", "Jordan Smith", "Justin Rose", "Marco Penge", "Matt Fitzpatrick", "Matt Wallace", "Robert MacIntyre", "Rory McIlroy", "Tommy Fleetwood"] },
  { countryCode: "IE", countryName: "Ireland", players: ["Seamus Power", "Shane Lowry"] },
  { countryCode: "IT", countryName: "Italy", players: ["Stefano Mazzoli"] },
  { countryCode: "JP", countryName: "Japan", players: ["Hideki Matsuyama", "Keita Nakajima", "Kensei Hirata", "Ryo Hisatsune", "Takumi Kanaya"] },
  { countryCode: "KR", countryName: "South Korea", players: ["S.H. Kim", "Si Woo Kim", "Sungjae Im", "Tom Kim"] },
  { countryCode: "NO", countryName: "Norway", players: ["Kris Ventura", "Kristoffer Reitan", "Kristoffer Ventura", "Viktor Hovland"] },
  { countryCode: "NZ", countryName: "New Zealand", players: ["Ryan Fox"] },
  { countryCode: "PH", countryName: "Philippines", players: ["Justin Quiban", "Rico Hoey"] },
  { countryCode: "PR", countryName: "Puerto Rico", players: ["Rafael Campos"] },
  { countryCode: "SE", countryName: "Sweden", players: ["Alex Noren", "Jesper Svensson", "Ludvig Åberg", "Pontus Nyholm"] },
  { countryCode: "TW", countryName: "Taiwan", players: ["Kevin Yu"] },
  { countryCode: "US", countryName: "United States", players: ["Aaron Wise", "Adam Schenk", "Akshay Bhatia", "Alex Smalley", "Andrew Novak", "Andrew Putnam", "Austin Eckroat", "Austin Smotherman", "Beau Hossler", "Ben Griffin", "Ben James", "Ben Kohles", "Billy Horschel", "Brad Dalke", "Brandt Snedeker", "Brendon Todd", "Brian Campbell", "Brian Harman", "Brice Garnett", "Brooks Koepka", "Bud Cauley", "Cameron Young", "Chad Ramey", "Chandler Blanchet", "Chandler Phillips", "Charley Hoffman", "Chris Gotterup", "Chris Kirk", "Collin Morikawa", "Daniel Azallion", "Daniel Berger", "Danny Walker", "David Ford", "David Lipsky", "Davis Chatfield", "Davis Riley", "Davis Thompson", "Denny McCarthy", "Doug Ghim", "Dylan Wu", "Eric Cole", "Gary Woodland", "Gordon Sargent", "Hank Lebioda", "Harris English", "Hayden Springer", "Isaiah Salinda", "J.J. Spaun", "J.T. Poston", "Jackson Koivun", "Jackson Suber", "Jacob Bridgeman", "Jake Knapp", "Jeffrey Kang", "Jimmy Stanger", "Joe Highsmith", "Joe Hooks", "Joel Dahmen", "John VanDerLaan", "Johnny Keefer", "Jordan Spieth", "Justin Lower", "Keegan Bradley", "Keenan Huskey", "Keith Mitchell", "Kevin Roy", "Kevin Streelman", "Kurt Kitayama", "Lanto Griffin", "Lee Hodges", "Lucas Glover", "Luke Clanton", "Mac Meissner", "Mark Hubbard", "Matt Kuchar", "Matt McCarty", "Maverick McNealy", "Max Greyserman", "Max Homa", "Max McGreevy", "Michael Brennan", "Michael Kim", "Michael Thorbjornsen", "Neal Shipley", "Nick Dunlap", "Patrick Cantlay", "Patrick Fishburn", "Patrick Rodgers", "Patrick Wilkes-Krier", "Patton Kizzire", "Peter Malnati", "Pierceson Coody", "Rickie Fowler", "Ricky Castillo", "Russell Henley", "Ryan Celano", "Ryan Gerard", "Sahith Theegala", "Sam Burns", "Sam Ryder", "Sam Stevens", "Scottie Scheffler", "Steven Fisk", "Taylor Moore", "Tom Hoge", "Tony Finau", "Trace Crowe", "Vince Whaley", "Webb Simpson", "William Jennings", "William Mouw", "Wyndham Clark", "Xander Schauffele", "Zac Blair", "Zach Bauchou"] },
  { countryCode: "VE", countryName: "Venezuela", players: ["Jhonattan Vegas"] },
  { countryCode: "ZA", countryName: "South Africa", players: ["Aldrich Potgieter", "Christiaan Bezuidenhout", "Christo Lamprecht", "Erik van Rooyen", "Garrick Higgo"] },
];

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

const PLAYER_NATIONALITIES = new Map<string, PgaPlayerNationality>(
  PGA_NATIONALITY_GROUPS.flatMap(({ players, ...nationality }) =>
    players.map((player) => [normalizePgaPlayerNationalityKey(player), nationality] as const),
  ),
);

export function getPgaPlayerNationality(player: string): PgaPlayerNationality | null {
  return PLAYER_NATIONALITIES.get(normalizePgaPlayerNationalityKey(player)) ?? null;
}

export function getPgaPlayerNationalityKeys(): string[] {
  return [...PLAYER_NATIONALITIES.keys()];
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
