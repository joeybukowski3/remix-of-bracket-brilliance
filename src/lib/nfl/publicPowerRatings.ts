/**
 * Public projection of nfl-power-v0.3.0 Stage-1 ratings.
 *
 * Exposes only fields safe for the public NFL power board.
 * Does not surface internalZ, historical trajectory internals,
 * context flags, manual adjustment governance, or uncertainty bands.
 *
 * Rating-state selection is driven by artifact validity and completed-game
 * data (see publicRatingState.ts), never by calendar date alone.
 */

import {
  evaluateFullSeasonPublicEligibility,
  isFullSeasonTeamPubliclyRated,
  selectPublicRatingState,
  type NflPublicRatingState,
  type NflPublicWindowType,
  type PublicRatingSelection,
} from "@/lib/nfl/publicRatingState";
import {
  deepFreeze,
  publicScaleEquivalent,
  validateNflV03ReviewArtifact,
  type NflV03FullSeasonArtifact,
  type NflV03FullSeasonTeam,
  type NflV03PreseasonArtifact,
  type NflV03PreseasonRating,
  type NflV03ReviewSeason,
} from "@/lib/nfl/v03Review";

export const NFL_V03_PUBLIC_MODEL_VERSION = "nfl-power-v0.3.0" as const;
export const NFL_V03_PUBLIC_PRESEASON_SEASON = 2026 as const satisfies NflV03ReviewSeason;
export const NFL_V03_PUBLIC_SCALE_CENTER = 50;
export const NFL_V03_PUBLIC_PRESEASON_FILENAME = "preseason-power-ratings.json";
export const NFL_V03_PUBLIC_FULL_SEASON_FILENAME = "full-season-team-metrics.json";
export const NFL_V03_PUBLIC_FORMULA =
  "40% opponent-adjusted offensive EPA/play + 40% inverted opponent-adjusted defensive EPA/play + 20% opponent-adjusted point differential/game · public scale 50 + 15 × (composite / 0.733), capped to [1, 99]";

/** Stage-1 files the public surface may reference. Review-only files are excluded. */
export const NFL_V03_PUBLIC_ALLOWED_ARTIFACT_FILES = Object.freeze([
  NFL_V03_PUBLIC_PRESEASON_FILENAME,
  NFL_V03_PUBLIC_FULL_SEASON_FILENAME,
] as const);

export type NflPublicPowerTeam = {
  teamId: string;
  slug: string;
  abbr: string;
  name: string;
  color: string;
  rank: number;
  publicRating: number;
  offenseRating: number;
  defenseRating: number;
  offRank: number;
  defRank: number;
  /** publicRating − 50 (scale center), for vs-center display mode */
  overallVsCenter: number;
  offenseVsCenter: number;
  defenseVsCenter: number;
  rankChange: number | null;
  ratingChange: number | null;
  /** Season record for the board's record column, e.g. "12-5" or "12-4-1" */
  sourceRecord: string | null;
};

export type NflPublicPowerBoard = {
  season: NflV03ReviewSeason;
  sourceSeason: number;
  selectedState: NflPublicRatingState;
  windowType: NflPublicWindowType;
  modelVersion: string;
  generatedAt: string;
  formula: string;
  completedTeamGames: number;
  ratedTeamCount: number;
  fallbackUsed: boolean;
  fallbackExplanation: string | null;
  title: string;
  subtitle: string;
  recordColumnLabel: string;
  teams: NflPublicPowerTeam[];
};

export type NflCanonicalTeamColor = {
  id: string;
  abbr: string;
  primaryColor: string;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatRecord(wins: number, losses: number, ties: number): string {
  if (ties > 0) return `${wins}-${losses}-${ties}`;
  return `${wins}-${losses}`;
}

function requirePublicRating(value: number | null, label: string): number {
  if (!isFiniteNumber(value)) {
    throw new Error(`Missing public scale value for ${label}`);
  }
  return value;
}

/** Rank 1 = best. Ties broken by name, then teamId (deterministic). */
export function rankByDescending(
  rows: readonly { key: string; value: number; name: string; teamId: string }[]
): Map<string, number> {
  const sorted = [...rows].sort(
    (a, b) =>
      b.value - a.value ||
      a.name.localeCompare(b.name) ||
      a.teamId.localeCompare(b.teamId)
  );
  return new Map(sorted.map((row, index) => [row.key, index + 1]));
}

export function buildRecordByAbbr(
  fullSeason: NflV03FullSeasonArtifact | null
): Map<string, string> {
  const map = new Map<string, string>();
  if (!fullSeason) return map;
  for (const team of fullSeason.teams) {
    if (
      !isFiniteNumber(team.wins) ||
      !isFiniteNumber(team.losses) ||
      !isFiniteNumber(team.ties)
    ) {
      continue;
    }
    map.set(team.abbr, formatRecord(team.wins, team.losses, team.ties));
  }
  return map;
}

export function buildColorByTeamId(
  teams: readonly NflCanonicalTeamColor[]
): Map<string, string> {
  return new Map(teams.map((team) => [team.id, team.primaryColor]));
}

function withUnitRanks(
  teams: Array<Omit<NflPublicPowerTeam, "offRank" | "defRank" | "rank"> & { rank?: number }>
): NflPublicPowerTeam[] {
  const offRanks = rankByDescending(
    teams.map((row) => ({
      key: row.teamId,
      value: row.offenseRating,
      name: row.name,
      teamId: row.teamId,
    }))
  );
  const defRanks = rankByDescending(
    teams.map((row) => ({
      key: row.teamId,
      value: row.defenseRating,
      name: row.name,
      teamId: row.teamId,
    }))
  );
  const overallRanks = rankByDescending(
    teams.map((row) => ({
      key: row.teamId,
      value: row.publicRating,
      name: row.name,
      teamId: row.teamId,
    }))
  );

  return teams
    .map((row) => ({
      ...row,
      rank: row.rank ?? overallRanks.get(row.teamId) ?? 32,
      offRank: offRanks.get(row.teamId) ?? 32,
      defRank: defRanks.get(row.teamId) ?? 32,
    }))
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.name.localeCompare(b.name) ||
        a.teamId.localeCompare(b.teamId)
    );
}

function projectPreseasonRating(
  row: NflV03PreseasonRating,
  color: string,
  sourceRecord: string | null
): Omit<NflPublicPowerTeam, "offRank" | "defRank"> {
  return {
    teamId: row.teamId,
    slug: row.slug,
    abbr: row.abbr,
    name: row.name,
    color,
    rank: row.rank,
    publicRating: row.publicRating,
    offenseRating: row.offenseRating,
    defenseRating: row.defenseRating,
    overallVsCenter: row.publicRating - NFL_V03_PUBLIC_SCALE_CENTER,
    offenseVsCenter: row.offenseRating - NFL_V03_PUBLIC_SCALE_CENTER,
    defenseVsCenter: row.defenseRating - NFL_V03_PUBLIC_SCALE_CENTER,
    rankChange: row.rankChange,
    ratingChange: row.ratingChange,
    sourceRecord,
  };
}

function projectFullSeasonTeam(
  team: NflV03FullSeasonTeam,
  color: string
): Omit<NflPublicPowerTeam, "offRank" | "defRank" | "rank"> {
  const publicRating = requirePublicRating(
    publicScaleEquivalent(team.adjustedComposite),
    `${team.abbr}.adjustedComposite`
  );
  const offenseRating = requirePublicRating(
    publicScaleEquivalent(team.metrics.offEpaPerPlay.zScore),
    `${team.abbr}.offense`
  );
  const defenseRating = requirePublicRating(
    publicScaleEquivalent(team.metrics.defEpaPerPlay.zScore),
    `${team.abbr}.defense`
  );
  const sourceRecord =
    isFiniteNumber(team.wins) &&
    isFiniteNumber(team.losses) &&
    isFiniteNumber(team.ties)
      ? formatRecord(team.wins, team.losses, team.ties)
      : null;

  return {
    teamId: team.teamId,
    slug: team.slug,
    abbr: team.abbr,
    name: team.name,
    color,
    publicRating,
    offenseRating,
    defenseRating,
    overallVsCenter: publicRating - NFL_V03_PUBLIC_SCALE_CENTER,
    offenseVsCenter: offenseRating - NFL_V03_PUBLIC_SCALE_CENTER,
    defenseVsCenter: defenseRating - NFL_V03_PUBLIC_SCALE_CENTER,
    rankChange: null,
    ratingChange: null,
    sourceRecord,
  };
}

function attachSelectionMeta(
  selection: PublicRatingSelection,
  teams: NflPublicPowerTeam[]
): NflPublicPowerBoard {
  if (!selection.modelVersion || !selection.generatedAt) {
    throw new Error("Selected rating state is missing model metadata");
  }
  return deepFreeze({
    season: selection.season,
    sourceSeason: selection.sourceSeason,
    selectedState: selection.selectedState,
    windowType: selection.windowType,
    modelVersion: selection.modelVersion,
    generatedAt: selection.generatedAt,
    formula: NFL_V03_PUBLIC_FORMULA,
    completedTeamGames: selection.completedTeamGames,
    ratedTeamCount: teams.length,
    fallbackUsed: selection.fallbackUsed,
    fallbackExplanation: selection.fallbackExplanation,
    title: selection.title,
    subtitle: selection.subtitle,
    recordColumnLabel: selection.recordColumnLabel,
    teams,
  });
}

/**
 * Map a validated preseason artifact (+ optional source-season records and colors)
 * into a frozen public power board. Strips all review-only fields.
 */
export function buildPublicPowerBoard(input: {
  season: NflV03ReviewSeason;
  preseason: NflV03PreseasonArtifact;
  sourceFullSeason?: NflV03FullSeasonArtifact | null;
  colors?: readonly NflCanonicalTeamColor[];
  selection?: PublicRatingSelection;
}): NflPublicPowerBoard {
  const { season, preseason } = input;
  if (preseason._meta.modelVersion !== NFL_V03_PUBLIC_MODEL_VERSION) {
    throw new Error(
      `Unexpected modelVersion ${preseason._meta.modelVersion}; expected ${NFL_V03_PUBLIC_MODEL_VERSION}`
    );
  }
  if (preseason._meta.season !== season) {
    throw new Error(
      `Preseason season mismatch: meta ${preseason._meta.season} vs requested ${season}`
    );
  }

  const colorById = buildColorByTeamId(input.colors ?? []);
  const recordByAbbr = buildRecordByAbbr(input.sourceFullSeason ?? null);

  const projected = preseason.ratings.map((row) =>
    projectPreseasonRating(
      row,
      colorById.get(row.teamId) ?? "#0c1f3a",
      recordByAbbr.get(row.abbr) ?? null
    )
  );
  const teams = withUnitRanks(projected);

  const selection =
    input.selection ??
    selectPublicRatingState(
      {
        season,
        preseason,
        fullSeason: null,
        fullSeasonLoadFailed: false,
      },
      NFL_V03_PUBLIC_MODEL_VERSION
    );

  return attachSelectionMeta(
    {
      ...selection,
      selectedState: "preseason",
      windowType: "preseason",
      sourceSeason: preseason.sourceSeason,
      modelVersion: preseason._meta.modelVersion,
      generatedAt: preseason._meta.generatedAt,
      ratedTeamCount: teams.length,
    },
    teams
  );
}

/**
 * Project a validated current-season full-season artifact into the public board.
 * Uses the same public scale transform as Stage-1 preseason ratings.
 */
export function buildFullSeasonPublicPowerBoard(input: {
  season: NflV03ReviewSeason;
  fullSeason: NflV03FullSeasonArtifact;
  colors?: readonly NflCanonicalTeamColor[];
  selection?: PublicRatingSelection;
}): NflPublicPowerBoard {
  const { season, fullSeason } = input;
  const eligibility = evaluateFullSeasonPublicEligibility(
    fullSeason,
    season,
    NFL_V03_PUBLIC_MODEL_VERSION
  );
  if (!eligibility.eligible) {
    throw new Error(
      `Full-season artifact is not eligible for public board (${eligibility.reason})`
    );
  }

  const colorById = buildColorByTeamId(input.colors ?? []);
  const rated = fullSeason.teams.filter(isFullSeasonTeamPubliclyRated);
  const projected = rated.map((team) =>
    projectFullSeasonTeam(team, colorById.get(team.teamId) ?? "#0c1f3a")
  );
  const teams = withUnitRanks(projected);

  const selection =
    input.selection ??
    selectPublicRatingState(
      {
        season,
        preseason: null,
        fullSeason,
        fullSeasonLoadFailed: false,
      },
      NFL_V03_PUBLIC_MODEL_VERSION
    );

  return attachSelectionMeta(
    {
      ...selection,
      selectedState: "full_season",
      windowType: "full_season",
      sourceSeason: season,
      modelVersion: fullSeason._meta.modelVersion,
      generatedAt: fullSeason._meta.generatedAt,
      completedTeamGames: eligibility.completedTeamGames,
      ratedTeamCount: teams.length,
      fallbackUsed: false,
      fallbackExplanation: null,
    },
    teams
  );
}

export function parseCanonicalTeamsJson(value: unknown): NflCanonicalTeamColor[] {
  if (!value || typeof value !== "object") {
    throw new Error("teams.json must be an object");
  }
  const teams = (value as { teams?: unknown }).teams;
  if (!Array.isArray(teams)) throw new Error("teams.json.teams must be an array");
  return teams.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`teams.json.teams[${index}] must be an object`);
    }
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.abbr !== "string") {
      throw new Error(`teams.json.teams[${index}] missing id/abbr`);
    }
    if (typeof row.primaryColor !== "string") {
      throw new Error(`teams.json.teams[${index}] missing primaryColor`);
    }
    return {
      id: row.id,
      abbr: row.abbr,
      primaryColor: row.primaryColor,
    };
  });
}

async function fetchJson(
  path: string,
  fetcher: typeof fetch,
  signal?: AbortSignal
): Promise<{ ok: true; json: unknown } | { ok: false; status: number; missing: boolean }> {
  const response = await fetcher(path, { cache: "no-store", signal });
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      missing: response.status === 404,
    };
  }
  return { ok: true, json: await response.json() };
}

/**
 * Load and select the public power board for a season.
 * Prefers eligible current-season full-season metrics; otherwise preseason.
 * Final-eight is never selected as the primary public board.
 */
export async function loadPublicPowerBoard(
  season: NflV03ReviewSeason = NFL_V03_PUBLIC_PRESEASON_SEASON,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<NflPublicPowerBoard> {
  const preseasonPath = `/data/nfl/${season}/${NFL_V03_PUBLIC_PRESEASON_FILENAME}`;
  const fullSeasonPath = `/data/nfl/${season}/${NFL_V03_PUBLIC_FULL_SEASON_FILENAME}`;
  const teamsPath = "/data/nfl/teams.json";

  const [preseasonResult, fullSeasonResult, teamsResult] = await Promise.all([
    fetchJson(preseasonPath, fetcher, signal),
    fetchJson(fullSeasonPath, fetcher, signal),
    fetchJson(teamsPath, fetcher, signal),
  ]);

  if (!teamsResult.ok) {
    throw new Error(
      teamsResult.missing
        ? `${teamsPath} is missing`
        : `${teamsPath} returned HTTP ${teamsResult.status}`
    );
  }
  const colors = parseCanonicalTeamsJson(teamsResult.json);

  let preseason: NflV03PreseasonArtifact | null = null;
  let preseasonError: string | null = null;
  if (preseasonResult.ok) {
    try {
      preseason = validateNflV03ReviewArtifact(
        "preseason",
        season,
        preseasonResult.json,
        preseasonPath
      );
    } catch (error) {
      preseasonError =
        error instanceof Error ? error.message : "Preseason artifact failed validation";
    }
  } else if (!preseasonResult.missing) {
    preseasonError = `${preseasonPath} returned HTTP ${preseasonResult.status}`;
  } else {
    preseasonError = `${preseasonPath} is missing`;
  }

  let fullSeason: NflV03FullSeasonArtifact | null = null;
  let fullSeasonLoadFailed = false;
  if (fullSeasonResult.ok) {
    try {
      fullSeason = validateNflV03ReviewArtifact(
        "fullSeason",
        season,
        fullSeasonResult.json,
        fullSeasonPath
      );
    } catch {
      fullSeason = null;
      fullSeasonLoadFailed = true;
    }
  } else if (!fullSeasonResult.missing) {
    fullSeasonLoadFailed = true;
  }

  const selection = selectPublicRatingState(
    {
      season,
      preseason,
      fullSeason,
      fullSeasonLoadFailed,
    },
    NFL_V03_PUBLIC_MODEL_VERSION
  );

  if (selection.selectedState === "full_season" && fullSeason) {
    return buildFullSeasonPublicPowerBoard({
      season,
      fullSeason,
      colors,
      selection,
    });
  }

  if (!preseason) {
    throw new Error(preseasonError ?? `${preseasonPath} is unavailable`);
  }

  // Optional: load prior-season full-season only for preseason record column.
  let sourceFullSeason: NflV03FullSeasonArtifact | null = null;
  const sourceSeason = preseason.sourceSeason;
  if (
    Number.isInteger(sourceSeason) &&
    sourceSeason >= 2022 &&
    sourceSeason <= 2026
  ) {
    const sourcePath = `/data/nfl/${sourceSeason}/${NFL_V03_PUBLIC_FULL_SEASON_FILENAME}`;
    const sourceResult = await fetchJson(sourcePath, fetcher, signal);
    if (sourceResult.ok) {
      try {
        sourceFullSeason = validateNflV03ReviewArtifact(
          "fullSeason",
          sourceSeason as NflV03ReviewSeason,
          sourceResult.json,
          sourcePath
        );
      } catch {
        sourceFullSeason = null;
      }
    }
  }

  return buildPublicPowerBoard({
    season,
    preseason,
    sourceFullSeason,
    colors,
    selection,
  });
}
