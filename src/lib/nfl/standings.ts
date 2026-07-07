/**
 * Standings derivation from the nflverse pipeline files (PR-3).
 *
 * Inputs are the generated public/data/nfl/<season>/results.json and the
 * canonical public/data/nfl/teams.json. Pure functions — fetching lives in
 * the useNflSeasonData hook so these are easy to test with fixtures.
 *
 * Sort is a documented MVP: win% → wins → point differential → points for.
 * Full NFL playoff tiebreakers are intentionally NOT implemented yet.
 */

export type CanonicalNflTeam = {
  id: string;
  slug: string;
  abbr: string;
  nflverseAbbr: string;
  name: string;
  fullName: string;
  shortName: string;
  conference: "AFC" | "NFC";
  division: string;
  primaryColor: string;
  logoUrl: string;
  isDome: boolean;
  latitude: number;
  longitude: number;
};

export type NflDataMeta = {
  schemaVersion: string;
  generatedAt: string;
  source: string;
  season: number;
  week: number | null;
  modelVersion: string | null;
  notes: string[];
};

export type NflResultRecord = {
  gameId: string;
  season: number;
  week: number;
  seasonType: string; // REG | WC | DIV | CON | SB
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number;
  awayScore: number;
  winner: string; // abbr or "TIE"
  final: boolean;
};

export type NflGameRecord = {
  gameId: string;
  season: number;
  week: number;
  seasonType: string;
  dateUtc: string | null;
  homeTeam: string;
  awayTeam: string;
  homeAbbr: string;
  awayAbbr: string;
  status: "final" | "scheduled";
  stadium: string | null;
};

export type TeamStanding = {
  id: string;
  slug: string;
  abbr: string;
  name: string;
  conference: "AFC" | "NFC";
  division: string;
  wins: number;
  losses: number;
  ties: number;
  gamesPlayed: number;
  winPct: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  divisionRecord: string; // "W-L" or "W-L-T"
  conferenceRecord: string;
};

function formatRecord(w: number, l: number, t: number) {
  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
}

/** Derive regular-season standings for every canonical team (0-0 if no results). */
export function deriveStandings(
  results: NflResultRecord[],
  teams: CanonicalNflTeam[]
): TeamStanding[] {
  const byAbbr = new Map(teams.map((t) => [t.abbr, t]));
  const rows = new Map<string, TeamStanding>();
  for (const team of teams) {
    rows.set(team.abbr, {
      id: team.id, slug: team.slug, abbr: team.abbr, name: team.name,
      conference: team.conference, division: team.division,
      wins: 0, losses: 0, ties: 0, gamesPlayed: 0, winPct: 0,
      pointsFor: 0, pointsAgainst: 0, pointDiff: 0,
      divisionRecord: "0-0", conferenceRecord: "0-0",
    });
  }

  const divW = new Map<string, [number, number, number]>();
  const confW = new Map<string, [number, number, number]>();
  const bump = (map: Map<string, [number, number, number]>, abbr: string, idx: 0 | 1 | 2) => {
    const cur = map.get(abbr) ?? [0, 0, 0];
    cur[idx] += 1;
    map.set(abbr, cur);
  };

  for (const r of results) {
    if (r.seasonType !== "REG" || !r.final) continue; // standings = regular season only
    const home = rows.get(r.homeAbbr);
    const away = rows.get(r.awayAbbr);
    const homeTeam = byAbbr.get(r.homeAbbr);
    const awayTeam = byAbbr.get(r.awayAbbr);
    if (!home || !away || !homeTeam || !awayTeam) continue; // unknown teams are validated upstream at ingest

    home.gamesPlayed += 1; away.gamesPlayed += 1;
    home.pointsFor += r.homeScore; home.pointsAgainst += r.awayScore;
    away.pointsFor += r.awayScore; away.pointsAgainst += r.homeScore;

    const tie = r.winner === "TIE";
    const homeWon = r.winner === r.homeAbbr;
    if (tie) { home.ties += 1; away.ties += 1; }
    else if (homeWon) { home.wins += 1; away.losses += 1; }
    else { away.wins += 1; home.losses += 1; }

    const sameDiv = homeTeam.division === awayTeam.division;
    const sameConf = homeTeam.conference === awayTeam.conference;
    const mark = (map: Map<string, [number, number, number]>) => {
      if (tie) { bump(map, r.homeAbbr, 2); bump(map, r.awayAbbr, 2); }
      else if (homeWon) { bump(map, r.homeAbbr, 0); bump(map, r.awayAbbr, 1); }
      else { bump(map, r.awayAbbr, 0); bump(map, r.homeAbbr, 1); }
    };
    if (sameDiv) mark(divW);
    if (sameConf) mark(confW);
  }

  for (const row of rows.values()) {
    row.pointDiff = row.pointsFor - row.pointsAgainst;
    row.winPct = row.gamesPlayed > 0 ? (row.wins + 0.5 * row.ties) / row.gamesPlayed : 0;
    const d = divW.get(row.abbr) ?? [0, 0, 0];
    const c = confW.get(row.abbr) ?? [0, 0, 0];
    row.divisionRecord = formatRecord(d[0], d[1], d[2]);
    row.conferenceRecord = formatRecord(c[0], c[1], c[2]);
  }

  return [...rows.values()];
}

/**
 * MVP sort (documented on-page): win% → wins → point differential → points for.
 * Does NOT apply the full NFL playoff tiebreaker sequence.
 */
export function sortStandings(rows: TeamStanding[]): TeamStanding[] {
  return [...rows].sort(
    (a, b) =>
      b.winPct - a.winPct ||
      b.wins - a.wins ||
      b.pointDiff - a.pointDiff ||
      b.pointsFor - a.pointsFor ||
      a.name.localeCompare(b.name)
  );
}

export function formatStandingRecord(row: TeamStanding) {
  return formatRecord(row.wins, row.losses, row.ties);
}
