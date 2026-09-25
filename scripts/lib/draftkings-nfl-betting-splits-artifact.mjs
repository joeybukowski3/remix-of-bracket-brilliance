export const DK_SPLITS_SCHEMA_VERSION = "nfl-dk-betting-splits-v1";
const MARKETS = ["spread", "moneyline", "total"];
const SIDES = { spread: ["away", "home"], moneyline: ["away", "home"], total: ["over", "under"] };

export function currentSlateCoverage(artifact, schedule) {
  const meta = artifact._meta;
  const selected = schedule.filter((game) => game.season === meta.season && game.seasonType === "REG" && game.week === meta.week);
  const eligible = selected.filter((game) => Date.parse(game.dateUtc) > Date.parse(meta.sourceCapturedAt));
  const matched = new Set(artifact.games.map((game) => game.gameId));
  return {
    canonicalWeekGames: selected.length,
    alreadyStartedGames: selected.length - eligible.length,
    eligiblePregameGames: eligible.length,
    matchedEligibleGames: eligible.filter((game) => matched.has(game.gameId)).length,
    missingEligibleGameIds: eligible.filter((game) => !matched.has(game.gameId)).map((game) => game.gameId).sort(),
  };
}

export function validateDraftKingsSplitsArtifact(artifact, teams, schedule) {
  const issues = [];
  const fail = (message) => issues.push(message);
  if (artifact?.schemaVersion !== DK_SPLITS_SCHEMA_VERSION) fail("schemaVersion");
  const meta = artifact?._meta;
  if (!Number.isInteger(meta?.season) || !Number.isInteger(meta?.week) || meta.week < 1) fail("season/week");
  for (const field of ["generatedAt", "sourceCapturedAt", "captureEndAt"]) if (!Number.isFinite(Date.parse(meta?.[field]))) fail(field);
  if (Date.parse(meta?.sourceCapturedAt) > Date.parse(meta?.captureEndAt) || Date.parse(meta?.captureEndAt) > Date.parse(meta?.generatedAt)) fail("capture/generation order");
  if (meta?.source !== "DraftKings Network / DraftKings Sportsbook") fail("source");
  if (!["spread", "moneyline", "total"].every((key) => typeof meta?.sourceUrls?.[key] === "string" && meta.sourceUrls[key].startsWith("https://dknetwork.draftkings.com/"))) fail("sourceUrls");
  if (!Array.isArray(artifact?.games) || artifact.games.length === 0) fail("empty games");
  const known = new Set((teams ?? []).map((team) => team.abbr));
  const seenGames = new Set();
  for (const game of artifact?.games ?? []) {
    if (seenGames.has(game.gameId)) fail(`duplicate game ${game.gameId}`);
    seenGames.add(game.gameId);
    const canonical = (schedule ?? []).filter((candidate) => candidate.gameId === game.gameId);
    if (canonical.length !== 1 || canonical[0].season !== meta?.season || canonical[0].week !== meta?.week || canonical[0].seasonType !== "REG" || canonical[0].awayAbbr !== game.away || canonical[0].homeAbbr !== game.home || canonical[0].dateUtc !== game.kickoffUtc) fail(`noncanonical game ${game.gameId}`);
    if (!known.has(game.away) || !known.has(game.home) || game.away === game.home || game.season !== meta?.season || game.week !== meta?.week || game.seasonType !== "REG") fail(`invalid game identity ${game.gameId}`);
    if (Date.parse(game.kickoffUtc) <= Date.parse(meta?.sourceCapturedAt)) fail(`already-started game ${game.gameId}`);
    for (const market of MARKETS) {
      const sides = game.markets?.[market];
      if (!Array.isArray(sides) || sides.length !== 2) { fail(`${game.gameId} ${market}: incomplete`); continue; }
      const seen = new Set();
      for (const item of sides) {
        if (seen.has(item.side) || !SIDES[market].includes(item.side)) fail(`${game.gameId} ${market}: duplicate/invalid side`);
        seen.add(item.side);
        if (market === "total" ? "team" in item : item.team !== (item.side === "away" ? game.away : game.home)) fail(`${game.gameId} ${market}: team side`);
        if (market === "moneyline" ? item.line !== null : !Number.isFinite(item.line) || item.line < (market === "total" ? 0 : -100) || item.line > 100) fail(`${game.gameId} ${market}: line`);
        if (!Number.isInteger(item.odds) || Math.abs(item.odds) < 100 || Math.abs(item.odds) > 9999) fail(`${game.gameId} ${market}: odds`);
        for (const field of ["handlePct", "betsPct"]) if (!Number.isInteger(item[field]) || item[field] < 0 || item[field] > 100) fail(`${game.gameId} ${market}: ${field}`);
        if (!Number.isFinite(Date.parse(item.capturedAt)) || Date.parse(item.capturedAt) < Date.parse(meta?.sourceCapturedAt) || Date.parse(item.capturedAt) > Date.parse(meta?.captureEndAt)) fail(`${game.gameId} ${market}: capturedAt`);
      }
      if (seen.size !== 2) fail(`${game.gameId} ${market}: missing side`);
      for (const field of ["handlePct", "betsPct"]) {
        const sum = sides.reduce((total, item) => total + item[field], 0);
        if (sum < 99 || sum > 101) fail(`${game.gameId} ${market}: ${field} sum=${sum}`);
      }
    }
  }
  if (Number.isInteger(meta?.season) && Number.isInteger(meta?.week) && Number.isFinite(Date.parse(meta?.sourceCapturedAt)) && Array.isArray(artifact?.games)) {
    const coverage = currentSlateCoverage(artifact, schedule ?? []);
    for (const key of ["canonicalWeekGames", "alreadyStartedGames", "eligiblePregameGames", "matchedEligibleGames"]) {
      if (meta.diagnostics?.[key] !== coverage[key]) fail(`diagnostics ${key}`);
    }
    if (meta.diagnostics?.missingEligibleGames !== coverage.missingEligibleGameIds.length) fail("diagnostics missingEligibleGames");
    if (JSON.stringify(meta.diagnostics?.missingEligibleGameIds) !== JSON.stringify(coverage.missingEligibleGameIds)) fail("diagnostics missingEligibleGameIds");
  }
  return issues;
}

export function publicationIssues(artifact, teams, schedule) {
  const issues = validateDraftKingsSplitsArtifact(artifact, teams, schedule);
  const fatal = artifact._meta.diagnostics.issues.filter((item) => !["adjacent_week", "already_started"].includes(item.code));
  if (fatal.length) issues.push(`${fatal.length} unresolved source diagnostics`);
  const coverage = currentSlateCoverage(artifact, schedule);
  if (coverage.missingEligibleGameIds.length) issues.push(`pregame slate coverage ${coverage.matchedEligibleGames}/${coverage.eligiblePregameGames}; missing ${coverage.missingEligibleGameIds.join(", ")}`);
  return issues;
}
