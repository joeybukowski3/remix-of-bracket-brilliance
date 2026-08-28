/**
 * Bridges a JKB board row to its FantasyPros Real-Time ADP row.
 *
 * Mirrors the exact position+normalized-name join already used for the PAR
 * consensus source (see rosPlayerIdentity.ts): no fuzzy matching, no
 * team-based fallback, no silent name-only guess outside the reviewed alias
 * list below. A row this cannot resolve renders ADP as N/A.
 *
 * Every alias here was confirmed by reading the actual FantasyPros export
 * (data/fantasy/2026-fantasypros-adp.csv) — each is a verified exact name the
 * source uses for a player the JKB workbook spells differently, not a guess.
 */
import adpSource from "../../../data/fantasy/2026-fantasypros-adp.json";
import { normalizedFantasyPlayerKey } from "@/lib/fantasy/rosPlayerIdentity";
import type { FantasyPosition, FantasyRankingRow } from "@/lib/fantasy/rankings";
import type { ParsedFantasyProsAdpRow } from "@/lib/fantasy/fantasyProsAdpParser";

/** JKB workbook name -> the exact FantasyPros Real-Time ADP export spelling. */
const ADP_NAME_ALIASES: Readonly<Record<string, string>> = {
  "QB:patrickmahomes": "Patrick Mahomes II",
  "RB:jamescook": "James Cook III",
  "RB:kennethwalker": "Kenneth Walker III",
  "RB:travisetienne": "Travis Etienne Jr.",
  "RB:kennethgainwell": "Kenny Gainwell",
  "RB:aaronjones": "Aaron Jones Sr.",
  "RB:tyronetracy": "Tyrone Tracy Jr.",
  "RB:brianrobinson": "Brian Robinson Jr.",
  "RB:mikewashington": "Mike Washington Jr.",
  "RB:olliegordon": "Ollie Gordon II",
  "WR:lutherburden": "Luther Burden III",
  "WR:michaelpittman": "Michael Pittman Jr.",
  "WR:chrisgodwin": "Chris Godwin Jr.",
  "WR:kevinconcepcion": "KC Concepcion",
  "WR:deebosamuel": "Deebo Samuel Sr.",
  "TE:kylepitts": "Kyle Pitts Sr.",
  "TE:chigoziemokonkwo": "Chig Okonkwo",
};

const adpRows = adpSource.rows as readonly ParsedFantasyProsAdpRow[];

const ADP_BY_KEY = new Map<string, ParsedFantasyProsAdpRow>(
  adpRows.map((row) => [normalizedFantasyPlayerKey(row.position as FantasyPosition, row.player), row]),
);

/** Returns the row's FantasyPros ADP entry, or undefined when it cannot be resolved. */
export function getFantasyProsAdp(
  row: Pick<FantasyRankingRow, "player" | "position">,
): ParsedFantasyProsAdpRow | undefined {
  const jkbKey = normalizedFantasyPlayerKey(row.position, row.player);
  const aliasedName = ADP_NAME_ALIASES[jkbKey];
  return ADP_BY_KEY.get(
    aliasedName ? normalizedFantasyPlayerKey(row.position, aliasedName) : jkbKey,
  );
}

export const FANTASY_PROS_ADP_META = adpSource._meta;
