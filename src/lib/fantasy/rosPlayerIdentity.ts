import parConsensusSource from "../../../data/fantasy/2026-par-consensus.json";
import type { FantasyParSourceRow } from "@/lib/fantasy/parRankings";
import type { FantasyPosition, FantasyRankingRow } from "@/lib/fantasy/rankings";

export function normalizedFantasyPlayerKey(position: FantasyPosition, player: string): string {
  const normalized = player
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return `${position}:${normalized}`;
}

/** Exact reviewed JKB workbook name -> PAR consensus name differences. */
const CONSENSUS_NAME_ALIASES: Readonly<Record<string, string>> = {
  "QB:patrickmahomes": "Patrick Mahomes II",
  "RB:jamescook": "James Cook III",
  "RB:kennethwalker": "Ken Walker III",
  "RB:travisetienne": "Travis Etienne Jr.",
  "RB:kennethgainwell": "Kenny Gainwell",
  "RB:aaronjones": "Aaron Jones Sr.",
  "RB:tyronetracy": "Tyrone Tracy Jr.",
  "RB:brianrobinson": "Brian Robinson Jr.",
  "RB:lequintallen": "LeQuint Allen Jr.",
  "RB:mikewashington": "Mike Washington Jr.",
  "RB:olliegordon": "Ollie Gordon II",
  "WR:lutherburden": "Luther Burden III",
  "WR:michaelpittman": "Michael Pittman Jr.",
  "WR:chrisgodwin": "Chris Godwin Jr.",
  "WR:kevinconcepcion": "KC Concepcion",
  "WR:deebosamuel": "Deebo Samuel Sr.",
  "WR:marvinmims": "Marvin Mims Jr.",
  "TE:kylepitts": "Kyle Pitts Sr.",
  "TE:orondegadsdenii": "Oronde Gadsden",
  "TE:chigoziemokonkwo": "Chig Okonkwo",
};

const consensusRows = parConsensusSource as readonly FantasyParSourceRow[];
const CONSENSUS_BY_KEY = new Map(
  consensusRows.map((row) => [
    normalizedFantasyPlayerKey(row.Position as FantasyPosition, row.Player),
    row,
  ]),
);

export function getRosConsensusIdentity(
  row: Pick<FantasyRankingRow, "player" | "position">,
): FantasyParSourceRow | undefined {
  const jkbKey = normalizedFantasyPlayerKey(row.position, row.player);
  const aliasedName = CONSENSUS_NAME_ALIASES[jkbKey];
  return CONSENSUS_BY_KEY.get(
    aliasedName ? normalizedFantasyPlayerKey(row.position, aliasedName) : jkbKey,
  );
}
