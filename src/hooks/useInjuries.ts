import { useQuery } from "@tanstack/react-query";

// ── Public types ─────────────────────────────────────────────────────────────

export interface InjuryEntry {
  playerName: string;
  position: string;
  status: string; // "Out" | "Doubtful" | "Questionable" | "Probable"
  description: string;
  impactRating: "High" | "Medium" | "Low";
  ppg: number | null;
  minutesPerGame: number | null;
  gamesPlayed: number | null;
}

const PPG_THRESHOLD = 5.0;
const MPG_THRESHOLD = 10.0;

function isRelevantInjury(ppg: number | null, mpg: number | null): boolean {
  // If we have no stats at all, include the player (can't filter what we can't measure)
  if (ppg === null && mpg === null) return true;
  const ppgOk = ppg === null || ppg >= PPG_THRESHOLD;
  const mpgOk = mpg === null || mpg >= MPG_THRESHOLD;
  return ppgOk && mpgOk;
}

function getImpactRating(ppg: number | null, mpg: number | null): "High" | "Medium" | "Low" {
  if ((ppg !== null && ppg >= 15) || (mpg !== null && mpg >= 28)) return "High";
  if ((ppg !== null && ppg >= 8) || (mpg !== null && mpg >= 18)) return "Medium";
  return "Low";
}

/** Keyed by ESPN full team name, e.g. "Duke Blue Devils" */
export type InjuryMap = Map<string, InjuryEntry[]>;

// ── ESPN raw shapes ───────────────────────────────────────────────────────────

interface EspnAthlete {
  id?: string; // present when ESPN includes it in injury entries
  displayName?: string;
  fullName?: string;
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
  team?: { id?: string; name?: string; abbreviation?: string };
  injuries?: EspnInjuryItem[];
}

interface EspnResponse {
  injuries?: EspnTeamBlock[];
}

interface EspnRosterAthlete {
  id?: string;
  displayName?: string;
  fullName?: string;
}

interface EspnStatEntry {
  name?: string;
  value?: number;
  displayValue?: string;
}

interface EspnStatCategory {
  name?: string;
  stats?: EspnStatEntry[];
}

// ── Internal intermediate type ────────────────────────────────────────────────

interface RawInjury {
  playerName: string;
  position: string;
  status: string;
  description: string;
  athleteId: string | null; // from injury entry itself if ESPN includes it
}

interface RawTeamBlock {
  teamName: string;
  espnTeamId: string | null;
  injuries: RawInjury[];
}

// ── Parsing ───────────────────────────────────────────────────────────────────

function parseResponseRaw(data: EspnResponse): RawTeamBlock[] {
  if (!Array.isArray(data.injuries)) return [];
  const blocks: RawTeamBlock[] = [];
  for (const block of data.injuries) {
    const teamName = block.team?.name;
    if (!teamName || !Array.isArray(block.injuries) || block.injuries.length === 0) continue;
    blocks.push({
      teamName,
      espnTeamId: block.team?.id ?? null,
      injuries: block.injuries.map((item): RawInjury => {
        const parts = [item.details?.side, item.type?.description, item.details?.detail]
          .filter(Boolean)
          .join(" ");
        return {
          playerName: item.athlete?.displayName ?? item.athlete?.fullName ?? "Unknown",
          position: item.athlete?.position?.abbreviation ?? "?",
          status: item.status ?? "Questionable",
          description: item.longComment ?? item.shortComment ?? (parts.length > 0 ? parts : "Undisclosed"),
          athleteId: item.athlete?.id ?? null,
        };
      }),
    });
  }
  return blocks;
}

// ── Stats fetching ────────────────────────────────────────────────────────────

/** Build a name→athleteId map from a team roster. */
async function fetchRosterMap(teamId: string): Promise<Map<string, string>> {
  try {
    const resp = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/${teamId}/roster`,
    );
    if (!resp.ok) return new Map();
    const data = (await resp.json()) as { athletes?: EspnRosterAthlete[] };
    const map = new Map<string, string>();
    for (const a of data.athletes ?? []) {
      if (!a.id) continue;
      if (a.displayName) map.set(a.displayName.toLowerCase(), a.id);
      if (a.fullName) map.set(a.fullName.toLowerCase(), a.id);
    }
    return map;
  } catch {
    return new Map();
  }
}

function extractFromCategories(
  categories: EspnStatCategory[],
): { ppg: number | null; minutesPerGame: number | null; gamesPlayed: number | null } {
  let ppg: number | null = null;
  let minutesPerGame: number | null = null;
  let gamesPlayed: number | null = null;
  for (const cat of categories) {
    for (const stat of cat.stats ?? []) {
      const name = (stat.name ?? "").toLowerCase();
      const numVal = (fallback: null) => {
        const v = typeof stat.value === "number" ? stat.value : parseFloat(stat.displayValue ?? "");
        return isNaN(v) ? fallback : v;
      };
      if (["avgpoints", "ppg", "pointspergame", "avgpointspergame"].includes(name)) {
        const v = numVal(null);
        if (v !== null) ppg = Math.round(v * 10) / 10;
      }
      if (["avgminutes", "mpg", "minutespergame", "avgminutespergame"].includes(name)) {
        const v = numVal(null);
        if (v !== null) minutesPerGame = Math.round(v * 10) / 10;
      }
      if (["gamesplayed", "gp", "games"].includes(name)) {
        const v = typeof stat.value === "number" ? stat.value : parseInt(stat.displayValue ?? "", 10);
        if (!isNaN(v)) gamesPlayed = Math.round(v);
      }
    }
  }
  return { ppg, minutesPerGame, gamesPlayed };
}

async function fetchAthleteStats(
  athleteId: string,
): Promise<{ ppg: number | null; minutesPerGame: number | null; gamesPlayed: number | null }> {
  const urls = [
    `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/athletes/${athleteId}/statistics/0`,
    `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/athletes/${athleteId}/statistics`,
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await resp.json()) as any;
      // ESPN stats responses may nest categories under different keys
      const categories: EspnStatCategory[] =
        data?.splits?.categories ??
        data?.statistics?.splits?.categories ??
        data?.statistics?.categories ??
        data?.categories ??
        [];
      const result = extractFromCategories(categories);
      if (result.ppg !== null || result.minutesPerGame !== null || result.gamesPlayed !== null) return result;
    } catch {
      // try next URL
    }
  }
  return { ppg: null, minutesPerGame: null, gamesPlayed: null };
}

// ── Query function ────────────────────────────────────────────────────────────

const ESPN_INJURIES_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/injuries";

async function buildInjuryMap(): Promise<InjuryMap> {
  const resp = await fetch(ESPN_INJURIES_URL);
  if (!resp.ok) throw new Error(`Injuries fetch failed: ${resp.status}`);
  const data = (await resp.json()) as EspnResponse;
  const rawBlocks = parseResponseRaw(data);

  if (rawBlocks.length === 0) return new Map();

  // For each team, build a name→athleteId map (from roster) for injuries missing a direct athleteId
  const rosterCache = new Map<string, Map<string, string>>();
  await Promise.all(
    rawBlocks
      .filter((b) => b.espnTeamId && b.injuries.some((i) => !i.athleteId))
      .map(async (b) => {
        const map = await fetchRosterMap(b.espnTeamId!);
        rosterCache.set(b.espnTeamId!, map);
      }),
  );

  // Collect all athlete IDs for stats fetch (deduplicated)
  const athleteIdSet = new Set<string>();
  for (const block of rawBlocks) {
    for (const inj of block.injuries) {
      const id =
        inj.athleteId ??
        (block.espnTeamId ? (rosterCache.get(block.espnTeamId)?.get(inj.playerName.toLowerCase()) ?? null) : null);
      if (id) athleteIdSet.add(id);
    }
  }

  // Fetch stats for all unique athletes in parallel
  const statsCache = new Map<string, { ppg: number | null; minutesPerGame: number | null; gamesPlayed: number | null }>();
  await Promise.all(
    [...athleteIdSet].map(async (id) => {
      statsCache.set(id, await fetchAthleteStats(id));
    }),
  );

  // Build final map
  const map: InjuryMap = new Map();
  for (const block of rawBlocks) {
    const entries: InjuryEntry[] = block.injuries.map((inj) => {
      const id =
        inj.athleteId ??
        (block.espnTeamId ? (rosterCache.get(block.espnTeamId)?.get(inj.playerName.toLowerCase()) ?? null) : null);
      const stats = id
        ? (statsCache.get(id) ?? { ppg: null, minutesPerGame: null, gamesPlayed: null })
        : { ppg: null, minutesPerGame: null, gamesPlayed: null };
      return {
        playerName: inj.playerName,
        position: inj.position,
        status: inj.status,
        description: inj.description,
        impactRating: getImpactRating(stats.ppg, stats.minutesPerGame),
        ppg: stats.ppg,
        minutesPerGame: stats.minutesPerGame,
        gamesPlayed: stats.gamesPlayed,
      };
    }).filter((entry) => isRelevantInjury(entry.ppg, entry.minutesPerGame));
    if (entries.length > 0) map.set(block.teamName, entries);
  }
  return map;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useInjuries() {
  return useQuery<InjuryMap>({
    queryKey: ["injuries"],
    queryFn: buildInjuryMap,
    staleTime: 30 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    retry: 1,
  });
}

// ── Utility ───────────────────────────────────────────────────────────────────

/** Look up injuries for a canonical team by name-matching against the ESPN key. */
export function lookupTeamInjuries(team: { name: string }, injuryMap: InjuryMap): InjuryEntry[] {
  const exact = injuryMap.get(team.name);
  if (exact) return exact;
  const firstWord = team.name.split(" ")[0].toLowerCase();
  for (const [key, val] of injuryMap.entries()) {
    if (key.toLowerCase().startsWith(firstWord)) return val;
  }
  return [];
}
