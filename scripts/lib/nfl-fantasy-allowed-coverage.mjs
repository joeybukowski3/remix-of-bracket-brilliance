/**
 * Structural + cache-consistency checks for
 * public/data/nfl/fantasy-points-allowed.json. Every check here is a HARD
 * failure; provider-lag conditions are reported separately (as warnings) by
 * classifyPlayerWeekCoverage in nfl-allowed-by-position-coverage.mjs.
 *
 * "Represents the cache" means: for every team, sample and position, the
 * artifact's gamesSampled equals the number of defense games the refreshed
 * player-week cache actually contains -- so a stale or double-counted artifact
 * cannot ship.
 */
import { defenseGamesByTeam, rankProblems } from "./nfl-allowed-by-position-coverage.mjs";

export const FANTASY_ALLOWED_SCHEMA_VERSION = "nfl-fantasy-points-allowed-v2";
const SAMPLE_KEYS = ["2026", "2025", "last5", "last8"];
const ROLLING = { last5: 5, last8: 8 };
const POSITIONS = [["qb", "QB"], ["rb", "RB"], ["wr", "WR"], ["te", "TE"]];
const MAX_REG_GAMES = 17;

function expectedGames(byTeam, sampleKey, team) {
  if (sampleKey in ROLLING) return Math.min(ROLLING[sampleKey], byTeam.all.get(team)?.size ?? 0);
  return (sampleKey === "2025" ? byTeam.prior : byTeam.current).get(team)?.size ?? 0;
}

/**
 * Problems (empty when valid). `playerWeekRows` are the normalized rows for
 * the prior + current season the generator consumed; `teams` the canonical
 * 32 team ids.
 */
export function validateFantasyAllowedArtifact(artifact, { playerWeekRows, teams, season }) {
  const problems = [];
  if (!artifact || typeof artifact !== "object") return ["artifact is not an object"];
  if (artifact.schemaVersion !== FANTASY_ALLOWED_SCHEMA_VERSION) problems.push(`schemaVersion ${artifact.schemaVersion} != ${FANTASY_ALLOWED_SCHEMA_VERSION}`);
  if (artifact.season !== season) problems.push(`artifact season ${artifact.season} != ${season}`);
  if (!Number.isInteger(artifact.week) || artifact.week < 1) problems.push(`artifact week ${artifact.week} is not a positive integer`);
  if (!Array.isArray(artifact.rows)) return [...problems, "rows is not an array"];

  const rowTeams = artifact.rows.map((row) => row?.team);
  if (artifact.rows.length !== teams.length) problems.push(`expected ${teams.length} team rows, found ${artifact.rows.length}`);
  if (new Set(rowTeams).size !== rowTeams.length) problems.push("duplicate team rows");
  const missingTeams = teams.filter((team) => !rowTeams.includes(team));
  if (missingTeams.length) problems.push(`missing team rows: ${missingTeams.join(", ")}`);
  if (problems.length) return problems;

  for (const [key, position] of POSITIONS) {
    // Sample keys are the artifact's literal labels: "2026" = current season, "2025" = prior season.
    const byTeam = {
      all: defenseGamesByTeam(playerWeekRows, { position }),
      current: defenseGamesByTeam(playerWeekRows, { position, season }),
      prior: defenseGamesByTeam(playerWeekRows, { position, season: season - 1 }),
    };
    for (const sampleKey of SAMPLE_KEYS) {
      const label = `${sampleKey}/${key}`;
      const cells = [];
      for (const row of artifact.rows) {
        const sample = row.samples?.[sampleKey]?.[key];
        if (!sample) { problems.push(`${label} ${row.team}: missing sample`); continue; }
        const { gamesSampled, fantasyPointsAllowedTotal: total, fantasyPointsAllowedPerGame: perGame } = sample;
        if (!Number.isInteger(gamesSampled) || gamesSampled < 0 || gamesSampled > MAX_REG_GAMES) {
          problems.push(`${label} ${row.team}: impossible gamesSampled ${gamesSampled}`);
          continue;
        }
        const expected = expectedGames(byTeam, sampleKey, row.team);
        if (gamesSampled !== expected) problems.push(`${label} ${row.team}: ${gamesSampled} games sampled, player-week cache has ${expected}`);
        if (gamesSampled > 0 && (!Number.isFinite(total) || !Number.isFinite(perGame) || Math.abs(total / gamesSampled - perGame) > 0.011)) {
          problems.push(`${label} ${row.team}: per-game ${perGame} inconsistent with total ${total} / ${gamesSampled}`);
        }
        cells.push({ team: row.team, sample });
      }
      problems.push(...rankProblems(cells, label));
    }
  }
  return problems;
}

/** Per-team 2026 QB gamesSampled (every defense faces a QB each game) -- used for before/after diagnostics. */
export function currentSeasonGamesByTeam(artifact) {
  const key = String(artifact?.season);
  return new Map((artifact?.rows ?? []).map((row) => [row.team, row.samples?.[key]?.qb?.gamesSampled ?? 0]));
}
