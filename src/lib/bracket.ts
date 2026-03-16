import {
  DEFAULT_STAT_WEIGHTS,
  ELITE_8_PRESET_WEIGHTS,
  calculateTeamScore,
  emptyTeamStats,
  findTeamByCanonicalId,
  findTeamByEspn,
  getCanonicalSchoolKey,
  getStatsCoverage,
  slugify,
  type StatWeight,
  type Team,
} from "@/data/ncaaTeams";
import { OFFICIAL_2026_BRACKET } from "@/data/bracket2026";
import { getActiveBracketData } from "@/lib/activeBracket";

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
  logo?: string | null;
  sourceGameId?: string;
  playInGameId?: string;
  playInTeams?: BracketSeedSlot[];
}

export interface BracketRegionConfig {
  name: string;
  slots: BracketSeedSlot[];
}

export interface BracketFirstFourGame {
  id: string;
  region: string;
  seed: number;
  label: string;
  teams: BracketSeedSlot[];
}

export interface BracketSourceConfig {
  season: string;
  mode: "placeholder" | "live";
  sourceLabel: string;
  updatedAt: string;
  regions: BracketRegionConfig[];
  firstFour?: BracketFirstFourGame[];
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

export interface TournamentMatchupSlot {
  seed: number;
  displayName: string;
  team: Team;
  options: Team[];
  isPlayIn: boolean;
  playInGameId?: string;
}

export interface TournamentMatchup {
  id: string;
  gameId: string;
  region: string;
  title: string;
  teamA: TournamentMatchupSlot;
  teamB: TournamentMatchupSlot;
}

const OFFICIAL_BRACKET_PATH = "/official-bracket.json";
const PRESET_STORAGE_KEY = "jkb-bracket-presets-v1";
const BRACKET_STORAGE_KEY = "jkb-saved-brackets-v1";

function cloneWeights(weights: StatWeight[]): StatWeight[] {
  return weights.map((weight) => ({ ...weight }));
}

export const BUILT_IN_PRESETS: BracketPreset[] = [
  {
    id: "preset-default",
    name: "Default Model",
    weights: cloneWeights(DEFAULT_STAT_WEIGHTS),
    source: "built-in",
    note: "Baseline power score emphasizing adjusted efficiency and strength of schedule.",
  },
  {
    id: "preset-2025-elite",
    name: "2025 Elite 8 Team Rank Preset",
    weights: cloneWeights(ELITE_8_PRESET_WEIGHTS),
    source: "built-in",
    note: "Based on the rankings from last year's Elite 8 teams.",
  },
];

export function getBuiltInPreset(id: string) {
  return BUILT_IN_PRESETS.find((preset) => preset.id === id) ?? BUILT_IN_PRESETS[0];
}

export function buildPlaceholderBracketSource(): BracketSourceConfig {
  return structuredClone(OFFICIAL_2026_BRACKET);
}

export async function loadOfficialBracketSource(): Promise<BracketSourceConfig | null> {
  try {
    const payload = await getActiveBracketData();
    if (!Array.isArray(payload?.regions) || payload.regions.length !== 4) {
      return null;
    }
    return payload;
  } catch {
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
    record: "Record unavailable",
    logo: slot.logo || "/placeholder.svg",
    stats: emptyTeamStats(),
    homeStats: emptyTeamStats(),
    awayStats: emptyTeamStats(),
    statsCoverage: getStatsCoverage(emptyTeamStats()),
    source: "live",
  };
}

function averageStat(values: Array<number | null>) {
  const valid = values.filter((value): value is number => typeof value === "number");
  if (!valid.length) return null;
  return Number((valid.reduce((total, value) => total + value, 0) / valid.length).toFixed(1));
}

function averageStats(teams: Team[]) {
  return {
    ppg: averageStat(teams.map((team) => team.stats.ppg)),
    oppPpg: averageStat(teams.map((team) => team.stats.oppPpg)),
    fgPct: averageStat(teams.map((team) => team.stats.fgPct)),
    threePct: averageStat(teams.map((team) => team.stats.threePct)),
    ftPct: averageStat(teams.map((team) => team.stats.ftPct)),
    rpg: averageStat(teams.map((team) => team.stats.rpg)),
    apg: averageStat(teams.map((team) => team.stats.apg)),
    spg: averageStat(teams.map((team) => team.stats.spg)),
    bpg: averageStat(teams.map((team) => team.stats.bpg)),
    tpg: averageStat(teams.map((team) => team.stats.tpg)),
    sos: averageStat(teams.map((team) => team.stats.sos)),
    adjOE: averageStat(teams.map((team) => team.stats.adjOE)),
    adjDE: averageStat(teams.map((team) => team.stats.adjDE)),
    tempo: averageStat(teams.map((team) => team.stats.tempo)),
    luck: averageStat(teams.map((team) => team.stats.luck)),
  };
}

function resolveSingleBracketSlot(slot: BracketSeedSlot, teamPool: Team[]) {
  const byCanonical = slot.canonicalId ? findTeamByCanonicalId(slot.canonicalId, teamPool) : null;
  const byEspn = slot.espnId ? teamPool.find((team) => team.espnId === slot.espnId) ?? null : null;
  const byName = findTeamByEspn(slot.teamName, slot.abbreviation, teamPool);
  return byCanonical ?? byEspn ?? byName ?? null;
}

function createPlayInTeam(slot: BracketSeedSlot, candidates: Team[]): Team {
  const stats = averageStats(candidates);
  return {
    id: Math.abs(slot.teamName.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0)),
    canonicalId: slot.canonicalId ?? `play-in-${slugify(slot.teamName)}`,
    slug: slugify(slot.teamName),
    espnId: null,
    name: slot.teamName,
    abbreviation: slot.abbreviation,
    conference: "First Four",
    seed: slot.seed,
    record: candidates.map((team) => team.record).filter(Boolean).join(" / ") || "Play-In",
    logo: candidates[0]?.logo || slot.logo || "/placeholder.svg",
    stats,
    homeStats: stats,
    awayStats: stats,
    statsCoverage: getStatsCoverage(stats),
    source: "hybrid",
  };
}

function applySlotBranding(team: Team, slot: BracketSeedSlot): Team {
  const nextLogo = team.logo && team.logo !== "/placeholder.svg" ? team.logo : slot.logo || team.logo;
  const nextName = team.name || slot.teamName;
  const nextAbbreviation = team.abbreviation || slot.abbreviation;

  return {
    ...team,
    name: nextName,
    abbreviation: nextAbbreviation,
    logo: nextLogo || "/placeholder.svg",
    seed: slot.seed,
  };
}

export function resolveBracketSlotOptions(slot: BracketSeedSlot, teamPool: Team[]) {
  if (!slot.playInTeams?.length) {
    const resolved = resolveSingleBracketSlot(slot, teamPool);
    return resolved ? [applySlotBranding(resolved, slot)] : [];
  }

  return slot.playInTeams
    .map((candidate) => resolveSingleBracketSlot(candidate, teamPool) ?? createFallbackResolvedTeam(candidate))
    .map((team, index) => applySlotBranding(team, slot.playInTeams?.[index] ?? slot));
}

function resolveBracketSlotTeam(slot: BracketSeedSlot, teamPool: Team[]) {
  const options = resolveBracketSlotOptions(slot, teamPool);
  if (slot.playInTeams?.length) {
    return options.length ? applySlotBranding(createPlayInTeam(slot, options), slot) : createFallbackResolvedTeam(slot);
  }
  return options[0] ?? createFallbackResolvedTeam(slot);
}

function logBracketValidation(message: string, details: Record<string, unknown>) {
  console.warn(`[bracket-normalization] ${message}`, details);
}

export function resolveBracketSource(source: BracketSourceConfig, teamPool: Team[]): ResolvedBracketRegion[] {
  if (source.regions.length !== 4) {
    logBracketValidation("Bracket source does not have all four regions", {
      season: source.season,
      regions: source.regions.map((region) => region.name),
    });
  }

  const slotCount = source.regions.reduce((total, region) => total + region.slots.length, 0);
  if (slotCount !== 64) {
    logBracketValidation("Bracket source does not contain a full Round of 64 field", {
      season: source.season,
      slotCount,
    });
  }

  const seenOverall = new Set<string>();

  return source.regions.map((region) => {
    const seenInRegion = new Set<string>();
    const teams = region.slots
      .map((slot) => {
        const options = resolveBracketSlotOptions(slot, teamPool);
        const team = resolveBracketSlotTeam(slot, teamPool);
        const schoolKey = getCanonicalSchoolKey(team.name, team.abbreviation);
        if (options.length === 0) {
          logBracketValidation("Unmatched bracket slot fell back to placeholder", {
            region: region.name,
            seed: slot.seed,
            slot: slot.teamName,
          });
        }
        if (seenInRegion.has(schoolKey)) {
          logBracketValidation("Duplicate team detected inside region", {
            region: region.name,
            slot: slot.teamName,
            canonicalId: team.canonicalId,
            schoolKey,
          });
        }
        if (seenOverall.has(schoolKey)) {
          logBracketValidation("Duplicate team detected across bracket field", {
            region: region.name,
            slot: slot.teamName,
            canonicalId: team.canonicalId,
            schoolKey,
          });
        }
        if (!team.canonicalId) {
          logBracketValidation("Tournament team missing canonical ID", {
            region: region.name,
            slot: slot.teamName,
          });
        }
        if (!team.logo || team.logo === "/placeholder.svg") {
          logBracketValidation("Tournament team missing resolved logo", {
            region: region.name,
            slot: slot.teamName,
            canonicalId: team.canonicalId,
          });
        }
        if (!team.conference || team.conference === "NCAA") {
          logBracketValidation("Tournament team missing conference enrichment", {
            region: region.name,
            slot: slot.teamName,
            canonicalId: team.canonicalId,
          });
        }
        if (!team.record || team.record === "Record unavailable") {
          logBracketValidation("Tournament team missing record enrichment", {
            region: region.name,
            slot: slot.teamName,
            canonicalId: team.canonicalId,
          });
        }
        if (team.statsCoverage === "none") {
          logBracketValidation("Tournament team missing advanced stats", {
            region: region.name,
            slot: slot.teamName,
            canonicalId: team.canonicalId,
          });
        }
        seenInRegion.add(schoolKey);
        seenOverall.add(schoolKey);
        return { ...team, canonicalId: team.canonicalId || `school-${schoolKey}` };
      })
      .sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99));

    return {
      name: region.name,
      teams,
    };
  });
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

function matchupTitle(slotA: TournamentMatchupSlot, slotB: TournamentMatchupSlot) {
  return `${slotA.displayName} vs ${slotB.displayName}`;
}

export function buildTournamentMatchups(source: BracketSourceConfig, teamPool: Team[]): TournamentMatchup[] {
  return source.regions.flatMap((region) => {
    const slotsBySeed = new Map(region.slots.map((slot) => [slot.seed, slot]));

    return REGION_MATCHUPS.map(([seedA, seedB]) => {
      const slotA = slotsBySeed.get(seedA);
      const slotB = slotsBySeed.get(seedB);
      if (!slotA || !slotB) return null;

      const optionsA = resolveBracketSlotOptions(slotA, teamPool);
      const optionsB = resolveBracketSlotOptions(slotB, teamPool);
      const teamA = resolveBracketSlotTeam(slotA, teamPool);
      const teamB = resolveBracketSlotTeam(slotB, teamPool);
      const gameId = slotA.sourceGameId || slotB.sourceGameId || `${region.name}-${seedA}-${seedB}`;

      const resolvedSlotA: TournamentMatchupSlot = {
        seed: seedA,
        displayName: slotA.teamName,
        team: teamA,
        options: optionsA.length ? optionsA : [teamA],
        isPlayIn: Boolean(slotA.playInTeams?.length),
        playInGameId: slotA.playInGameId,
      };

      const resolvedSlotB: TournamentMatchupSlot = {
        seed: seedB,
        displayName: slotB.teamName,
        team: teamB,
        options: optionsB.length ? optionsB : [teamB],
        isPlayIn: Boolean(slotB.playInTeams?.length),
        playInGameId: slotB.playInGameId,
      };

      [resolvedSlotA, resolvedSlotB].forEach((slot) => {
        if (slot.team.statsCoverage === "none") {
          logBracketValidation("Official matchup side missing advanced stats", {
            region: region.name,
            gameId,
            team: slot.displayName,
            canonicalId: slot.team.canonicalId,
          });
        }
      });

      return {
        id: String(gameId),
        gameId: String(gameId),
        region: region.name,
        title: matchupTitle(resolvedSlotA, resolvedSlotB),
        teamA: resolvedSlotA,
        teamB: resolvedSlotB,
      } satisfies TournamentMatchup;
    }).filter((matchup): matchup is TournamentMatchup => Boolean(matchup));
  });
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
  const uniqueTeams = [...region.teams].filter((team, index, collection) => {
    const schoolKey = getCanonicalSchoolKey(team.name, team.abbreviation);
    return index === collection.findIndex((candidate) => getCanonicalSchoolKey(candidate.name, candidate.abbreviation) === schoolKey);
  });

  return uniqueTeams
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
    `Built from the live 2026 tournament bracket source in Joe Knows Ball.`,
  ].join("\n");
}
