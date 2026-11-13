import { describe, expect, it } from "vitest";
import { resolveCurrentWeekDetailed } from "./nfl-current-week.mjs";
import {
  checkArtifacts,
  checkCurrentWeek,
  checkFileSizes,
  checkOpponents,
  checkProduction,
  checkScheduleConsistency,
  checkUpstreamParity,
  checkWeekCoverage,
  checkWorkflowHealth,
  summarizeFindings,
} from "./nfl-freshness.mjs";
import { CRITICAL_WORKFLOWS, PRODUCTION_ARTIFACT_IDS, artifactRegistry } from "./nfl-freshness-registry.mjs";

const HOUR = 3600e3;
const game = (id, week, dateUtc, status, home = "aaa", away = "bbb") => ({ gameId: id, season: 2026, seasonType: "REG", week, dateUtc, status, homeAbbr: home, awayAbbr: away });
const result = (id, week, home = 20, away = 10) => ({ gameId: id, season: 2026, week, seasonType: "REG", final: true, homeScore: home, awayScore: away });
const at = (iso) => new Date(iso);

// Mirrors the 2026-11-12 incident: Week 9 played, only one final committed.
const GAMES_STALE = [
  game("2026_08_A_B", 8, "2026-11-02T01:15:00Z", "final", "b", "a"),
  game("2026_09_JAX_BAL", 9, "2026-11-06T01:15:00Z", "final", "bal", "jax"),
  game("2026_09_CIN_ATL", 9, "2026-11-08T18:00:00Z", "scheduled", "atl", "cin"),
  game("2026_09_DAL_IND", 9, "2026-11-08T18:00:00Z", "scheduled", "ind", "dal"),
  game("2026_10_X_Y", 10, "2026-11-13T01:15:00Z", "scheduled", "y", "x"),
];
const RESULTS_STALE = [result("2026_08_A_B", 8), result("2026_09_JAX_BAL", 9)];
const NOW = at("2026-11-12T15:00:00Z");

const upstreamOf = (games, results) => ({ games, results });
const UPSTREAM_CURRENT = upstreamOf(
  GAMES_STALE.map((g) => (g.week === 9 ? { ...g, status: "final" } : g)),
  [...RESULTS_STALE, result("2026_09_CIN_ATL", 9), result("2026_09_DAL_IND", 9)],
);

const find = (findings, id) => findings.find((f) => f.id === id);

describe("checkScheduleConsistency", () => {
  it("is ok when finals and results agree", () => {
    const games = [game("g1", 1, "2026-09-10T00:20:00Z", "final")];
    expect(checkScheduleConsistency({ games, results: [result("g1", 1)], now: NOW })[0]).toMatchObject({ severity: "ok" });
  });

  it("fails when a final game has no result and when a result has no final game", () => {
    const games = [game("g1", 1, "2026-09-10T00:20:00Z", "final"), game("g2", 1, "2026-09-13T17:00:00Z", "scheduled")];
    const findings = checkScheduleConsistency({ games, results: [result("g2", 1)], now: NOW });
    const bad = find(findings, "schedule-results-consistency");
    expect(bad).toMatchObject({ severity: "fail", category: "inconsistent_data" });
    expect(bad.evidence.finalWithoutResult).toEqual(["g1"]);
    expect(bad.evidence.resultWithoutFinal).toEqual(["g2"]);
  });

  it("flags scheduled games far past kickoff as overdue (the Nov 12 symptom)", () => {
    const findings = checkScheduleConsistency({ games: GAMES_STALE, results: RESULTS_STALE, now: NOW });
    const overdue = find(findings, "overdue-scheduled-games");
    expect(overdue).toMatchObject({ severity: "fail", category: "stale_artifact" });
    expect(overdue.evidence.count).toBe(2);
  });
});

describe("overdue games are attributed to upstream when upstream has not scored them either", () => {
  const lagging = upstreamOf(GAMES_STALE, RESULTS_STALE); // upstream equally behind

  it("classifies overdue scheduled games as upstream_lag (warn) when upstream is also missing them", () => {
    const f = find(checkScheduleConsistency({ games: GAMES_STALE, results: RESULTS_STALE, now: NOW, upstream: lagging }), "overdue-scheduled-games");
    expect(f).toMatchObject({ severity: "warn", category: "upstream_lag" });
    expect(f.message).toMatch(/upstream/i);
  });

  it("stays a stale_artifact failure when upstream HAS scored any of the overdue games", () => {
    const f = find(checkScheduleConsistency({ games: GAMES_STALE, results: RESULTS_STALE, now: NOW, upstream: UPSTREAM_CURRENT }), "overdue-scheduled-games");
    expect(f).toMatchObject({ severity: "fail", category: "stale_artifact" });
  });

  it("stays a stale_artifact failure when upstream state is unknown (cannot excuse it)", () => {
    const f = find(checkScheduleConsistency({ games: GAMES_STALE, results: RESULTS_STALE, now: NOW, upstream: null }), "overdue-scheduled-games");
    expect(f).toMatchObject({ severity: "fail", category: "stale_artifact" });
  });

  it("attributes a calendar-fallback current week to upstream lag when upstream is equally behind", () => {
    const { finding } = checkCurrentWeek({ games: GAMES_STALE, now: NOW, upstream: lagging });
    expect(finding).toMatchObject({ severity: "warn", category: "upstream_lag" });
    const stale = checkCurrentWeek({ games: GAMES_STALE, now: NOW, upstream: UPSTREAM_CURRENT });
    expect(stale.finding).toMatchObject({ severity: "fail", category: "stale_artifact" });
  });
});

describe("grace for the once-a-day results refresh (no false alarms right after a game day)", () => {
  // Sunday 18:00Z game: window ends 06:00Z Monday. Results refresh at 06:10 ET (~10:10Z) once a day.
  const sunday = [game("g_sun", 9, "2026-11-08T18:00:00Z", "scheduled", "h", "a"), game("g_next", 10, "2026-11-15T18:00:00Z", "scheduled")];
  const upstreamFinal = upstreamOf([{ ...sunday[0], status: "final" }, sunday[1]], [result("g_sun", 9)]);
  const hoursAfterWindow = (h) => new Date(Date.parse("2026-11-09T06:00:00Z") + h * HOUR);

  it("warns, not fails, when upstream has a final that the daily refresh has not picked up yet", () => {
    const f = find(checkUpstreamParity({ games: sunday, results: [], upstream: upstreamFinal, now: hoursAfterWindow(6) }), "upstream-parity");
    expect(f).toMatchObject({ severity: "warn", category: "stale_artifact" });
    expect(f.message).toMatch(/awaiting.*refresh/i);
  });

  it("fails once the missing final is older than the refresh grace", () => {
    const f = find(checkUpstreamParity({ games: sunday, results: [], upstream: upstreamFinal, now: hoursAfterWindow(31) }), "upstream-parity");
    expect(f).toMatchObject({ severity: "fail", category: "stale_artifact" });
  });

  it("warns on overdue scheduled games inside the grace, fails after it", () => {
    const soon = find(checkScheduleConsistency({ games: sunday, results: [], now: hoursAfterWindow(6), upstream: upstreamFinal }), "overdue-scheduled-games");
    expect(soon).toMatchObject({ severity: "warn", category: "stale_artifact" });
    const late = find(checkScheduleConsistency({ games: sunday, results: [], now: hoursAfterWindow(31), upstream: upstreamFinal }), "overdue-scheduled-games");
    expect(late.severity).toBe("fail");
  });

  it("applies the same grace to the calendar-fallback current week and to week coverage", () => {
    const games = [game("g_sun", 9, "2026-11-08T18:00:00Z", "scheduled"), game("g_next", 10, "2026-11-15T18:00:00Z", "scheduled")];
    expect(checkCurrentWeek({ games, now: hoursAfterWindow(6), upstream: upstreamFinal }).finding.severity).toBe("warn");
    expect(checkCurrentWeek({ games, now: hoursAfterWindow(31), upstream: upstreamFinal }).finding.severity).toBe("fail");
    const cov = (h) => checkWeekCoverage({ games, results: [], currentWeek: 10, upstream: upstreamFinal, now: hoursAfterWindow(h) });
    expect(cov(6).severity).toBe("warn");
    expect(cov(31).severity).toBe("fail");
  });
});

describe("games with no kickoff time cannot pin a week forever", () => {
  it("infers the kickoff from the latest dated game of the same week", () => {
    const games = [
      { gameId: "tbd", week: 9, status: "scheduled", dateUtc: null },
      game("dated", 9, "2026-11-08T18:00:00Z", "scheduled"),
      game("w10", 10, "2026-11-15T18:00:00Z", "scheduled"),
    ];
    const r = resolveCurrentWeekDetailed(games, { now: at("2026-11-12T00:00:00Z") });
    expect(r).toMatchObject({ week: 10, source: "calendar-fallback" });
    expect(r.overdueGames.map((g) => g.gameId)).toContain("tbd");
  });
  it("still treats an undatable game as pending when its whole week has no dates", () => {
    const games = [{ gameId: "tbd", week: 4, status: "scheduled", dateUtc: null }, game("w5", 5, "2026-10-04T17:00:00Z", "scheduled")];
    expect(resolveCurrentWeekDetailed(games, { now: at("2026-12-01T00:00:00Z") })).toMatchObject({ week: 4, source: "status" });
  });
});

describe("robustness: malformed inputs never read as healthy", () => {
  const entry = { id: "x", kind: "current-week", maxAgeHours: 96 };
  const resolution = { week: 10, source: "status", statusWeek: 10, overdueGames: [] };
  it("warns on an unparseable generatedAt instead of reporting ok", () => {
    const f = checkArtifacts({ games: UPSTREAM_CURRENT.games, resolution, now: NOW, registry: [entry], artifacts: { x: { week: 10, generatedAt: "garbage" } } });
    expect(f[0].severity).toBe("warn");
    expect(f[0].message).toMatch(/generatedAt/);
  });
  it("gives a missing per-week file the post-turnover grace", () => {
    const games = [game("w9", 9, "2026-11-10T01:15:00Z", "final"), game("w10", 10, "2026-11-13T01:15:00Z", "scheduled")];
    const reg = [{ id: "dfs", kind: "current-week-file" }];
    const soon = checkArtifacts({ games, resolution, now: at("2026-11-10T20:00:00Z"), registry: reg, artifacts: { dfs: null } });
    expect(soon[0].severity).toBe("warn");
    const late = checkArtifacts({ games, resolution, now: at("2026-11-14T20:00:00Z"), registry: reg, artifacts: { dfs: null } });
    expect(late[0].severity).toBe("fail");
  });
  it("does not call production 'behind' when it is actually ahead of the repository", () => {
    const f = checkProduction({ local: { a: { generatedAt: "2026-11-12T12:00:00Z", week: 9 } }, production: { a: { generatedAt: "2026-11-12T17:00:00Z", week: 10 } } });
    expect(f[0].severity).toBe("warn");
    expect(f[0].message).toMatch(/ahead/i);
    expect(f[0].message).not.toMatch(/-\d/);
  });
});

describe("checkUpstreamParity (separates a stale artifact from upstream delay)", () => {
  it("fails as stale_artifact when upstream already has finals the committed results lack", () => {
    const findings = checkUpstreamParity({ games: GAMES_STALE, results: RESULTS_STALE, upstream: UPSTREAM_CURRENT, now: NOW });
    const missing = find(findings, "upstream-parity");
    expect(missing).toMatchObject({ severity: "fail", category: "stale_artifact" });
    expect(missing.message).toMatch(/upstream.*current|not upstream lag/i);
    expect(missing.evidence.missingLocal).toEqual(["2026_09_CIN_ATL", "2026_09_DAL_IND"]);
  });

  it("warns as upstream_lag when the source itself has not published the finals yet", () => {
    const upstream = upstreamOf(GAMES_STALE, RESULTS_STALE);
    // Kickoff 2026-11-08T18:00Z + 12h window = 06:00Z on Nov 9; 12:00Z is 6h past it (well inside the 36h fail threshold).
    const findings = checkUpstreamParity({ games: GAMES_STALE, results: RESULTS_STALE, upstream, now: at("2026-11-09T12:00:00Z") });
    expect(find(findings, "upstream-lag")).toMatchObject({ severity: "warn", category: "upstream_lag" });
    expect(find(findings, "upstream-parity")).toMatchObject({ severity: "ok" });
  });

  it("escalates an upstream delay to a failure after 36h past the completion window", () => {
    const upstream = upstreamOf(GAMES_STALE, RESULTS_STALE);
    // Games kicked off 2026-11-08T18:00Z; +12h grace; +36h => 2026-11-10T18:00Z.
    const findings = checkUpstreamParity({ games: GAMES_STALE, results: RESULTS_STALE, upstream, now: at("2026-11-10T19:00:00Z") });
    expect(find(findings, "upstream-lag")).toMatchObject({ severity: "fail", category: "upstream_lag" });
  });

  it("fails on a score mismatch or a result upstream does not have", () => {
    const upstream = upstreamOf(GAMES_STALE, [result("2026_08_A_B", 8, 99, 1), result("2026_09_JAX_BAL", 9)]);
    const findings = checkUpstreamParity({ games: GAMES_STALE, results: [...RESULTS_STALE, result("ghost", 9)], upstream, now: NOW });
    const bad = find(findings, "upstream-score-integrity");
    expect(bad).toMatchObject({ severity: "fail", category: "inconsistent_data" });
    expect(bad.evidence.scoreMismatch).toEqual(["2026_08_A_B"]);
    expect(bad.evidence.localOnly).toEqual(["ghost"]);
  });

  it("is unknown (never ok) when upstream could not be fetched", () => {
    const findings = checkUpstreamParity({ games: GAMES_STALE, results: RESULTS_STALE, upstream: null, now: NOW });
    expect(findings[0]).toMatchObject({ severity: "unknown", category: "check_unavailable" });
  });

  it("is ok when committed results equal upstream", () => {
    const findings = checkUpstreamParity({ games: UPSTREAM_CURRENT.games, results: UPSTREAM_CURRENT.results, upstream: UPSTREAM_CURRENT, now: NOW });
    expect(find(findings, "upstream-parity")).toMatchObject({ severity: "ok" });
    expect(find(findings, "upstream-parity").message).toMatch(/4/);
  });
});

describe("checkWeekCoverage", () => {
  it("lists weeks before the current week whose finals are short", () => {
    const f = checkWeekCoverage({ games: GAMES_STALE, results: RESULTS_STALE, currentWeek: 10, upstream: null });
    expect(f).toMatchObject({ id: "week-coverage", severity: "fail", category: "stale_artifact" });
    expect(f.evidence.shortWeeks).toEqual([{ week: 9, expected: 3, actual: 1 }]);
  });

  it("downgrades to upstream_lag when upstream is equally short", () => {
    const f = checkWeekCoverage({ games: GAMES_STALE, results: RESULTS_STALE, currentWeek: 10, upstream: upstreamOf(GAMES_STALE, RESULTS_STALE) });
    expect(f).toMatchObject({ severity: "warn", category: "upstream_lag" });
  });

  it("is ok when every earlier week is complete", () => {
    const f = checkWeekCoverage({ games: UPSTREAM_CURRENT.games, results: UPSTREAM_CURRENT.results, currentWeek: 10, upstream: null });
    expect(f).toMatchObject({ severity: "ok" });
  });
});

describe("checkCurrentWeek", () => {
  it("fails when the week only resolves through the calendar fallback", () => {
    const { finding, resolution } = checkCurrentWeek({ games: GAMES_STALE, now: NOW });
    expect(resolution).toMatchObject({ week: 10, source: "calendar-fallback" });
    expect(finding).toMatchObject({ severity: "fail", category: "stale_artifact" });
  });

  it("is ok when statuses are current", () => {
    const { finding, resolution } = checkCurrentWeek({ games: UPSTREAM_CURRENT.games, now: NOW });
    expect(resolution.week).toBe(10);
    expect(finding).toMatchObject({ severity: "ok" });
  });

  it("is ok (offseason) when the whole schedule is final", () => {
    const { finding, resolution } = checkCurrentWeek({ games: [game("g", 18, "2027-01-03T18:00:00Z", "final")], now: at("2027-02-01T00:00:00Z") });
    expect(resolution.week).toBeNull();
    expect(finding).toMatchObject({ severity: "ok" });
  });
});

describe("checkArtifacts", () => {
  const resolution = { week: 10, source: "status", statusWeek: 10, overdueGames: [] };
  const entry = { id: "fantasy-points-allowed", kind: "current-week", maxAgeHours: 72 };
  const base = { games: UPSTREAM_CURRENT.games, resolution, now: NOW };

  it("fails an artifact pinned to the previous week once the refresh grace has passed", () => {
    const art = { generatedAt: "2026-11-11T21:30:00Z", week: 9 };
    const f = checkArtifacts({ ...base, registry: [entry], artifacts: { "fantasy-points-allowed": art } });
    expect(f[0]).toMatchObject({ id: "artifact:fantasy-points-allowed", severity: "fail", category: "stale_artifact" });
    expect(f[0].message).toMatch(/week 9.*week 10/);
  });

  it("only warns inside the post-turnover grace window", () => {
    const art = { generatedAt: "2026-11-09T21:30:00Z", week: 9 };
    // Turnover = MNF kickoff-equivalent last week-9 game +12h; use a clock a few hours after it.
    const games = [game("w9", 9, "2026-11-10T01:15:00Z", "final"), game("w10", 10, "2026-11-13T01:15:00Z", "scheduled")];
    const f = checkArtifacts({ games, resolution, now: at("2026-11-10T20:00:00Z"), registry: [entry], artifacts: { "fantasy-points-allowed": art } });
    expect(f[0]).toMatchObject({ severity: "warn", category: "stale_artifact" });
    expect(f[0].message).toMatch(/awaiting/i);
  });

  it("is ok when week and age are current", () => {
    const art = { generatedAt: "2026-11-12T13:00:00Z", week: 10 };
    expect(checkArtifacts({ ...base, registry: [entry], artifacts: { "fantasy-points-allowed": art } })[0]).toMatchObject({ severity: "ok" });
  });

  it("fails an artifact whose week is right but whose generatedAt is too old", () => {
    const art = { generatedAt: "2026-11-01T00:00:00Z", week: 10 };
    expect(checkArtifacts({ ...base, registry: [entry], artifacts: { "fantasy-points-allowed": art } })[0]).toMatchObject({ severity: "fail", category: "stale_artifact" });
  });

  it("reads week/generatedAt from _meta too", () => {
    const art = { _meta: { generatedAt: "2026-11-12T13:00:00Z", week: 10 } };
    expect(checkArtifacts({ ...base, registry: [entry], artifacts: { "fantasy-points-allowed": art } })[0].severity).toBe("ok");
  });

  it("fails a missing required artifact but only warns for an optional (owner-gated) one", () => {
    const registry = [entry, { id: "betting-splits", kind: "current-week", maxAgeHours: 72, optional: true, note: "gated by NFL_DK_SPLITS_LIVE_VERIFIED" }];
    const f = checkArtifacts({ ...base, registry, artifacts: { "fantasy-points-allowed": null, "betting-splits": null } });
    expect(f.find((x) => x.id === "artifact:fantasy-points-allowed").severity).toBe("fail");
    expect(f.find((x) => x.id === "artifact:betting-splits").severity).toBe("warn");
  });

  it("checks a through-week artifact against the latest fully final week", () => {
    const registry = [{ id: "team-performance-analytics", kind: "through-week", maxAgeHours: 120 }];
    const stale = { _meta: { generatedAt: "2026-11-11T00:00:00Z", throughWeek: 8 } };
    const fresh = { _meta: { generatedAt: "2026-11-11T00:00:00Z", throughWeek: 9 } };
    expect(checkArtifacts({ ...base, registry, artifacts: { "team-performance-analytics": stale } })[0]).toMatchObject({ severity: "fail", category: "stale_artifact" });
    expect(checkArtifacts({ ...base, registry, artifacts: { "team-performance-analytics": fresh } })[0].severity).toBe("ok");
  });

  it("does not trust stale `final` statuses when judging a through-week artifact (calendar decides)", () => {
    const registry = [{ id: "team-performance-analytics", kind: "through-week", maxAgeHours: 240 }];
    // Week 9 has fully elapsed, but games.json still marks 14 of its games scheduled (the incident).
    const staleGames = GAMES_STALE.map((g) => ({ ...g }));
    const art = { _meta: { generatedAt: "2026-11-11T00:00:00Z", throughWeek: 8 } };
    const f = checkArtifacts({ games: staleGames, resolution, now: NOW, registry, artifacts: { "team-performance-analytics": art } });
    expect(f[0]).toMatchObject({ severity: "fail", category: "stale_artifact" });
    expect(f[0].message).toMatch(/through week 8.*week 9/);
  });

  it("applies only the age limit to rolling (non week-scoped) artifacts", () => {
    const registry = [{ id: "team-stats", kind: "age", maxAgeHours: 96 }];
    // A `week` field on a rolling artifact must not be compared to the current week.
    const fresh = { generatedAt: "2026-11-11T12:00:00Z", week: 3 };
    const old = { generatedAt: "2026-11-01T12:00:00Z", week: 10 };
    expect(checkArtifacts({ ...base, registry, artifacts: { "team-stats": fresh } })[0].severity).toBe("ok");
    expect(checkArtifacts({ ...base, registry, artifacts: { "team-stats": old } })[0]).toMatchObject({ severity: "fail", category: "stale_artifact" });
  });

  it("checks a per-week file exists for the current week", () => {
    const registry = [{ id: "dfs-lineup-context", kind: "current-week-file" }];
    expect(checkArtifacts({ ...base, registry, artifacts: { "dfs-lineup-context": null } })[0]).toMatchObject({ severity: "fail", category: "stale_artifact" });
    expect(checkArtifacts({ ...base, registry, artifacts: { "dfs-lineup-context": { week: 10, generatedAt: "2026-11-12T10:00:00Z" } } })[0].severity).toBe("ok");
  });

  it("skips week checks entirely in the offseason", () => {
    const f = checkArtifacts({ ...base, resolution: { week: null, source: "unavailable", overdueGames: [] }, registry: [entry], artifacts: { "fantasy-points-allowed": { week: 3, generatedAt: "2026-01-01T00:00:00Z" } } });
    expect(f[0]).toMatchObject({ severity: "ok" });
    expect(f[0].message).toMatch(/offseason|no current week/i);
  });
});

describe("checkOpponents", () => {
  const games = [game("g10", 10, "2026-11-13T01:15:00Z", "scheduled", "bal", "cin"), game("g10b", 10, "2026-11-15T18:00:00Z", "scheduled", "jax", "ten")];
  const row = (team, opponent, location) => ({ team, opponent, location });

  it("fails when displayed opponents belong to another week", () => {
    const fpa = { week: 10, rows: [row("bal", "jax", "vs"), row("cin", "bal", "@"), row("jax", "bal", "@"), row("ten", "jax", "@")] };
    const f = checkOpponents({ artifact: fpa, games, week: 10, teams: ["bal", "cin", "jax", "ten"] });
    expect(f).toMatchObject({ severity: "fail", category: "stale_artifact" });
    expect(f.evidence.mismatches.map((m) => m.team).sort()).toEqual(["bal", "jax"]);
  });

  it("is ok when every row matches the week's schedule, with bye teams having no opponent", () => {
    const fpa = { week: 10, rows: [row("bal", "cin", "vs"), row("cin", "bal", "@"), row("jax", "ten", "vs"), row("ten", "jax", "@"), row("kc", null, null)] };
    const f = checkOpponents({ artifact: fpa, games, week: 10, teams: ["bal", "cin", "jax", "ten", "kc"] });
    expect(f).toMatchObject({ severity: "ok" });
  });

  it("fails a bye team that is shown with an opponent", () => {
    const fpa = { week: 10, rows: [row("bal", "cin", "vs"), row("cin", "bal", "@"), row("jax", "ten", "vs"), row("ten", "jax", "@"), row("kc", "den", "vs")] };
    expect(checkOpponents({ artifact: fpa, games, week: 10, teams: ["bal", "cin", "jax", "ten", "kc"] }).severity).toBe("fail");
  });

  it("is unknown when the artifact is missing", () => {
    expect(checkOpponents({ artifact: null, games, week: 10, teams: [] })).toMatchObject({ severity: "unknown" });
  });
});

describe("checkWorkflowHealth (separates a failed workflow from a stale artifact)", () => {
  const run = (conclusion, hoursAgo) => ({ conclusion, created_at: new Date(NOW.getTime() - hoursAgo * HOUR).toISOString(), event: "schedule" });

  it("fails after repeated consecutive failures and reports when it last succeeded", () => {
    const f = checkWorkflowHealth({ now: NOW, workflows: [{ name: "nfl-schedules-results.yml", maxAgeHours: 36 }], runs: { "nfl-schedules-results.yml": [run("failure", 20), run("failure", 44), run("failure", 68), run("success", 92)] } });
    expect(f[0]).toMatchObject({ severity: "fail", category: "workflow_failure" });
    expect(f[0].evidence.consecutiveFailures).toBe(3);
    expect(f[0].message).toMatch(/last succeeded/i);
  });

  it("warns on a single failure and is ok on a recent success", () => {
    const wf = [{ name: "w.yml", maxAgeHours: 36 }];
    expect(checkWorkflowHealth({ now: NOW, workflows: wf, runs: { "w.yml": [run("failure", 2), run("success", 26)] } })[0].severity).toBe("warn");
    expect(checkWorkflowHealth({ now: NOW, workflows: wf, runs: { "w.yml": [run("success", 2)] } })[0].severity).toBe("ok");
  });

  it("skips cancelled/skipped/in-progress runs when counting failures", () => {
    const wf = [{ name: "w.yml", maxAgeHours: 36 }];
    const runs = { "w.yml": [{ conclusion: null, created_at: NOW.toISOString() }, run("cancelled", 3), run("success", 5)] };
    expect(checkWorkflowHealth({ now: NOW, workflows: wf, runs })[0].severity).toBe("ok");
  });

  it("fails when the last success is older than the workflow's allowed age even with no failures", () => {
    const f = checkWorkflowHealth({ now: NOW, workflows: [{ name: "w.yml", maxAgeHours: 36 }], runs: { "w.yml": [run("success", 90)] } });
    expect(f[0]).toMatchObject({ severity: "fail", category: "workflow_failure" });
  });

  it("is unknown when run history is unavailable", () => {
    const f = checkWorkflowHealth({ now: NOW, workflows: [{ name: "w.yml", maxAgeHours: 36 }], runs: null });
    expect(f[0]).toMatchObject({ severity: "unknown", category: "check_unavailable" });
  });
});

describe("checkProduction", () => {
  const local = { "fantasy-points-allowed": { generatedAt: "2026-11-12T12:00:00Z", week: 10 } };

  it("is ok when production serves the same generation", () => {
    const f = checkProduction({ local, production: { "fantasy-points-allowed": { generatedAt: "2026-11-12T12:00:00Z", week: 10 } } });
    expect(f[0].severity).toBe("ok");
  });

  it("fails as deploy_drift when production is behind the repository by hours", () => {
    const f = checkProduction({ local, production: { "fantasy-points-allowed": { generatedAt: "2026-11-11T21:30:00Z", week: 9 } } });
    expect(f[0]).toMatchObject({ severity: "fail", category: "deploy_drift" });
    expect(f[0].message).toMatch(/week 9/);
  });

  it("tolerates a short deploy lag", () => {
    const f = checkProduction({ local, production: { "fantasy-points-allowed": { generatedAt: "2026-11-12T11:00:00Z", week: 10 } } });
    expect(f[0].severity).toBe("warn");
  });

  it("is unknown when production could not be fetched", () => {
    expect(checkProduction({ local, production: null })[0]).toMatchObject({ severity: "unknown", category: "check_unavailable" });
    expect(checkProduction({ local, production: { "fantasy-points-allowed": null } })[0].severity).toBe("unknown");
  });
});

describe("checkFileSizes", () => {
  const MB = 1024 * 1024;
  it("fails near GitHub's hard limit, warns on headroom, ignores small files", () => {
    const f = checkFileSizes({ files: [{ path: "a.jsonl", bytes: 96 * MB }, { path: "b.json", bytes: 82 * MB }, { path: "c.json", bytes: 3 * MB }] });
    expect(f).toMatchObject({ severity: "fail", category: "storage_risk" });
    expect(f.evidence.over.map((x) => x.path)).toEqual(["a.jsonl"]);
    expect(f.evidence.near.map((x) => x.path)).toEqual(["b.json"]);
  });
  it("is ok when everything is comfortably small", () => {
    expect(checkFileSizes({ files: [{ path: "c.json", bytes: 3 * MB }] }).severity).toBe("ok");
  });
});

describe("summarizeFindings", () => {
  const f = (severity, category = "none") => ({ id: severity, severity, category });
  it("fails if any check fails, even when most are ok", () => {
    expect(summarizeFindings([f("ok"), f("fail", "stale_artifact"), f("warn")]).status).toBe("fail");
  });
  it("never reports ok while any check is unknown", () => {
    expect(summarizeFindings([f("ok"), f("unknown", "check_unavailable")]).status).toBe("unknown");
  });
  it("reports degraded for warnings only, and ok for all-ok", () => {
    expect(summarizeFindings([f("ok"), f("warn", "upstream_lag")]).status).toBe("degraded");
    expect(summarizeFindings([f("ok"), f("ok")]).status).toBe("ok");
  });
  it("rolls findings up by category so causes are distinguishable", () => {
    const s = summarizeFindings([f("fail", "workflow_failure"), f("fail", "stale_artifact"), f("warn", "upstream_lag")]);
    expect(s.byCategory).toEqual({ workflow_failure: 1, stale_artifact: 1, upstream_lag: 1 });
  });
  it("treats an empty check list as unknown rather than ok", () => {
    expect(summarizeFindings([]).status).toBe("unknown");
  });
});

describe("DraftKings betting splits are monitored as a required, production-compared artifact", () => {
  // The publication gate (NFL_DK_SPLITS_LIVE_VERIFIED) has been true since 2026-09-25, so these splits are no
  // longer an "expected red" exception: stale Week 9 splits shown during Week 10 must alert.
  const entry = artifactRegistry(2026, 10).find((e) => e.id === "betting-splits-current");
  const base = { games: UPSTREAM_CURRENT.games, resolution: { week: 10, source: "status", statusWeek: 10, overdueGames: [] }, now: NOW };

  it("is a required current-week artifact with no owner-gate exemption", () => {
    expect(entry).toMatchObject({ kind: "current-week", maxAgeHours: 48 });
    expect(entry.optional).toBeFalsy();
    expect(entry.note ?? "").not.toMatch(/owner-gated/i);
  });

  it("fails the stale Week 9 artifact that was live on 2026-11-12 and fails when it is missing", () => {
    const stale = { _meta: { generatedAt: "2026-11-09T23:09:19.657Z", week: 9 } };
    const [stalled] = checkArtifacts({ ...base, registry: [entry], artifacts: { "betting-splits-current": stale } });
    expect(stalled).toMatchObject({ severity: "fail", category: "stale_artifact" });
    const [missing] = checkArtifacts({ ...base, registry: [entry], artifacts: { "betting-splits-current": null } });
    expect(missing.severity).toBe("fail");
  });

  it("accepts a current Week 10 artifact", () => {
    const fresh = { _meta: { generatedAt: "2026-11-12T13:00:00Z", week: 10 } };
    expect(checkArtifacts({ ...base, registry: [entry], artifacts: { "betting-splits-current": fresh } })[0].severity).toBe("ok");
  });

  it("is compared with what production serves, so a repo/live mismatch is reported as deploy drift", () => {
    expect(PRODUCTION_ARTIFACT_IDS).toContain("betting-splits-current");
    const local = { "betting-splits-current": { _meta: { generatedAt: "2026-11-13T13:40:00Z", week: 10 } } };
    const production = { "betting-splits-current": { _meta: { generatedAt: "2026-11-09T23:09:19Z", week: 9 } } };
    expect(checkProduction({ local, production })[0]).toMatchObject({ severity: "fail", category: "deploy_drift" });
  });

  it("watches the refresh workflow itself, failing after repeated failures", () => {
    const workflow = CRITICAL_WORKFLOWS.find((w) => w.name === "nfl-betting-splits-refresh.yml");
    expect(workflow).toBeTruthy();
    const runs = { "nfl-betting-splits-refresh.yml": [
      { conclusion: "failure", created_at: "2026-11-13T02:50:00Z" },
      { conclusion: "failure", created_at: "2026-11-12T21:01:00Z" },
      { conclusion: "success", created_at: "2026-11-09T23:07:00Z" },
    ] };
    expect(checkWorkflowHealth({ workflows: [workflow], runs, now: at("2026-11-13T14:00:00Z") })[0]).toMatchObject({ severity: "fail", category: "workflow_failure" });
  });
});
