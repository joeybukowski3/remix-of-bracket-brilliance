/** Generates the canonical production weekly fantasy artifact. No UI consumer is modified here. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getMatchupGrade } from "../src/lib/fantasy/matchupGrade.ts";
import { normalizeFantasyAvailability } from "../src/lib/fantasy/weekly/availability.ts";
import { deriveImpliedTeamTotals } from "../src/lib/fantasy/weekly/impliedTeamTotals.ts";
import { normalizeNflTeamAbbr } from "../src/lib/fantasy/weekly/identity.ts";
import { resolveProductionProjectionIdentity, type ProductionIdentitySourceRow } from "../src/lib/fantasy/weekly/productionIdentity.ts";
import { assertProductionHistoryCutoff, buildWeeklyFantasyRankingArtifact, weeklyFantasyRankingArtifactSchema, type ProductionRankingCandidate, type WeeklyFantasyRanking } from "../src/lib/fantasy/weekly/productionAuthority.ts";
import type { HistoricalPlayerWeek } from "../src/lib/fantasy/weekly/history.ts";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";
import { writeWeeklyFantasyArtifactAtomic } from "./lib/fantasy-weekly-artifact-io.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const POSITIONS = ["QB", "RB", "WR", "TE"] as const;
const PAR_INPUT_AS_OF = "2026-08-16T16:13:26.000Z";

type CsvRow = Record<string, string>;
type ManifestEntry = { season: number | null; filename: string; retrievedDateUtc: string; sha256: string; [key: string]: unknown };
type Manifest = { schemaVersion: string; files: ManifestEntry[] };
type ParRow = { Player: string; Team: string; Position: string; "2026 Projected PPG": number; "Source ID": string; "Consensus Position Rank": number };
type Game = { gameId: string; season: number; week: number; seasonType: string; homeAbbr: string; awayAbbr: string; neutralSite: boolean };
type MarketGame = { gameId: string; homeAbbr: string; awayAbbr: string; neutralSite: boolean; total: number | null; spread: { home: number | null; away: number | null } };

function sha(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }
function isoDate(value: string) { return `${value}T00:00:00.000Z`; }
function readJson<T>(path: string): T { return JSON.parse(readFileSync(path, "utf8")) as T; }
function parseArgs(argv: string[]) {
  const result: { season: number; week: number; generatedAt: string; output: string | null; history: string | null } = {
    season: 2026, week: 1, generatedAt: new Date().toISOString(), output: null, history: null,
  };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--season=")) result.season = Number(raw.slice(9));
    else if (raw.startsWith("--week=")) result.week = Number(raw.slice(7));
    else if (raw.startsWith("--generated-at=")) result.generatedAt = raw.slice(15);
    else if (raw.startsWith("--output=")) result.output = resolve(ROOT, raw.slice(9));
    else if (raw.startsWith("--history=")) result.history = resolve(ROOT, raw.slice(10));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (result.season !== 2026) throw new Error("V1 production ROS authority is defined for 2026 only.");
  if (!Number.isInteger(result.week) || result.week < 1 || result.week > 18) throw new Error("--week must be 1-18.");
  if (Number.isNaN(Date.parse(result.generatedAt))) throw new Error("--generated-at must be ISO.");
  if (result.week > 1 && !result.history) throw new Error("Weeks 2-18 require --history with a verified 2026 player-week artifact.");
  result.output ??= join(ROOT, "public", "data", "fantasy", "weekly", String(result.season), `week-${String(result.week).padStart(2, "0")}.json`);
  return result;
}

function verifiedCsv(relativeDirectory: string, season: number | null) {
  const directory = join(ROOT, relativeDirectory);
  const manifestPath = join(directory, "manifest.json");
  const manifest = readJson<Manifest>(manifestPath);
  const entry = manifest.files.find((candidate) => candidate.season === season);
  if (!entry) throw new Error(`Missing ${relativeDirectory} manifest entry for ${season ?? "league"}.`);
  const path = join(directory, entry.filename);
  const text = readFileSync(path, "utf8");
  const problems = verifyCacheEntry(entry, text);
  if (problems.length) throw new Error(problems.join("\n"));
  return { rows: parseCsv(text) as CsvRow[], entry, manifest, path, hash: sha(text) };
}

function pointsAllowed() {
  const path = join(ROOT, "data", "fantasy", "points-allowed-2025.csv");
  const rows = parseCsv(readFileSync(path, "utf8")) as CsvRow[];
  const teamNames: Record<string, string> = {
    "Arizona Cardinals":"ari","Atlanta Falcons":"atl","Baltimore Ravens":"bal","Buffalo Bills":"buf","Carolina Panthers":"car","Chicago Bears":"chi","Cincinnati Bengals":"cin","Cleveland Browns":"cle","Dallas Cowboys":"dal","Denver Broncos":"den","Detroit Lions":"det","Green Bay Packers":"gb","Houston Texans":"hou","Indianapolis Colts":"ind","Jacksonville Jaguars":"jax","Kansas City Chiefs":"kc","Los Angeles Chargers":"lac","Los Angeles Rams":"lar","Las Vegas Raiders":"lv","Miami Dolphins":"mia","Minnesota Vikings":"min","New England Patriots":"ne","New Orleans Saints":"no","New York Giants":"nyg","New York Jets":"nyj","Philadelphia Eagles":"phi","Pittsburgh Steelers":"pit","San Francisco 49ers":"sf","Seattle Seahawks":"sea","Tampa Bay Buccaneers":"tb","Tennessee Titans":"ten","Washington Commanders":"wsh",
  };
  return { path, hash: sha(readFileSync(path)), byTeam: new Map(rows.flatMap((row) => teamNames[row.TEAM] ? [[teamNames[row.TEAM], row] as const] : [])) };
}

function main() {
  const options = parseArgs(process.argv);
  const parPath = join(ROOT, "data", "fantasy", "2026-par-consensus.json");
  const parText = readFileSync(parPath, "utf8");
  const par = JSON.parse(parText) as ParRow[];
  const players = verifiedCsv("data/nfl/nflverse/players", null);
  const roster = verifiedCsv("data/nfl/nflverse/weekly-rosters", options.season);
  const rosterRows = roster.rows.filter((row) => Number(row.week) === options.week && String(row.game_type).toUpperCase() === "REG");
  if (!rosterRows.length) throw new Error(`Verified roster contains no 2026 Week ${options.week} rows.`);

  const schedulePath = join(ROOT, "public", "data", "nfl", String(options.season), "games.json");
  const scheduleText = readFileSync(schedulePath, "utf8");
  const schedule = JSON.parse(scheduleText) as { _meta: { generatedAt: string; schemaVersion: string }; games: Game[] };
  const weekGames = schedule.games.filter((game) => game.season === options.season && game.week === options.week && game.seasonType === "REG");
  if (!weekGames.length) throw new Error(`Schedule contains no 2026 Week ${options.week} games.`);
  const gamesByTeam = new Map<string, Game>();
  for (const game of weekGames) { gamesByTeam.set(game.homeAbbr, game); gamesByTeam.set(game.awayAbbr, game); }

  const marketPath = join(ROOT, "public", "data", "nfl", "matchup-market.json");
  const marketText = readFileSync(marketPath, "utf8");
  const market = JSON.parse(marketText) as { _meta: { generatedAt: string; schemaVersion: string }; currentMarket: Record<string, MarketGame> };
  const epaPath = join(ROOT, "public", "data", "nfl", "matchup-epa.json");
  const epaText = readFileSync(epaPath, "utf8");
  const epa = JSON.parse(epaText) as { _meta: { generatedAt: string; schemaVersion: string }; windows: Record<string, { teams: Record<string, { metrics: Record<string, [number, number]> }> }> };
  const fpa = pointsAllowed();

  const identityPlayers: ProductionIdentitySourceRow[] = players.rows.map((row) => ({
    gsisId: row.gsis_id || null, pfrId: row.pfr_id || null, playerName: row.display_name,
    position: row.position, team: row.team_abbr || null, status: row.status || null,
  }));
  const identityRoster: ProductionIdentitySourceRow[] = rosterRows.map((row) => ({
    gsisId: row.gsis_id || null, pfrId: row.pfr_id || null, playerName: row.full_name,
    position: row.position, team: row.team || null, status: row.status || null,
  }));
  let historicalRows: HistoricalPlayerWeek[] = [];
  let historyHash: string | null = null;
  let historyInputAsOf: string | null = null;
  if (options.history) {
    const text = readFileSync(options.history, "utf8");
    const artifact = JSON.parse(text) as { _meta?: { sourceAsOf?: string }; rows?: HistoricalPlayerWeek[] };
    assertProductionHistoryCutoff(artifact.rows ?? [], { season: options.season, week: options.week });
    historicalRows = (artifact.rows ?? []).filter((row) => row.season === options.season && row.week < options.week);
    historyHash = sha(text);
    historyInputAsOf = artifact._meta?.sourceAsOf ?? options.generatedAt;
  }
  const historyByPlayer = new Map<string, HistoricalPlayerWeek[]>();
  for (const row of historicalRows) historyByPlayer.set(row.playerId, [...(historyByPlayer.get(row.playerId) ?? []), row]);
  const previousByPlayer = new Map<string, WeeklyFantasyRanking>();
  let previousArtifactProvenance: { source: string; sourceVersion: string; sourceHash: string; inputAsOf: string } | null = null;
  let previousArtifactMissing = false;
  if (options.week > 1) {
    const previousPath = join(ROOT, "public", "data", "fantasy", "weekly", String(options.season), `week-${String(options.week - 1).padStart(2, "0")}.json`);
    if (existsSync(previousPath)) {
      const previousText = readFileSync(previousPath, "utf8");
      const previous = weeklyFantasyRankingArtifactSchema.parse(JSON.parse(previousText));
      if (previous.season !== options.season || previous.week !== options.week - 1) throw new Error("Previous weekly artifact has the wrong season/week.");
      for (const row of Object.values(previous.rankings).flat()) previousByPlayer.set(row.playerId, row);
      previousArtifactProvenance = { source: previousPath, sourceVersion: previous.authorityVersion, sourceHash: sha(previousText), inputAsOf: previous.inputAsOf };
    } else previousArtifactMissing = true;
  }

  const candidates: ProductionRankingCandidate[] = par.filter((row) => POSITIONS.includes(row.Position as typeof POSITIONS[number])).map((row) => {
    const resolution = resolveProductionProjectionIdentity({
      projection: { sourceId: row["Source ID"], playerName: row.Player, position: row.Position as typeof POSITIONS[number], team: row.Team },
      rosterRows: identityRoster, playerRows: identityPlayers,
    });
    const weeklyRoster = resolution.roster ? rosterRows.find((candidate) =>
      String(candidate.gsis_id || "") === String(resolution.roster?.gsisId || "") &&
      candidate.full_name === resolution.roster?.playerName && candidate.position === resolution.roster?.position &&
      normalizeNflTeamAbbr(candidate.team) === normalizeNflTeamAbbr(resolution.roster?.team)) : undefined;
    const gsis = String(resolution.gsisId || "");
    const playerId = gsis ? `gsis:${gsis}` : null;
    const team = normalizeNflTeamAbbr(weeklyRoster?.team);
    const game = team ? gamesByTeam.get(team) : undefined;
    const opponent = game && team ? (game.homeAbbr === team ? game.awayAbbr : game.homeAbbr) : null;
    const homeAway = !team ? "unknown" : !game ? "bye" : game.neutralSite ? "neutral" : game.homeAbbr === team ? "home" : "away";
    const availability = normalizeFantasyAvailability({
      rosterStatus: weeklyRoster?.status ?? null, sourceSeason: weeklyRoster ? options.season : null,
      sourceWeek: weeklyRoster ? options.week : null, sourceAsOf: weeklyRoster ? isoDate(roster.entry.retrievedDateUtc) : null,
    }, { season: options.season, week: options.week, generatedAt: options.generatedAt });
    const prior = playerId ? (historyByPlayer.get(playerId) ?? []) : [];
    const currentPpg = prior.length ? prior.reduce((sum, value) => sum + value.actualFantasyPoints, 0) / prior.length : null;
    const previous = playerId ? previousByPlayer.get(playerId) : undefined;
    const marketGame = game ? market.currentMarket[game.gameId] : null;
    const totals = marketGame ? deriveImpliedTeamTotals(marketGame, { source: "nflverse current market context", generatedAt: market._meta.generatedAt, perRowTimestampAvailable: false }) : null;
    const fpaRow = opponent ? fpa.byTeam.get(opponent) : undefined;
    const position = row.Position as typeof POSITIONS[number];
    const fpaRank = fpaRow ? Number(fpaRow[`${position} RK`]) : null;
    const fantasyPointsAllowed = fpaRow ? Number(fpaRow[`${position} PA`]) : null;
    const teamEpa = team ? epa.windows["season-blend"]?.teams[team]?.metrics : undefined;
    const baseline = { rank: row["Consensus Position Rank"], projectedPpg: row["2026 Projected PPG"], source: "data/fantasy/2026-par-consensus.json", sourceVersion: "2026-par-consensus", sourceHash: sha(parText), inputAsOf: PAR_INPUT_AS_OF };
    return {
      playerKey: `pfr:${row["Source ID"]}`,
      identity: { resolved: resolution.resolved && Boolean(playerId && weeklyRoster), playerId, playerName: row.Player, position }, team, opponent, homeAway, availability,
      historyGames: prior.length, preseasonRos: baseline,
      currentSeason: currentPpg == null ? null : { rank: 1, projectedPpg: currentPpg, source: options.history!, sourceVersion: "verified-player-week-history", sourceHash: historyHash!, inputAsOf: historyInputAsOf! },
      historicalFallback: null,
      context: {
        matchupGrade: getMatchupGrade(fpaRank)?.label ?? null, fpaRank, fantasyPointsAllowed,
        marketTotal: marketGame?.total ?? null,
        impliedTeamTotal: totals && team ? (game!.homeAbbr === team ? totals.home : totals.away) : null,
        teamEnvironment: {
          offensiveEpaPerPlay: teamEpa?.["off.epaPerPlay"]?.[0] ?? null,
          passingEpaPerPlay: teamEpa?.["off.epaPerPass"]?.[0] ?? null,
          rushingEpaPerPlay: teamEpa?.["off.epaPerRush"]?.[0] ?? null,
        },
      },
      previousRank: previous?.positionRank ?? null,
      previousAuthority: previous?.baselineAuthority ?? null,
    };
  });

  const provenance = [
    { source: "data/fantasy/2026-par-consensus.json", sourceVersion: "2026-par-consensus", sourceHash: sha(parText), inputAsOf: PAR_INPUT_AS_OF },
    { source: "nflverse players cache", sourceVersion: players.manifest.schemaVersion, sourceHash: players.hash, inputAsOf: isoDate(players.entry.retrievedDateUtc) },
    { source: "nflverse weekly roster cache", sourceVersion: roster.manifest.schemaVersion, sourceHash: roster.hash, inputAsOf: isoDate(roster.entry.retrievedDateUtc) },
    { source: "public/data/nfl/2026/games.json", sourceVersion: schedule._meta.schemaVersion, sourceHash: sha(scheduleText), inputAsOf: schedule._meta.generatedAt },
    { source: "2025 FantasyPros points allowed context", sourceVersion: "points-allowed-2025", sourceHash: fpa.hash, inputAsOf: PAR_INPUT_AS_OF },
    { source: "public/data/nfl/matchup-market.json", sourceVersion: market._meta.schemaVersion, sourceHash: sha(marketText), inputAsOf: market._meta.generatedAt },
    { source: "public/data/nfl/matchup-epa.json", sourceVersion: epa._meta.schemaVersion, sourceHash: sha(epaText), inputAsOf: epa._meta.generatedAt },
    ...(options.history ? [{ source: options.history, sourceVersion: "verified-player-week-history", sourceHash: historyHash!, inputAsOf: historyInputAsOf! }] : []),
    ...(previousArtifactProvenance ? [previousArtifactProvenance] : []),
  ];
  const inputAsOf = provenance.map((row) => row.inputAsOf).sort().at(-1)!;
  if (Date.parse(inputAsOf) > Date.parse(options.generatedAt)) throw new Error("A source inputAsOf is later than generatedAt.");
  const artifact = buildWeeklyFantasyRankingArtifact({
    season: options.season, week: options.week, generatedAt: options.generatedAt, inputAsOf,
    candidates, provenance,
    missingSources: [
      "2026 nflverse injury report (not cached; roster status used without numeric penalty)",
      ...(previousArtifactMissing ? ["previous weekly ranking artifact (rank-movement diagnostics unavailable)"] : []),
    ],
    staleSources: [],
  });
  for (const position of POSITIONS) if (!artifact.rankings[position].length) throw new Error(`${position} produced no eligible rankings.`);
  writeWeeklyFantasyArtifactAtomic(options.output!, artifact);
  console.log(JSON.stringify({ output: options.output, rows: Object.fromEntries(POSITIONS.map((position) => [position, artifact.rankings[position].length])), diagnostics: artifact.diagnostics }, null, 2));
}

main();
