import { useQuery } from "@tanstack/react-query";

export interface InjuryEntry {
  playerName: string;
  position: string;
  status: string; // "Out" | "Doubtful" | "Questionable" | "Probable" | etc.
  description: string;
  impactRating: "High" | "Medium" | "Low";
}

/** Keyed by ESPN full team name, e.g. "Duke Blue Devils" */
export type InjuryMap = Map<string, InjuryEntry[]>;

const ESPN_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/injuries";

interface EspnAthlete {
  displayName?: string;
  position?: { abbreviation?: string };
}

interface EspnInjuryItem {
  athlete?: EspnAthlete;
  status?: string;
  type?: { description?: string };
  details?: { detail?: string; side?: string };
  longComment?: string;
  shortComment?: string;
}

interface EspnTeamBlock {
  team?: { name?: string; abbreviation?: string };
  injuries?: EspnInjuryItem[];
}

interface EspnResponse {
  injuries?: EspnTeamBlock[];
}

function parseResponse(data: EspnResponse): InjuryMap {
  const map: InjuryMap = new Map();
  if (!Array.isArray(data.injuries)) return map;
  for (const block of data.injuries) {
    const teamName = block.team?.name;
    if (!teamName || !Array.isArray(block.injuries) || block.injuries.length === 0) continue;
    const entries: InjuryEntry[] = block.injuries.map((item) => {
      const partsDesc = [item.details?.side, item.type?.description, item.details?.detail]
        .filter(Boolean)
        .join(" ");
      const desc =
        item.longComment ?? item.shortComment ?? (partsDesc.length > 0 ? partsDesc : "Undisclosed");
      return {
        playerName: item.athlete?.displayName ?? "Unknown",
        position: item.athlete?.position?.abbreviation ?? "?",
        status: item.status ?? "Questionable",
        description: desc,
        impactRating: "Medium" as const,
      };
    });
    map.set(teamName, entries);
  }
  return map;
}

export function useInjuries() {
  return useQuery<InjuryMap>({
    queryKey: ["injuries"],
    queryFn: async () => {
      const resp = await fetch(ESPN_URL);
      if (!resp.ok) throw new Error(`Injuries fetch failed: ${resp.status}`);
      const data = (await resp.json()) as EspnResponse;
      return parseResponse(data);
    },
    staleTime: 30 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Look up injuries for a canonical team by matching against the ESPN team name.
 * ESPN uses names like "Duke Blue Devils"; our teams use the same format.
 */
export function lookupTeamInjuries(team: { name: string }, injuryMap: InjuryMap): InjuryEntry[] {
  // Exact match first
  const exact = injuryMap.get(team.name);
  if (exact) return exact;
  // Partial match: check if ESPN key starts with same school name (first word)
  const firstWord = team.name.split(" ")[0].toLowerCase();
  for (const [key, val] of injuryMap.entries()) {
    if (key.toLowerCase().startsWith(firstWord)) return val;
  }
  return [];
}
