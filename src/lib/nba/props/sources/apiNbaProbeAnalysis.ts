/**
 * Structural coverage analysis of one probe run's raw bodies: season coverage,
 * minutes precision, DNP rows, box reconciliation, pagination and quota delta.
 *
 * Deliberately NOT a normalization into canonical tables: the api-sports-nba
 * license record permits no use, so `normalizePayloads` stays closed. Canonical
 * normalization is covered by synthetic tests until a license decision.
 * Output holds counts and ids only, never player names or stat lines.
 */
import { parseApiSportsStatusBody } from "../../../api-quota/providers";
import { easternDate, isDidNotPlay, parseEnvelope, parseApiNbaMinutes, type ApiNbaEnvelope, type ApiNbaGame, type ApiNbaPlayerStat, type ApiNbaTeamStat, type MinutesFormat } from "./apiNba";

interface StepLike {
  stepId: string;
  httpStatus: number | null;
  outcome: string;
  detail: string | null;
  unitsCharged: number;
}

export interface SeasonCoverage {
  season: number;
  outcome: string;
  detail: string | null;
  results: number | null;
  paging: unknown;
  byStage: Record<string, number>;
  finishedStage2: number;
  firstDate: string | null;
  lastDate: string | null;
}

export interface ProbeAnalysis {
  status: { initial: StatusSummary | null; final: StatusSummary | null };
  seasonsListed: number[] | null;
  seasonCoverage: SeasonCoverage[];
  probeGameId: number | null;
  gameBox: {
    playerRows: number;
    minutesFormats: Record<MinutesFormat, number>;
    dnpRows: number;
    teamMinuteTotals: Record<string, number>;
    expectedTeamMinutes: number | null;
    playerPointsByTeam: Record<string, number>;
    teamBoxPoints: Record<string, number>;
    gameScore: Record<string, number | null>;
    paging: unknown;
  } | null;
  teamSeason: { rows: number; distinctGames: number; includesProbeGame: boolean; probeGameRowsMatch: boolean | null; paging: unknown } | null;
  quota: { baselineUsed: number | null; finalUsed: number | null; delta: number | null; requestsAttempted: number; unitsCharged: number; interpretation: string };
  normalization: string;
}

interface StatusSummary {
  plan: string | null;
  active: boolean | null;
  used: number | null;
  limit: number | null;
}

function envelope(body: string | undefined): ApiNbaEnvelope | null {
  if (!body) return null;
  const parsed = parseEnvelope(body);
  return "error" in parsed ? null : parsed.envelope;
}

function status(body: string | undefined): StatusSummary | null {
  if (!body) return null;
  const s = parseApiSportsStatusBody(body, new Date(0).toISOString());
  return { plan: s.plan, active: s.active, used: s.snapshot?.used ?? null, limit: s.snapshot?.limit ?? null };
}

function seasonCoverage(season: number, body: string | undefined, step: StepLike | undefined): SeasonCoverage | null {
  if (!step) return null;
  const env = envelope(body);
  const games = (env?.response ?? []) as ApiNbaGame[];
  const byStage: Record<string, number> = {};
  for (const g of games) byStage[String(g.stage)] = (byStage[String(g.stage)] ?? 0) + 1;
  const dates = games.map((g) => g.date?.start).filter((d): d is string => typeof d === "string").sort();
  return {
    season,
    outcome: step.outcome,
    detail: step.detail,
    results: env ? games.length : null,
    paging: env?.paging ?? null,
    byStage,
    finishedStage2: games.filter((g) => g.stage === 2 && g.scores?.home?.points != null && g.scores?.visitors?.points != null).length,
    firstDate: dates[0] ? easternDate(dates[0]) : null,
    lastDate: dates.at(-1) ? easternDate(dates.at(-1)!) : null,
  };
}

const sumBy = <T>(items: readonly T[], key: (t: T) => string, value: (t: T) => number) =>
  items.reduce<Record<string, number>>((acc, item) => ({ ...acc, [key(item)]: (acc[key(item)] ?? 0) + value(item) }), {});

function quotaInterpretation(delta: number | null, nonStatusCalls: number): string {
  if (delta === null) return "UNKNOWN: initial or final /status missing";
  if (delta === nonStatusCalls) return "consistent with every data call counting and /status NOT counting";
  if (delta === nonStatusCalls + 1) return "consistent with every call counting, including /status";
  return `UNEXPECTED: provider delta ${delta} vs ${nonStatusCalls} data call(s) between the two /status reads`;
}

export function analyzeProbe(bodies: ReadonlyMap<string, string>, steps: readonly StepLike[]): ProbeAnalysis {
  const stepById = new Map(steps.map((s) => [s.stepId, s]));
  const initial = status(bodies.get("status-initial"));
  const final = status(bodies.get("status-final"));
  const seasonsEnv = envelope(bodies.get("seasons"));
  const coverage = [2023, 2024, 2025, 2026]
    .map((season) => seasonCoverage(season, bodies.get(`games-${season}`), stepById.get(`games-${season}`)))
    .filter((c): c is SeasonCoverage => c !== null);

  const playerEnv = envelope(bodies.get("player-stats-game"));
  const teamEnv = envelope(bodies.get("team-stats-game"));
  const playerRows = (playerEnv?.response ?? []) as ApiNbaPlayerStat[];
  const teamRows = (teamEnv?.response ?? []) as ApiNbaTeamStat[];
  const probeGameId = playerRows[0]?.game?.id ?? null;
  const game = ((envelope(bodies.get("games-2023"))?.response ?? []) as ApiNbaGame[]).find((g) => g.id === probeGameId);
  const played = playerRows.filter((r) => !isDidNotPlay(r));
  const formats: Record<MinutesFormat, number> = { "minutes-seconds": 0, "whole-minutes": 0, absent: 0, unparseable: 0 };
  for (const r of playerRows) formats[parseApiNbaMinutes(r.min).format] += 1;
  const periods = game?.periods?.total ?? null;

  const seasonEnv = envelope(bodies.get("player-stats-team-season"));
  const seasonRows = (seasonEnv?.response ?? []) as ApiNbaPlayerStat[];
  const seasonGameRows = probeGameId === null ? [] : seasonRows.filter((r) => r.game?.id === probeGameId);
  const teamId = game?.teams.home.id;
  const gameRowsForTeam = playerRows.filter((r) => r.team?.id === teamId);

  const requestsAttempted = steps.filter((s) => s.outcome !== "denied").length;
  const nonStatusCalls = steps.filter((s) => s.outcome !== "denied" && !s.stepId.startsWith("status-")).length;
  const delta = initial?.used != null && final?.used != null ? final.used - initial.used : null;

  return {
    status: { initial, final },
    seasonsListed: seasonsEnv ? (seasonsEnv.response as number[]) : null,
    seasonCoverage: coverage,
    probeGameId,
    gameBox: playerEnv
      ? {
          playerRows: playerRows.length,
          minutesFormats: formats,
          dnpRows: playerRows.length - played.length,
          teamMinuteTotals: sumBy(played, (r) => String(r.team.id), (r) => parseApiNbaMinutes(r.min).minutes ?? 0),
          expectedTeamMinutes: periods === null ? null : 240 + 25 * Math.max(0, periods - 4),
          playerPointsByTeam: sumBy(played, (r) => String(r.team.id), (r) => Number(r.points ?? 0)),
          teamBoxPoints: Object.fromEntries(teamRows.map((t) => [String(t.team.id), Number(t.statistics?.[0]?.points ?? NaN)])),
          gameScore: game ? { [String(game.teams.home.id)]: game.scores?.home?.points ?? null, [String(game.teams.visitors.id)]: game.scores?.visitors?.points ?? null } : {},
          paging: playerEnv.paging ?? null,
        }
      : null,
    teamSeason: seasonEnv
      ? {
          rows: seasonRows.length,
          distinctGames: new Set(seasonRows.map((r) => r.game?.id)).size,
          includesProbeGame: seasonGameRows.length > 0,
          probeGameRowsMatch: playerEnv ? seasonGameRows.length === gameRowsForTeam.length : null,
          paging: seasonEnv.paging ?? null,
        }
      : null,
    quota: {
      baselineUsed: initial?.used ?? null,
      finalUsed: final?.used ?? null,
      delta,
      requestsAttempted,
      unitsCharged: steps.reduce((sum, s) => sum + s.unitsCharged, 0),
      interpretation: quotaInterpretation(delta, nonStatusCalls),
    },
    normalization: "DEFERRED: api-sports-nba license permits no use; canonical normalization is validated with synthetic payloads only",
  };
}
