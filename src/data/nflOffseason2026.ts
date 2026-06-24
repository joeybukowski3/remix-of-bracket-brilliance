// Selective 2026 NFL offseason snapshot compiled from public transaction reporting.
// Updated through June 23, 2026. This is not a complete roster transaction log.

export type NflCoachStatus = "Changed" | "Returning";
export type NflMoveMethod = "Free agency" | "Trade";

export type NflCoachChange = {
  abbr: string;
  headCoach2025: string;
  headCoach2026: string;
  status: NflCoachStatus;
  note: string;
};

export type NflPlayerMove = {
  player: string;
  position: string;
  from: string;
  to: string;
  method: NflMoveMethod;
};

export type NflOffseasonProfile = NflCoachChange & {
  additions: NflPlayerMove[];
  departures: NflPlayerMove[];
  verifiedAt: string;
};

export const NFL_OFFSEASON_DATA_VERIFIED_AT = "2026-06-23";

const COACH_CHANGES: Record<string, Omit<NflCoachChange, "abbr">> = {
  ari: { headCoach2025: "Jonathan Gannon", headCoach2026: "Mike LaFleur", status: "Changed", note: "LaFleur takes over after serving as the Rams' offensive coordinator." },
  atl: { headCoach2025: "Raheem Morris", headCoach2026: "Kevin Stefanski", status: "Changed", note: "Stefanski takes over after six seasons as Cleveland's head coach." },
  bal: { headCoach2025: "John Harbaugh", headCoach2026: "Jesse Minter", status: "Changed", note: "Minter takes over after coordinating the Chargers' defense." },
  buf: { headCoach2025: "Sean McDermott", headCoach2026: "Joe Brady", status: "Changed", note: "Brady was promoted from offensive coordinator." },
  car: { headCoach2025: "Dave Canales", headCoach2026: "Dave Canales", status: "Returning", note: "Canales returns for the 2026 season." },
  chi: { headCoach2025: "Ben Johnson", headCoach2026: "Ben Johnson", status: "Returning", note: "Johnson returns for the 2026 season." },
  cin: { headCoach2025: "Zac Taylor", headCoach2026: "Zac Taylor", status: "Returning", note: "Taylor returns for the 2026 season." },
  cle: { headCoach2025: "Kevin Stefanski", headCoach2026: "Todd Monken", status: "Changed", note: "Monken takes over after coordinating Baltimore's offense." },
  dal: { headCoach2025: "Brian Schottenheimer", headCoach2026: "Brian Schottenheimer", status: "Returning", note: "Schottenheimer returns for the 2026 season." },
  den: { headCoach2025: "Sean Payton", headCoach2026: "Sean Payton", status: "Returning", note: "Payton returns for the 2026 season." },
  det: { headCoach2025: "Dan Campbell", headCoach2026: "Dan Campbell", status: "Returning", note: "Campbell returns for the 2026 season." },
  gb: { headCoach2025: "Matt LaFleur", headCoach2026: "Matt LaFleur", status: "Returning", note: "LaFleur returns for the 2026 season." },
  hou: { headCoach2025: "DeMeco Ryans", headCoach2026: "DeMeco Ryans", status: "Returning", note: "Ryans returns for the 2026 season." },
  ind: { headCoach2025: "Shane Steichen", headCoach2026: "Shane Steichen", status: "Returning", note: "Steichen returns for the 2026 season." },
  jax: { headCoach2025: "Liam Coen", headCoach2026: "Liam Coen", status: "Returning", note: "Coen returns for the 2026 season." },
  kc: { headCoach2025: "Andy Reid", headCoach2026: "Andy Reid", status: "Returning", note: "Reid returns for the 2026 season." },
  lv: { headCoach2025: "Pete Carroll", headCoach2026: "Klint Kubiak", status: "Changed", note: "Kubiak takes over after coordinating Seattle's offense." },
  lac: { headCoach2025: "Jim Harbaugh", headCoach2026: "Jim Harbaugh", status: "Returning", note: "Harbaugh returns for the 2026 season." },
  lar: { headCoach2025: "Sean McVay", headCoach2026: "Sean McVay", status: "Returning", note: "McVay returns for the 2026 season." },
  mia: { headCoach2025: "Mike McDaniel", headCoach2026: "Jeff Hafley", status: "Changed", note: "Hafley takes over after coordinating Green Bay's defense." },
  min: { headCoach2025: "Kevin O'Connell", headCoach2026: "Kevin O'Connell", status: "Returning", note: "O'Connell returns for the 2026 season." },
  ne: { headCoach2025: "Mike Vrabel", headCoach2026: "Mike Vrabel", status: "Returning", note: "Vrabel returns for the 2026 season." },
  no: { headCoach2025: "Kellen Moore", headCoach2026: "Kellen Moore", status: "Returning", note: "Moore returns for the 2026 season." },
  nyg: { headCoach2025: "Brian Daboll / Mike Kafka (interim)", headCoach2026: "John Harbaugh", status: "Changed", note: "Harbaugh takes over after 18 seasons leading Baltimore." },
  nyj: { headCoach2025: "Aaron Glenn", headCoach2026: "Aaron Glenn", status: "Returning", note: "Glenn returns for the 2026 season." },
  phi: { headCoach2025: "Nick Sirianni", headCoach2026: "Nick Sirianni", status: "Returning", note: "Sirianni returns for the 2026 season." },
  pit: { headCoach2025: "Mike Tomlin", headCoach2026: "Mike McCarthy", status: "Changed", note: "McCarthy takes over after Tomlin's departure." },
  sf: { headCoach2025: "Kyle Shanahan", headCoach2026: "Kyle Shanahan", status: "Returning", note: "Shanahan returns for the 2026 season." },
  sea: { headCoach2025: "Mike Macdonald", headCoach2026: "Mike Macdonald", status: "Returning", note: "Macdonald returns for the 2026 season." },
  tb: { headCoach2025: "Todd Bowles", headCoach2026: "Todd Bowles", status: "Returning", note: "Bowles returns for the 2026 season." },
  ten: { headCoach2025: "Brian Callahan / Mike McCoy (interim)", headCoach2026: "Robert Saleh", status: "Changed", note: "Saleh takes over after serving as San Francisco's defensive coordinator." },
  wsh: { headCoach2025: "Dan Quinn", headCoach2026: "Dan Quinn", status: "Returning", note: "Quinn returns for the 2026 season." },
};

export const NFL_NOTABLE_PLAYER_MOVES: NflPlayerMove[] = [
  { player: "Kyler Murray", position: "QB", from: "ari", to: "min", method: "Free agency" },
  { player: "Tua Tagovailoa", position: "QB", from: "mia", to: "atl", method: "Free agency" },
  { player: "Malik Willis", position: "QB", from: "gb", to: "mia", method: "Free agency" },
  { player: "Geno Smith", position: "QB", from: "lv", to: "nyj", method: "Trade" },
  { player: "Kenneth Walker III", position: "RB", from: "sea", to: "kc", method: "Free agency" },
  { player: "Mike Evans", position: "WR", from: "tb", to: "sf", method: "Free agency" },
  { player: "Romeo Doubs", position: "WR", from: "gb", to: "ne", method: "Free agency" },
  { player: "Jaylen Waddle", position: "WR", from: "mia", to: "den", method: "Trade" },
  { player: "D. J. Moore", position: "WR", from: "chi", to: "buf", method: "Trade" },
  { player: "A. J. Brown", position: "WR", from: "phi", to: "ne", method: "Trade" },
  { player: "Trey Hendrickson", position: "EDGE", from: "cin", to: "bal", method: "Free agency" },
  { player: "Minkah Fitzpatrick", position: "S", from: "mia", to: "nyj", method: "Trade" },
  { player: "Trent McDuffie", position: "CB", from: "kc", to: "lar", method: "Trade" },
  { player: "Myles Garrett", position: "EDGE", from: "cle", to: "lar", method: "Trade" },
  { player: "Jared Verse", position: "EDGE", from: "lar", to: "cle", method: "Trade" },
  { player: "Dexter Lawrence II", position: "DT", from: "nyg", to: "cin", method: "Trade" },
];

export function getNflOffseasonProfile(abbr: string): NflOffseasonProfile {
  const key = abbr.toLowerCase();
  const coach = COACH_CHANGES[key] ?? {
    headCoach2025: "Not available",
    headCoach2026: "Not available",
    status: "Returning" as const,
    note: "Coaching information has not been verified.",
  };

  return {
    abbr: key,
    ...coach,
    additions: NFL_NOTABLE_PLAYER_MOVES.filter((move) => move.to === key),
    departures: NFL_NOTABLE_PLAYER_MOVES.filter((move) => move.from === key),
    verifiedAt: NFL_OFFSEASON_DATA_VERIFIED_AT,
  };
}

export const NFL_OFFSEASON_TEAM_COUNT = Object.keys(COACH_CHANGES).length;
