import {
  DEFAULT_STAT_WEIGHTS,
  ELITE_8_PRESET_WEIGHTS,
  calculateTeamScore,
  emptyTeamStats,
  findTeamByCanonicalId,
  findTeamByEspn,
  getStatsCoverage,
  slugify,
  teams as fallbackTeams,
  type StatWeight,
  type Team,
} from "@/data/ncaaTeams";

export const BRACKET_REGION_NAMES = ["East", "West", "South", "Midwest"] as const;
export const BRACKET_ROUNDS = ["Round of 64", "Round of 32", "Sweet 16", "Elite 8", "Final Four", "Championship"] as const;
export const REGION_MATCHUPS: [number, number][] = [
  [1, 16],
  [8, 9],
  [5, 12],
  [4, 13],
  [6, 11],
  [3, 14],
  [7, 10],
  [2, 15],
];

export interface BracketSeedSlot {
  seed: number;
  teamName: string;
  abbreviation: string;
  canonicalId?: string;
  espnId?: string | null;
}

export interface BracketRegionConfig {
  name: string;
  slots: BracketSeedSlot[];
}

export interface BracketSourceConfig {
  season: string;
  mode: "placeholder" | "live";
  sourceLabel: string;
  updatedAt: string;
  regions: BracketRegionConfig[];
}

export interface ResolvedBracketRegion {
  name: string;
  teams: Team[];
}

export interface BracketPreset {
  id: string;
  name: string;
  weights: StatWeight[];
  source: "built-in" | "custom";
  note?: string;
}

export interface BracketGame {
  id: string;
  roundIndex: number;
  region: string;
  label: string;
  teamA: Team | null;
  teamB: Team | null;
  winner: Team | null;
}

export interface BracketTree {
  regionGames: Record<string, BracketGame[]>;
  finalFourGames: BracketGame[];
  championshipGame: BracketGame;
  champion: Team | null;
}

export interface PathDifficulty {
  score: number;
  tier: "Easy" | "Medium" | "Hard" | "Brutal";
  likelyOpponents: Array<{ round: string; team: Team | null; strength: number }>;
}

export interface SavedBracket {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  presetId: string | null;
  weights: StatWeight[];
  picks: Record<string, string>;
}

const OFFICIAL_BRACKET_PATH = "/official-bracket.json";
const PRESET_STORAGE_KEY = "jkb-bracket-presets-v1";
const BRACKET_STORAGE_KEY = "jkb-saved-brackets-v1";

function cloneWeights(weights: StatWeight[]): StatWeight[] {
  return weights.map((weight) => ({ ...weight }));
}

function sortTeamsBySeed(teams: Team[]) {
  return [...teams].sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99));
}

export const BUILT_IN_PRESETS: BracketPreset[] = [
  {
    id: "preset-default",
    name: "Default Model",
    weights: cloneWeights(DEFAULT_STAT_WEIGHTS),
    source: "built-in",
    note: "Baseline power score using balanced NCAA stat weights.",
  },
  {
    id: "preset-2025-elite",
    name: "2025 Elite Preset",
    weights: cloneWeights(ELITE_8_PRESET_WEIGHTS),
    source: "built-in",
    note: "Based on the rankings from last year's Elite 8 teams.",
  },
];

export function getBuiltInPreset(id: string) {
  return BUILT_IN_PRESETS.find((preset) => preset.id === id) ?? BUILT_IN_PRESETS[0];
}

export function buildPlaceholderBracketSource(): BracketSourceConfig {
  const field = sortTeamsBySeed(fallbackTeams).slice(0, 64);
  const regionSize = 16;

  return {
    season: "2025-placeholder",
    mode: "placeholder",
    sourceLabel: "Current bracket builder using last year's field until the official bracket drops",
    updatedAt: new Date().toISOString(),
    regions: BRACKET_REGION_NAMES.map((regionName, regionIndex) => {
      const regionTeams = field.slice(regionIndex * regionSize, (regionIndex + 1) * regionSize);
      return {
        name: regionName,
        slots: sortTeamsBySeed(regionTeams).map((team) => ({
          seed: team.seed ?? 16,
          teamName: team.name,
          abbreviation: team.abbreviation,
          canonicalId: team.canonicalId,
          espnId: team.espnId ?? null,
        })),
      };
    }),
  };
}

export async function loadOfficialBracketSource(): Promise<BracketSourceConfig | null> {
  try {
    const response = await fetch(OFFICIAL_BRACKET_PATH, { cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json();
    if (!payload?.enabled || !Array.isArray(payload?.regions) || payload.regions.length !== 4) {
      return null;
    }
    return payload as BracketSourceConfig;
  } catch {
    return null;
  }
}

function createFallbackResolvedTeam(slot: BracketSeedSlot): Team {
  const teamName = slot.teamName;
  return {
    id: Number.parseInt(slot.espnId ?? "", 10) || Math.abs(teamName.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0)),
    canonicalId: slot.canonicalId ?? `official-${slugify(teamName)}`,
    slug: slugify(teamName),
    espnId: slot.espnId ?? null,
    name: teamName,
    abbreviation: slot.abbreviation,
    conference: "NCAA",
    seed: slot.seed,
    record: "",
    logo: "/placeholder.svg",
    stats: emptyTeamStats(),
    homeStats: emptyTeamStats(),
    awayStats: emptyTeamStats(),
    statsCoverage: getStatsCoverage(emptyTeamStats()),
    source: "live",
  };
}

export function resolveBracketSource(source: BracketSourceConfig, teamPool: Team[]): ResolvedBracketRegion[] {
  return source.regions.map((region) => ({
    name: region.name,
    teams: region.slots
      .map((slot) => {
        const byCanonical = slot.canonicalId ? findTeamByCanonicalId(slot.canonicalId, teamPool) : null;
        const byEspn = slot.espnId ? teamPool.find((team) => team.espnId === slot.espnId) ?? null : null;
        const byName = findTeamByEspn(slot.teamName, slot.abbreviation, teamPool);
        const resolved = byCanonical ?? byEspn ?? byName;
        return resolved ? { ...resolved, seed: slot.seed } : createFallbackResolvedTeam(slot);
      })
      .sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99)),
  }));
}

function getWinnerFromPick(teamA: Team | null, teamB: Team | null, winnerId?: string): Team | null {
  if (!teamA || !teamB || !winnerId) return null;
  if (teamA.canonicalId === winnerId) return teamA;
  if (teamB.canonicalId === winnerId) return teamB;
  return null;
}

function createGame(id: string, roundIndex: number, region: string, label: string, teamA: Team | null, teamB: Team | null, picks: Record<string, string>): BracketGame {
  return {
    id,
    roundIndex,
    region,
    label,
    teamA,
    teamB,
    winner: getWinnerFromPick(teamA, teamB, picks[id]),
  };
}

export function buildBracketTree(regions: ResolvedBracketRegion[], picks: Record<string, string>): BracketTree {
  const regionGames: Record<string, BracketGame[]> = {};
  const regionChampions: Record<string, Team | null> = {};

  regions.forEach((region) => {
    const roundOf64 = REGION_MATCHUPS.map(([seedA, seedB], gameIndex) => {
      const teamA = region.teams.find((team) => team.seed === seedA) ?? null;
      const teamB = region.teams.find((team) => team.seed === seedB) ?? null;
      return createGame(`${region.name}-r0-g${gameIndex}`, 0, region.name, BRACKET_ROUNDS[0], teamA, teamB, picks);
    });

    const roundOf32 = Array.from({ length: 4 }, (_, gameIndex) =>
      createGame(
        `${region.name}-r1-g${gameIndex}`,
        1,
        region.name,
        BRACKET_ROUNDS[1],
        roundOf64[gameIndex * 2]?.winner ?? null,
        roundOf64[gameIndex * 2 + 1]?.winner ?? null,
        picks,
      ),
    );

    const sweet16 = Array.from({ length: 2 }, (_, gameIndex) =>
      createGame(
        `${region.name}-r2-g${gameIndex}`,
        2,
        region.name,
        BRACKET_ROUNDS[2],
        roundOf32[gameIndex * 2]?.winner ?? null,
        roundOf32[gameIndex * 2 + 1]?.winner ?? null,
        picks,
      ),
    );

    const elite8 = [
      createGame(
        `${region.name}-r3-g0`,
        3,
        region.name,
        BRACKET_ROUNDS[3],
        sweet16[0]?.winner ?? null,
        sweet16[1]?.winner ?? null,
        picks,
      ),
    ];

    regionGames[region.name] = [...roundOf64, ...roundOf32, ...sweet16, ...elite8];
    regionChampions[region.name] = elite8[0]?.winner ?? null;
  });

  const finalFourGames = [
    createGame(
      "final-four-0",
      4,
      "Final Four",
      BRACKET_ROUNDS[4],
      regionChampions.East ?? null,
      regionChampions.West ?? null,
      picks,
    ),
    createGame(
      "final-four-1",
      4,
      "Final Four",
      BRACKET_ROUNDS[4],
      regionChampions.South ?? null,
      regionChampions.Midwest ?? null,
      picks,
    ),
  ];

  const championshipGame = createGame(
    "championship",
    5,
    "Championship",
    BRACKET_ROUNDS[5],
    finalFourGames[0]?.winner ?? null,
    finalFourGames[1]?.winner ?? null,
    picks,
  );

  return {
    regionGames,
    finalFourGames,
    championshipGame,
    champion: championshipGame.winner,
  };
}

export function calculateAdjustedTeamScore(team: Team, weights: StatWeight[]) {
  return calculateTeamScore(team.stats, weights);
}

function getLikelyOpponent(pool: Team[], excludeId: string, weights: StatWeight[]) {
  return [...pool]
    .filter((team) => team.canonicalId !== excludeId)
    .sort((a, b) => calculateAdjustedTeamScore(b, weights) - calculateAdjustedTeamScore(a, weights))[0] ?? null;
}

export function computePathDifficulty(team: Team, region: ResolvedBracketRegion, weights: StatWeight[]): PathDifficulty {
  const teamSeed = team.seed ?? 16;
  const round1Seeds = REGION_MATCHUPS.find(([seedA, seedB]) => seedA === teamSeed || seedB === teamSeed) ?? [teamSeed, teamSeed];
  const round1Pool = region.teams.filter((candidate) => candidate.seed === round1Seeds.find((seed) => seed !== teamSeed));

  const podIndex = REGION_MATCHUPS.findIndex(([seedA, seedB]) => seedA === teamSeed || seedB === teamSeed);
  const round2Pod = region.teams.filter((candidate) => {
    const candidatePodIndex = REGION_MATCHUPS.findIndex(([seedA, seedB]) => seedA === candidate.seed || seedB === candidate.seed);
    return Math.floor(candidatePodIndex / 2) === Math.floor(podIndex / 2) && candidate.canonicalId !== team.canonicalId;
  });
  const sameHalf = region.teams.filter((candidate) => {
    const candidatePodIndex = REGION_MATCHUPS.findIndex(([seedA, seedB]) => seedA === candidate.seed || seedB === candidate.seed);
    return Math.floor(candidatePodIndex / 4) === Math.floor(podIndex / 4) && candidate.canonicalId !== team.canonicalId;
  });
  const otherHalf = region.teams.filter((candidate) => {
    const candidatePodIndex = REGION_MATCHUPS.findIndex(([seedA, seedB]) => seedA === candidate.seed || seedB === candidate.seed);
    return Math.floor(candidatePodIndex / 4) !== Math.floor(podIndex / 4);
  });

  const likelyOpponents = [
    { round: "Round of 64", team: round1Pool[0] ?? null, strength: round1Pool[0] ? calculateAdjustedTeamScore(round1Pool[0], weights) : 0 },
    { round: "Round of 32", team: getLikelyOpponent(round2Pod, team.canonicalId, weights), strength: 0 },
    { round: "Sweet 16", team: getLikelyOpponent(sameHalf, team.canonicalId, weights), strength: 0 },
    { round: "Elite 8", team: getLikelyOpponent(otherHalf, team.canonicalId, weights), strength: 0 },
  ].map((entry) => ({
    ...entry,
    strength: entry.team ? calculateAdjustedTeamScore(entry.team, weights) : 0,
  }));

  const difficultyScore = likelyOpponents.reduce((total, opponent, index) => total + opponent.strength * [0.18, 0.22, 0.27, 0.33][index], 0);
  const tier: PathDifficulty["tier"] =
    difficultyScore >= 78 ? "Brutal" :
    difficultyScore >= 68 ? "Hard" :
    difficultyScore >= 58 ? "Medium" :
    "Easy";

  return {
    score: Number(difficultyScore.toFixed(1)),
    tier,
    likelyOpponents,
  };
}

export function rankTeamsInRegion(region: ResolvedBracketRegion, weights: StatWeight[]) {
  return [...region.teams]
    .map((team) => ({
      team,
      score: calculateAdjustedTeamScore(team, weights),
      path: computePathDifficulty(team, region, weights),
    }))
    .sort((a, b) => b.score - a.score);
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function loadCustomPresets(): BracketPreset[] {
  if (typeof window === "undefined") return [];
  return safeJsonParse<BracketPreset[]>(window.localStorage.getItem(PRESET_STORAGE_KEY), []);
}

export function saveCustomPresets(presets: BracketPreset[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
}

export function loadSavedBrackets(): SavedBracket[] {
  if (typeof window === "undefined") return [];
  return safeJsonParse<SavedBracket[]>(window.localStorage.getItem(BRACKET_STORAGE_KEY), []);
}

export function saveSavedBrackets(brackets: SavedBracket[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BRACKET_STORAGE_KEY, JSON.stringify(brackets));
}

export function createCustomPreset(name: string, weights: StatWeight[]): BracketPreset {
  const timestamp = new Date().toISOString();
  return {
    id: `custom-${slugify(name)}-${Date.now()}`,
    name,
    weights: cloneWeights(weights),
    source: "custom",
    note: `Saved ${new Date(timestamp).toLocaleString()}`,
  };
}

export function duplicatePreset(preset: BracketPreset): BracketPreset {
  return createCustomPreset(`${preset.name} Copy`, preset.weights);
}

export function createSavedBracket(name: string, presetId: string | null, weights: StatWeight[], picks: Record<string, string>): SavedBracket {
  const timestamp = new Date().toISOString();
  return {
    id: `bracket-${Date.now()}`,
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    presetId,
    weights: cloneWeights(weights),
    picks: { ...picks },
  };
}

export function duplicateSavedBracket(bracket: SavedBracket): SavedBracket {
  return createSavedBracket(`${bracket.name} Copy`, bracket.presetId, bracket.weights, bracket.picks);
}

export function createBracketSummaryText(regions: ResolvedBracketRegion[], tree: BracketTree, weights: StatWeight[], presetName: string) {
  const regionChampionLines = regions.map((region) => {
    const regionChampion = tree.regionGames[region.name].find((game) => game.roundIndex === 3)?.winner;
    return `${region.name}: ${regionChampion?.name ?? "TBD"}`;
  });

  const finalFourLines = tree.finalFourGames.map((game, index) => `Final Four ${index + 1}: ${game.winner?.name ?? "TBD"}`);

  return [
    `Joe Knows Ball Bracket Summary`,
    `Preset: ${presetName}`,
    ...regionChampionLines,
    ...finalFourLines,
    `Champion: ${tree.champion?.name ?? "TBD"}`,
    `Built from the current live working bracket using last year's field until the official bracket is released.`,
  ].join("\n");
}
