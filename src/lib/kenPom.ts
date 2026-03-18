import { findTeamByEspn } from "@/data/ncaaTeams";
import type { Team } from "@/data/ncaaTeams";
import type { KenPomTeam } from "@/hooks/useKenPom";

export interface KenPomEntry {
  adjOERank: number;
  adjDERank: number;
  overallRank: number;
  source: "kenpom" | "torvik";
}

// KenPom uses its own name conventions — map known mismatches to ESPN-style names
// so they flow through findTeamByEspn's existing alias system.
const KENPOM_NAME_MAP: Record<string, string> = {
  "N.C. State": "NC State",
  "St. John's": "St. John's",
  "Saint Mary's": "Saint Mary's",
  "Saint Louis": "Saint Louis",
  "Mount St. Mary's": "Mount St. Mary's",
  "F. Dickinson": "Fairleigh Dickinson",
  "Abilene Chr.": "Abilene Christian",
  "S.F. Austin": "Stephen F. Austin",
  "S. Carolina St.": "South Carolina State",
  "G. Washington": "George Washington",
  "CS Fullerton": "Cal State Fullerton",
  "CS Bakersfield": "Cal State Bakersfield",
  "CS Northridge": "CS Northridge",
  "Long Beach St.": "Long Beach State",
  "Sacramento St.": "Sacramento State",
  "San Jose St.": "San Jose State",
  "Weber St.": "Weber State",
  "Idaho St.": "Idaho State",
  "Portland St.": "Portland State",
  "Montana St.": "Montana State",
  "North Dakota St.": "North Dakota State",
  "South Dakota St.": "South Dakota State",
  "Youngstown St.": "Youngstown State",
  "McNeese St.": "McNeese State",
  "Nicholls St.": "Nicholls State",
  "Northwestern St.": "Northwestern State",
  "Southeastern La.": "Southeastern Louisiana",
  "SIU Edwardsville": "SIU Edwardsville",
  "Loyola Chicago": "Loyola Chicago",
  "Loyola Maryland": "Loyola (MD)",
  "LIU": "Long Island",
  "UT Martin": "Tennessee Martin",
  "Morehead St.": "Morehead State",
  "Murray St.": "Murray State",
  "Tennessee St.": "Tennessee State",
  "Austin Peay": "Austin Peay",
  "E. Kentucky": "Eastern Kentucky",
  "E. Illinois": "Eastern Illinois",
  "E. Michigan": "Eastern Michigan",
  "W. Michigan": "Western Michigan",
  "W. Kentucky": "Western Kentucky",
  "W. Illinois": "Western Illinois",
  "N. Iowa": "Northern Iowa",
  "S. Illinois": "Southern Illinois",
  "N. Illinois": "Northern Illinois",
  "Cal Poly": "Cal Poly",
  "UC Davis": "UC Davis",
  "UC Irvine": "UC Irvine",
  "UC Riverside": "UC Riverside",
  "UC Santa Barbara": "UC Santa Barbara",
  "UCSB": "UC Santa Barbara",
  "UNC Asheville": "UNC Asheville",
  "UNC Greensboro": "UNC Greensboro",
  "UNC Wilmington": "UNC Wilmington",
};

/** Expand common KenPom abbreviations to ESPN-style full names. */
function normalizeKenPomName(name: string): string {
  // Direct override map first
  if (KENPOM_NAME_MAP[name]) return KENPOM_NAME_MAP[name];

  return name
    // "Michigan St." → "Michigan State"
    .replace(/\bSt\.\s*$/g, "State")
    .replace(/\bSt\.\s+/g, "State ")
    // "N.C. State" already handled above; clean remaining dots
    .replace(/\b([A-Z])\.\s*([A-Z])\./g, "$1$2")
    // "A&M" variants
    .replace(/\bA&M\b/g, "A&M")
    .trim();
}

/**
 * Build a Map<canonicalId, KenPomEntry> by matching raw KenPom team names
 * against the current canonical team pool.
 */
export function buildKenPomMap(
  teams: KenPomTeam[],
  teamPool: Team[],
  source: "kenpom" | "torvik" | null,
): Map<string, KenPomEntry> {
  const map = new Map<string, KenPomEntry>();
  if (!source || !teams.length || !teamPool.length) return map;

  for (const kp of teams) {
    // Try original name
    let matched = findTeamByEspn(kp.teamName, "", teamPool);

    // Try normalized name if first attempt fails
    if (!matched) {
      const normalized = normalizeKenPomName(kp.teamName);
      if (normalized !== kp.teamName) {
        matched = findTeamByEspn(normalized, "", teamPool);
      }
    }

    if (matched) {
      map.set(matched.canonicalId, {
        adjOERank: kp.adjOERank,
        adjDERank: kp.adjDERank,
        overallRank: kp.overallRank,
        source: source as "kenpom" | "torvik",
      });
    }
  }

  return map;
}

/** Color class for a KenPom rank number — lower is better (#1 = best). */
export function kenPomRankColor(rank: number | null | undefined): string {
  if (rank == null) return "text-muted-foreground";
  if (rank <= 25) return "text-yellow-400 font-bold";
  if (rank <= 75) return "text-foreground font-semibold";
  return "text-muted-foreground";
}

/** Format a KenPom rank for display: "#14" */
export function formatKenPomRank(rank: number | null | undefined): string {
  if (rank == null) return "—";
  return `#${rank}`;
}
