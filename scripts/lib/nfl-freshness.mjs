/**
 * NFL data-freshness verification (pure checks; no I/O).
 *
 * Why: on 2026-11-12 every NFL page quietly served Week 9 data during Week 10.
 * The root cause was a workflow that generated fresh results but could not push
 * them (an evaluation file crossed GitHub's 100 MB limit), and nothing noticed:
 * deploys stayed green and the validators downstream treated "missing finals"
 * as warnings. These checks make that class of failure loud AND attribute it:
 *
 *   upstream_lag      the source (nflverse) has not published yet
 *   workflow_failure  a refresh workflow is failing / has stopped running
 *   stale_artifact    the source is current but a committed artifact is behind
 *   deploy_drift      the repo is current but production serves an older build
 *   inconsistent_data committed files disagree with each other / the source
 *   storage_risk      a tracked file is approaching GitHub's 100 MB push limit
 *   check_unavailable a check could not run (never reported as success)
 *
 * Severities: ok | warn | fail | unknown. `unknown` is never rolled up as ok.
 */
import { OVERDUE_GRACE_MS, kickoffResolver, resolveCurrentWeekDetailed } from "./nfl-current-week.mjs";

const HOUR_MS = 3600e3;
const MB = 1024 * 1024;

/** After kickoff + the 12h completion window, nflverse normally has the final within this long. */
export const UPSTREAM_LAG_FAIL_HOURS = 36;
/**
 * results.json is refreshed once a day, so a final that upstream already has can legitimately be
 * missing for up to a day after the completion window. Inside this grace it is a warning
 * ("awaiting the scheduled refresh"); beyond it the refresh has demonstrably failed.
 */
export const RESULTS_REFRESH_GRACE_HOURS = 30;
/** A week-pinned artifact gets this long after the week turns over before it counts as stale (daily/Tuesday cron cadence). */
export const ARTIFACT_REFRESH_GRACE_HOURS = 30;
/** Production may trail the repository by a normal deploy, but not by more than this. */
export const DEPLOY_LAG_FAIL_HOURS = 4;
export const FILE_WARN_BYTES = 80 * MB;
export const FILE_FAIL_BYTES = 95 * MB;

const finding = (id, severity, category, message, evidence = {}) => ({ id, severity, category, message, evidence });
const ok = (id, message, evidence) => finding(id, "ok", "none", message, evidence);
const unknown = (id, message, evidence) => finding(id, "unknown", "check_unavailable", message, evidence);

const kickoffMs = (game) => {
  const ms = game?.dateUtc ? Date.parse(game.dateUtc) : NaN;
  return Number.isFinite(ms) ? ms : null;
};
const hoursBetween = (laterMs, earlierMs) => (laterMs - earlierMs) / HOUR_MS;
const resultIds = (results) => new Set((results ?? []).filter((r) => r.final !== false).map((r) => r.gameId));
const metaOf = (artifact) => ({
  generatedAt: artifact?.generatedAt ?? artifact?._meta?.generatedAt ?? null,
  week: artifact?.week ?? artifact?._meta?.week ?? null,
  throughWeek: artifact?.throughWeek ?? artifact?._meta?.throughWeek ?? null,
});

/** fail once the oldest lag exceeds the daily-refresh grace, warn before that. Unknown lag (Infinity) fails. */
const refreshSeverity = (worstHoursPastWindow) => (worstHoursPastWindow >= RESULTS_REFRESH_GRACE_HOURS ? "fail" : "warn");

/** True only when upstream is known AND has not scored any of the given overdue games (i.e. the source itself is behind). */
function upstreamLacksAll(upstream, overdueGames) {
  if (!upstream || overdueGames.length === 0) return false;
  const scored = resultIds(upstream.results);
  return overdueGames.every((g) => !scored.has(g.gameId));
}

/** games.json vs results.json internal agreement + games stuck as `scheduled` long after kickoff. */
export function checkScheduleConsistency({ games, results, now, upstream = null }) {
  const findings = [];
  const finals = new Set(games.filter((g) => g.status === "final").map((g) => g.gameId));
  const withResult = resultIds(results);
  const finalWithoutResult = [...finals].filter((id) => !withResult.has(id)).sort();
  const resultWithoutFinal = [...withResult].filter((id) => !finals.has(id)).sort();
  if (finalWithoutResult.length || resultWithoutFinal.length) {
    findings.push(finding("schedule-results-consistency", "fail", "inconsistent_data",
      `games.json and results.json disagree: ${finalWithoutResult.length} final games lack a result, ${resultWithoutFinal.length} results belong to non-final games`,
      { finalWithoutResult, resultWithoutFinal }));
  } else {
    findings.push(ok("schedule-results-consistency", `games.json and results.json agree on ${finals.size} final games`, { finals: finals.size }));
  }

  const { overdueGames } = resolveCurrentWeekDetailed(games, { now });
  if (overdueGames.length > 0) {
    const detail = `${overdueGames.length} games are still marked scheduled long after kickoff (oldest ${overdueGames[0].gameId}, +${overdueGames[0].hoursOverdue}h past the completion window)`;
    const evidence = { count: overdueGames.length, games: overdueGames.slice(0, 20) };
    findings.push(upstreamLacksAll(upstream, overdueGames)
      // The source has not scored them either: a delay we cannot fix. The separate upstream-lag check owns the fail threshold.
      ? finding("overdue-scheduled-games", "warn", "upstream_lag", `${detail}; upstream has not published them either`, evidence)
      : finding("overdue-scheduled-games", refreshSeverity(overdueGames[0].hoursOverdue), "stale_artifact",
        refreshSeverity(overdueGames[0].hoursOverdue) === "warn" ? `${detail}; awaiting the next scheduled results refresh` : detail, evidence));
  } else {
    findings.push(ok("overdue-scheduled-games", "no scheduled game is past its completion window"));
  }
  return findings;
}

/** Hours the oldest of these games is past kickoff + completion window; Infinity when unknowable (never excuse what we cannot date). */
function worstHoursPastWindow(gameIds, games, now) {
  if (!now) return Infinity;
  const kickoff = kickoffResolver(games);
  const byId = new Map(games.map((g) => [g.gameId, g]));
  const hours = gameIds.map((id) => {
    const ms = byId.has(id) ? kickoff(byId.get(id)) : null;
    return ms == null ? Infinity : hoursBetween(now.getTime(), ms + OVERDUE_GRACE_MS);
  });
  return Math.max(...hours);
}

/** Committed results vs the upstream source; this is what tells a stale artifact from an upstream delay. */
export function checkUpstreamParity({ games, results, upstream, now }) {
  if (!upstream) {
    return [unknown("upstream-parity", "upstream source (nflverse games.csv) could not be fetched; cannot confirm results are current")];
  }
  const findings = [];
  const upIds = resultIds(upstream.results);
  const localIds = resultIds(results);
  const missingLocal = [...upIds].filter((id) => !localIds.has(id)).sort();
  const localOnly = [...localIds].filter((id) => !upIds.has(id)).sort();
  const upById = new Map((upstream.results ?? []).map((r) => [r.gameId, r]));
  const scoreMismatch = (results ?? [])
    .filter((r) => upById.has(r.gameId) && (upById.get(r.gameId).homeScore !== r.homeScore || upById.get(r.gameId).awayScore !== r.awayScore))
    .map((r) => r.gameId).sort();

  if (missingLocal.length) {
    const severity = refreshSeverity(worstHoursPastWindow(missingLocal, [...games, ...(upstream.games ?? [])], now));
    findings.push(finding("upstream-parity", severity, "stale_artifact",
      severity === "warn"
        ? `${missingLocal.length} finals available upstream are not in results.json yet; awaiting the next scheduled results refresh`
        : `upstream is current but committed results are not: ${missingLocal.length} finals available upstream are missing from results.json (a refresh/publish failure, not upstream lag)`,
      { missingLocal, upstreamFinals: upIds.size, localFinals: localIds.size }));
  } else {
    findings.push(ok("upstream-parity", `committed results match upstream: ${localIds.size} finals (upstream ${upIds.size})`, { upstreamFinals: upIds.size, localFinals: localIds.size }));
  }

  if (scoreMismatch.length || localOnly.length) {
    findings.push(finding("upstream-score-integrity", "fail", "inconsistent_data",
      `committed results disagree with upstream: ${scoreMismatch.length} score mismatches, ${localOnly.length} results not present upstream`,
      { scoreMismatch, localOnly }));
  }

  // Games both sides think are over but upstream has not scored: that is the source lagging.
  const nowMs = now.getTime();
  const upstreamPending = (upstream.games ?? [])
    .filter((g) => !upIds.has(g.gameId) && kickoffMs(g) != null && kickoffMs(g) + OVERDUE_GRACE_MS <= nowMs)
    .map((g) => ({ gameId: g.gameId, hoursPastWindow: Number(hoursBetween(nowMs, kickoffMs(g) + OVERDUE_GRACE_MS).toFixed(1)) }))
    .sort((a, b) => b.hoursPastWindow - a.hoursPastWindow);
  if (upstreamPending.length) {
    const worst = upstreamPending[0].hoursPastWindow;
    const severity = worst >= UPSTREAM_LAG_FAIL_HOURS ? "fail" : "warn";
    findings.push(finding("upstream-lag", severity, "upstream_lag",
      `upstream has not published ${upstreamPending.length} finals that should be complete (oldest ${upstreamPending[0].gameId}, ${worst}h past the completion window)`,
      { games: upstreamPending.slice(0, 20), failAfterHours: UPSTREAM_LAG_FAIL_HOURS }));
  }
  return findings;
}

/** Expected vs actual finals for every week that should already be complete. */
export function checkWeekCoverage({ games, results, currentWeek, upstream, now = null }) {
  if (currentWeek == null) return ok("week-coverage", "no current week (offseason or season complete); coverage not applicable");
  const resultSet = resultIds(results);
  const upSet = upstream ? resultIds(upstream.results) : null;
  const shortWeeks = [];
  const missingIds = [];
  let upstreamExplainsAll = true;
  for (const week of [...new Set(games.map((g) => g.week))].filter((w) => w < currentWeek).sort((a, b) => a - b)) {
    const weekGames = games.filter((g) => g.week === week);
    const actual = weekGames.filter((g) => resultSet.has(g.gameId)).length;
    if (actual < weekGames.length) {
      shortWeeks.push({ week, expected: weekGames.length, actual });
      missingIds.push(...weekGames.filter((g) => !resultSet.has(g.gameId)).map((g) => g.gameId));
      if (!upSet || weekGames.some((g) => !resultSet.has(g.gameId) && upSet.has(g.gameId))) upstreamExplainsAll = false;
    }
  }
  if (shortWeeks.length === 0) return ok("week-coverage", `every week before week ${currentWeek} has all its finals`);
  const total = shortWeeks.reduce((n, w) => n + (w.expected - w.actual), 0);
  return upstreamExplainsAll
    ? finding("week-coverage", "warn", "upstream_lag", `${total} finals missing in earlier weeks, and upstream does not have them either`, { shortWeeks })
    : finding("week-coverage", refreshSeverity(worstHoursPastWindow(missingIds, games, now)), "stale_artifact", `${total} finals missing in weeks that should be complete: ${shortWeeks.map((w) => `W${w.week} ${w.actual}/${w.expected}`).join(", ")}`, { shortWeeks });
}

/** Resolves the current week and flags when it only resolves through the calendar fallback. */
export function checkCurrentWeek({ games, now, upstream = null }) {
  const resolution = resolveCurrentWeekDetailed(games, { now });
  if (resolution.week == null) {
    const seasonComplete = !games.some((g) => g.status === "scheduled");
    return {
      resolution,
      finding: seasonComplete
        ? ok("current-week", "no scheduled games remain (offseason or season complete)")
        : finding("current-week", "fail", "stale_artifact", `current week cannot be resolved: ${resolution.reason}`, { resolution }),
    };
  }
  if (resolution.source === "calendar-fallback") {
    const stuck = resolution.overdueGames.filter((g) => g.week === resolution.statusWeek);
    const message = `week ${resolution.week} resolved only through the calendar fallback: week ${resolution.statusWeek} still has ${stuck.length} games marked scheduled past their completion window`;
    const evidence = { week: resolution.week, statusWeek: resolution.statusWeek, overdue: resolution.overdueGames.length };
    const severity = refreshSeverity(stuck[0].hoursOverdue);
    return {
      resolution,
      finding: upstreamLacksAll(upstream, stuck)
        ? finding("current-week", "warn", "upstream_lag", `${message}; upstream has not published those finals yet`, evidence)
        : finding("current-week", severity, "stale_artifact", severity === "warn" ? `${message}; awaiting the next scheduled results refresh` : message, evidence),
    };
  }
  return { resolution, finding: ok("current-week", `current week is ${resolution.week} (schedule statuses current)`, { week: resolution.week }) };
}

/** Moment the current week took over from the previous one (last previous-week kickoff + completion window). */
function turnoverMs(games, week) {
  const kickoff = kickoffResolver(games);
  const prior = games.filter((g) => g.week < week).map(kickoff).filter((ms) => ms != null);
  return prior.length ? Math.max(...prior) + OVERDUE_GRACE_MS : null;
}

/**
 * Latest week whose games have ALL passed kickoff + the completion window.
 * Decided by the calendar, never by `status`: the statuses are exactly what goes
 * stale when a results refresh stops landing, so they cannot judge staleness.
 */
function latestElapsedWeek(games, nowMs) {
  const kickoff = kickoffResolver(games);
  const weeks = [...new Set(games.map((g) => g.week))].sort((a, b) => a - b);
  let latest = 0;
  for (const week of weeks) {
    const elapsed = games.filter((g) => g.week === week).every((g) => kickoff(g) != null && kickoff(g) + OVERDUE_GRACE_MS <= nowMs);
    if (elapsed) latest = week;
    else break;
  }
  return latest;
}

/** Week/age checks for each registered downstream artifact. */
export function checkArtifacts({ registry, artifacts, resolution, games, now }) {
  const nowMs = now.getTime();
  return registry.map((entry) => {
    const id = `artifact:${entry.id}`;
    const art = artifacts[entry.id] ?? null;
    const missingSeverity = entry.optional ? "warn" : "fail";
    const noteSuffix = entry.note ? ` (${entry.note})` : "";
    if (resolution.week == null) return ok(id, "no current week (offseason); week alignment not applicable");
    const turnover = turnoverMs(games, resolution.week);
    const withinGrace = turnover != null && hoursBetween(nowMs, turnover) < ARTIFACT_REFRESH_GRACE_HOURS;
    const staleSeverity = withinGrace ? "warn" : missingSeverity;
    if (!art) {
      // A per-week file legitimately does not exist until its generator runs after the week turns over.
      const severity = entry.kind === "current-week-file" ? staleSeverity : missingSeverity;
      return finding(id, severity, "stale_artifact", `${entry.id} is missing${severity === "warn" && withinGrace ? "; awaiting scheduled refresh" : ""}${noteSuffix}`);
    }

    const { generatedAt, week, throughWeek } = metaOf(art);
    const ageHours = generatedAt ? hoursBetween(nowMs, Date.parse(generatedAt)) : null;
    const evidence = { generatedAt, week, throughWeek, ageHours: ageHours == null ? null : Number(ageHours.toFixed(1)), expectedWeek: resolution.week };

    if (ageHours != null && !Number.isFinite(ageHours)) {
      return finding(id, "warn", "stale_artifact", `${entry.id} has an unreadable generatedAt (${JSON.stringify(generatedAt)}); freshness cannot be confirmed`, evidence);
    }
    if (entry.kind === "through-week") {
      const want = latestElapsedWeek(games, nowMs);
      if (throughWeek == null || throughWeek < want) {
        return finding(id, staleSeverity, "stale_artifact", `${entry.id} covers through week ${throughWeek ?? "?"} but week ${want} is complete${withinGrace ? " (awaiting scheduled refresh)" : ""}${noteSuffix}`, evidence);
      }
    } else if ((entry.kind === "current-week" || entry.kind === "current-week-file") && week != null && week !== resolution.week) {
      const severity = staleSeverity;
      const direction = week < resolution.week ? "behind" : "ahead of";
      return finding(id, severity, "stale_artifact",
        `${entry.id} is for week ${week} but week ${resolution.week} is current (${direction} schedule)${withinGrace ? "; awaiting scheduled refresh" : ""}${noteSuffix}`, evidence);
    } else if (entry.kind === "current-week" && week == null) {
      return finding(id, "warn", "stale_artifact", `${entry.id} carries no week; cannot confirm alignment`, evidence);
    }

    if (entry.maxAgeHours && ageHours != null && ageHours > entry.maxAgeHours) {
      return finding(id, missingSeverity, "stale_artifact", `${entry.id} was generated ${ageHours.toFixed(0)}h ago (limit ${entry.maxAgeHours}h)${noteSuffix}`, evidence);
    }
    if (entry.maxAgeHours && ageHours == null) {
      return finding(id, "warn", "stale_artifact", `${entry.id} has no generatedAt; age unknown`, evidence);
    }
    return ok(id, `${entry.id} is current${week != null ? ` (week ${week})` : ""}${ageHours != null ? `, generated ${ageHours.toFixed(0)}h ago` : ""}`, evidence);
  });
}

/** Every displayed opponent must match the schedule for the current week; bye teams show none. */
export function checkOpponents({ artifact, games, week, teams }) {
  const id = "opponent-assignments";
  if (!artifact?.rows) return unknown(id, "fantasy-points-allowed artifact unavailable; opponent assignments not verified");
  const expected = new Map();
  for (const game of games.filter((g) => g.week === week)) {
    expected.set(game.homeAbbr, { opponent: game.awayAbbr, location: "vs" });
    expected.set(game.awayAbbr, { opponent: game.homeAbbr, location: "@" });
  }
  const mismatches = [];
  for (const team of teams) {
    const row = artifact.rows.find((r) => r.team === team);
    const want = expected.get(team) ?? { opponent: null, location: null };
    if (!row || row.opponent !== want.opponent || (row.location ?? null) !== want.location) {
      mismatches.push({ team, shown: row ? `${row.location ?? ""} ${row.opponent ?? "bye"}`.trim() : "missing row", expected: `${want.location ?? ""} ${want.opponent ?? "bye"}`.trim() });
    }
  }
  if (mismatches.length) {
    return finding(id, "fail", "stale_artifact", `${mismatches.length} of ${teams.length} teams show an opponent that does not match the week ${week} schedule`, { week, mismatches: mismatches.slice(0, 40) });
  }
  return ok(id, `all ${teams.length} team opponent assignments match the week ${week} schedule`, { week });
}

/** Distinguishes a failing/stopped workflow from a stale artifact. `runs` is newest-first per workflow file name. */
export function checkWorkflowHealth({ workflows, runs, now }) {
  if (!runs) return workflows.map((w) => unknown(`workflow:${w.name}`, `run history unavailable for ${w.name} (no GitHub token or API error)`));
  const nowMs = now.getTime();
  return workflows.map((workflow) => {
    const id = `workflow:${workflow.name}`;
    const history = (runs[workflow.name] ?? []).filter((r) => r.conclusion === "success" || r.conclusion === "failure");
    if (history.length === 0) return unknown(id, `no completed runs found for ${workflow.name}`);
    let consecutiveFailures = 0;
    for (const run of history) {
      if (run.conclusion !== "failure") break;
      consecutiveFailures += 1;
    }
    const lastSuccess = history.find((r) => r.conclusion === "success");
    const lastSuccessAge = lastSuccess ? hoursBetween(nowMs, Date.parse(lastSuccess.created_at)) : null;
    const evidence = { consecutiveFailures, lastSuccessAt: lastSuccess?.created_at ?? null, lastSuccessAgeHours: lastSuccessAge == null ? null : Number(lastSuccessAge.toFixed(1)) };
    const lastOk = lastSuccess ? `last succeeded ${lastSuccessAge.toFixed(0)}h ago` : "no recent success";
    if (consecutiveFailures >= 2) {
      return finding(id, "fail", "workflow_failure", `${workflow.name} has failed ${consecutiveFailures} runs in a row (${lastOk})`, evidence);
    }
    if (lastSuccessAge == null || lastSuccessAge > workflow.maxAgeHours) {
      return finding(id, "fail", "workflow_failure", `${workflow.name} has not succeeded within ${workflow.maxAgeHours}h (${lastOk})`, evidence);
    }
    if (consecutiveFailures === 1) {
      return finding(id, "warn", "workflow_failure", `${workflow.name} failed its latest run (${lastOk})`, evidence);
    }
    return ok(id, `${workflow.name} is healthy (${lastOk})`, evidence);
  });
}

/** Production artifact vs the repository's: catches "repo is fixed but nothing deployed". */
export function checkProduction({ local, production }) {
  const ids = Object.keys(local);
  if (!production) return ids.map((id) => unknown(`production:${id}`, `production unreachable; could not confirm ${id} is served`));
  return ids.map((id) => {
    const key = `production:${id}`;
    const prod = production[id] ?? null;
    if (!prod) return unknown(key, `production did not return ${id}`);
    const mine = metaOf(local[id]);
    const theirs = metaOf(prod);
    const evidence = { repoGeneratedAt: mine.generatedAt, productionGeneratedAt: theirs.generatedAt, repoWeek: mine.week, productionWeek: theirs.week };
    if (!mine.generatedAt || !theirs.generatedAt) return unknown(key, `${id} has no generatedAt to compare`, evidence);
    const behindHours = hoursBetween(Date.parse(mine.generatedAt), Date.parse(theirs.generatedAt));
    if (behindHours <= 0 && (mine.week == null || mine.week === theirs.week)) return ok(key, `production serves the current ${id}`, evidence);
    if (behindHours < 0) {
      // Production is newer than the repo snapshot we read (a data commit landed between the two reads); not stale.
      return finding(key, "warn", "deploy_drift", `production ${id} is ahead of the repository snapshot (${Math.abs(behindHours).toFixed(1)}h newer, serving week ${theirs.week}); re-check shortly`, evidence);
    }
    const label = `production ${id} is ${behindHours.toFixed(1)}h behind the repository${theirs.week !== mine.week ? ` (serving week ${theirs.week}, repository has week ${mine.week})` : ""}`;
    return finding(key, behindHours > DEPLOY_LAG_FAIL_HOURS || theirs.week !== mine.week ? "fail" : "warn", "deploy_drift", label, evidence);
  });
}

/** Tracked files nearing GitHub's 100 MB push limit (the actual cause of the Nov 9-12 outage). */
export function checkFileSizes({ files }) {
  const over = files.filter((f) => f.bytes >= FILE_FAIL_BYTES).sort((a, b) => b.bytes - a.bytes);
  const near = files.filter((f) => f.bytes >= FILE_WARN_BYTES && f.bytes < FILE_FAIL_BYTES).sort((a, b) => b.bytes - a.bytes);
  const brief = (list) => list.map((f) => ({ path: f.path, mb: Number((f.bytes / MB).toFixed(1)) }));
  if (over.length) return finding("repo-file-size", "fail", "storage_risk", `${over.length} tracked files are within ${((100 * MB - FILE_FAIL_BYTES) / MB).toFixed(0)} MB of GitHub's 100 MB push limit; the next append will make pushes fail`, { over: brief(over), near: brief(near) });
  if (near.length) return finding("repo-file-size", "warn", "storage_risk", `${near.length} tracked files exceed ${FILE_WARN_BYTES / MB} MB and are growing toward GitHub's 100 MB push limit`, { over: [], near: brief(near) });
  return ok("repo-file-size", "no tracked data file is near GitHub's 100 MB push limit");
}

export function summarizeFindings(findings) {
  const counts = { ok: 0, warn: 0, fail: 0, unknown: 0 };
  const byCategory = {};
  for (const f of findings) {
    counts[f.severity] += 1;
    if (f.severity !== "ok") byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
  }
  const status = findings.length === 0 ? "unknown"
    : counts.fail > 0 ? "fail"
    : counts.unknown > 0 ? "unknown"
    : counts.warn > 0 ? "degraded"
    : "ok";
  return { status, counts, byCategory };
}
