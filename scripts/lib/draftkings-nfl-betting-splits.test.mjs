import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { marketUrl, parseDraftKingsSplitsHtml } from "./draftkings-nfl-betting-splits.mjs";
import { resolveDraftKingsTeam, joinDraftKingsGames } from "./draftkings-nfl-betting-splits-join.mjs";
import { DK_SPLITS_SCHEMA_VERSION, publicationIssues, validateDraftKingsSplitsArtifact } from "./draftkings-nfl-betting-splits-artifact.mjs";
import { fetchMarket, fetchPage, makeArtifact, parseArgs, publishArtifact, readInputDirPage } from "../generate-nfl-betting-splits.mjs";

const capturedAt = "2026-09-24T20:45:18.000Z";
const teams = JSON.parse(readFileSync(new URL("../../public/data/nfl/teams.json", import.meta.url))).teams;
const schedule = JSON.parse(readFileSync(new URL("../../public/data/nfl/2026/games.json", import.meta.url))).games;

// Mirrors the verified page's .tb-se heading, four-column .tb-sodd, and GET links.
function html(market, games, pages = [1, 2]) {
  const body = games.map(({ heading, date = "9/24, 08:15PM", sides }) => `<div class="tb-se border-b"><div class="tb-se-title"><h5 class="tb-se-title-new"><a>${heading}</a></h5><span>${date}</span></div><div class="tb-market-wrap"><div class="tb-sm">${sides.map(({ label, odds, handle, bets }) => `<div class="tb-sodd"><div class="tb-slipline">${label}</div><div><a class="tb-odd-s">${odds ?? ""}</a></div><div>${handle}</div><div>${bets}</div></div>`).join("")}</div></div></div>`).join("");
  return `<main><div id="tbsedid">${body}</div><div class="tb_pagination">${pages.map((page) => `<a href="${marketUrl(market, page)}">${page}</a>`).join("")}</div></main>`;
}
const spreadGame = { heading: "ATL Falcons @ GB Packers", sides: [{ label: "GB Packers −4.5", odds: "−115", handle: "69%", bets: "70%" }, { label: "ATL Falcons +4.5", odds: "−105", handle: "31%", bets: "30%" }] };
const moneylineGame = { heading: spreadGame.heading, sides: [{ label: "GB Packers", odds: "-165", handle: "60%", bets: "55%" }, { label: "ATL Falcons", odds: "+145", handle: "40%", bets: "45%" }] };
const totalGame = { heading: spreadGame.heading, sides: [{ label: "Over 45.5", odds: "-110", handle: "51%", bets: "50%" }, { label: "Under 45.5", odds: "-110", handle: "49%", bets: "50%" }] };
const parse = (market, games, pages) => parseDraftKingsSplitsHtml(html(market, games, pages), { market, capturedAt });

test("spread parser reads verified row structure, Unicode minus, plus line and pagination", () => {
  const result = parse("Spread", [spreadGame, { ...spreadGame, heading: "LA Chargers @ BUF Bills", date: "9/27, 01:00PM", sides: [{ label: "BUF Bills -7", odds: "-115", handle: "94%", bets: "82%" }, { label: "LA Chargers +7", odds: "+105", handle: "6%", bets: "18%" }] }]);
  assert.equal(result.blocksSeen, 2);
  assert.equal(result.sidesSeen, 4);
  assert.deepEqual(result.observedPages, [1, 2]);
  assert.deepEqual(result.games[0].sides.map(({ side, line, odds }) => [side, line, odds]), [["GB Packers", -4.5, -115], ["ATL Falcons", 4.5, -105]]);
  assert.equal(result.games[1].awaySource, "LA Chargers");
  assert.equal(result.games[1].sides[1].odds, 105);
});

test("pagination fetches each discovered page once and ignores another market", async () => {
  const visited = [];
  const first = html("Spread", [spreadGame]).replace("</main>", `<div class="tb_pagination"><a href="${marketUrl("Moneyline", 3)}">3</a></div></main>`);
  const second = html("Spread", [], [1, 2]);
  const pages = await fetchMarket("Spread", async (market, page) => {
    visited.push(page);
    const parsed = parseDraftKingsSplitsHtml(page === 1 ? first : second, { market, page, capturedAt });
    return { parsed, fetchedAt: capturedAt };
  });
  assert.deepEqual(visited, [1, 2]);
  assert.equal(pages.length, 2);
  assert.deepEqual(pages[0].parsed.observedPages, [1, 2]);
});

test("live page timestamp is taken after a successful HTTP body collection", async () => {
  const events = [];
  const fetchImpl = async (_url, request) => {
    events.push("GET");
    assert.equal(request.headers.Accept, "text/html");
    return { ok: true, status: 200, headers: { get: () => "text/html; charset=utf-8" }, text: async () => { events.push("body"); return html("Spread", [spreadGame]); } };
  };
  const clock = () => { events.push("clock"); return capturedAt; };
  const result = await fetchPage("Spread", 1, fetchImpl, clock);
  assert.deepEqual(events, ["GET", "body", "clock"]);
  assert.equal(result.fetchedAt, capturedAt);
  assert.equal(result.parsed.games[0].capturedAt, capturedAt);
});

test("live collection rejects non-200 responses before parsing or capture", async () => {
  let bodyRead = false;
  let clockRead = false;
  await assert.rejects(fetchPage("Spread", 1, async () => ({
    ok: true, status: 206, headers: { get: () => "text/html" },
    text: async () => { bodyRead = true; return html("Spread", [spreadGame]); },
  }), () => { clockRead = true; return capturedAt; }), /HTTP 206/);
  assert.equal(bodyRead, false);
  assert.equal(clockRead, false);
});

test("offline input directory is dry-run only and reads the requested page", () => {
  assert.throws(() => parseArgs(["node", "script", "--input-dir", "captures"]), /requires --dry-run/);
  assert.throws(() => parseArgs(["node", "script", "--dry-run", "--input-dir"]), /requires a directory path/);
  const directory = mkdtempSync(join(tmpdir(), "jkb-dk-input-"));
  try {
    writeFileSync(join(directory, "spread-page-1.html"), html("Spread", [spreadGame]));
    const args = parseArgs(["node", "script", "--dry-run", "--input-dir", directory]);
    assert.equal(args.inputDir, directory);
    const result = readInputDirPage("Spread", 1, directory);
    assert.equal(result.parsed.games.length, 1);
    assert.equal(result.parsed.games[0].awaySource, "ATL Falcons");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("six paginated pages produce a complete canonical current-week artifact", async () => {
  const slate = schedule.filter((game) => game.season === 2026 && game.seasonType === "REG" && game.week === 3);
  const label = (abbr) => {
    const team = teams.find((entry) => entry.abbr === abbr);
    return `${team.nflverseAbbr} ${team.shortName}`;
  };
  const date = (iso) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).formatToParts(new Date(iso));
    const value = (type) => parts.find((part) => part.type === type).value;
    return `${value("month")}/${value("day")}, ${value("hour")}:${value("minute")}${value("dayPeriod")}`;
  };
  const captured = [];
  const directory = mkdtempSync(join(tmpdir(), "jkb-dk-full-slate-"));
  for (const market of ["Spread", "Moneyline", "Total"]) {
    const rows = slate.map((game) => {
      const away = label(game.awayAbbr);
      const home = label(game.homeAbbr);
      const labels = market === "Spread" ? [`${home} -3`, `${away} +3`]
        : market === "Moneyline" ? [home, away] : ["Over 45.5", "Under 45.5"];
      return { heading: `${away} @ ${home}`, date: date(game.dateUtc), sides: labels.map((side, index) => ({ label: side, odds: index ? "+130" : "-150", handle: index ? "40%" : "60%", bets: index ? "45%" : "55%" })) };
    });
    const pages = await fetchMarket(market, async (name, page) => {
      const source = html(name, rows.slice((page - 1) * 8, page * 8));
      const path = join(directory, `${name.toLowerCase()}-page-${page}.html`);
      writeFileSync(path, source);
      utimesSync(path, new Date(capturedAt), new Date(capturedAt));
      return { parsed: parseDraftKingsSplitsHtml(source, { market: name, page, capturedAt }), fetchedAt: capturedAt };
    });
    assert.equal(pages.length, 2);
    captured.push(...pages);
  }
  const artifact = makeArtifact(captured, teams, schedule, 2026, "2026-09-24T20:46:00.000Z");
  assert.equal(artifact._meta.diagnostics.pagesFetched, 6);
  assert.equal(artifact.games.length, slate.length);
  assert.deepEqual(publicationIssues(artifact, teams, schedule), []);
  try {
    const output = fileURLToPath(new URL("../../public/data/nfl/betting-splits/current.json", import.meta.url));
    const previous = existsSync(output) ? readFileSync(output, "utf8") : null;
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("../generate-nfl-betting-splits.mjs", import.meta.url)), "--dry-run", "--input-dir", directory], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /"mode": "offline-test"/);
    assert.match(result.stdout, /Dry run: no artifact written/);
    assert.equal(existsSync(output) ? readFileSync(output, "utf8") : null, previous);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("moneyline and total parse their two sides; home-first does not alter orientation", () => {
  const moneyline = parse("Moneyline", [moneylineGame]);
  const total = parse("Total", [totalGame]);
  assert.equal(moneyline.games[0].awaySource, "ATL Falcons");
  assert.equal(moneyline.games[0].sides[0].line, null);
  assert.deepEqual(total.games[0].sides.map(({ side, line }) => [side, line]), [["over", 45.5], ["under", 45.5]]);
});

test("strict parser rejects malformed percentage, odds, missing side, heading, and duplicate side", () => {
  for (const [change, expected] of [
    [{ sides: [{ ...spreadGame.sides[0], handle: "6O%" }, spreadGame.sides[1]] }, "malformed_side"],
    [{ sides: [{ ...spreadGame.sides[0], odds: "" }, spreadGame.sides[1]] }, "malformed_side"],
    [{ sides: [spreadGame.sides[0]] }, "incomplete_market"],
    [{ heading: "ATL Falcons vs GB Packers" }, "malformed_matchup"],
    [{ sides: [spreadGame.sides[0], spreadGame.sides[0]] }, "incomplete_market"],
  ]) {
    const result = parse("Spread", [{ ...spreadGame, ...change }]);
    assert.equal(result.games.length, 0);
    assert.ok(result.diagnostics.some((item) => item.code === expected));
  }
});

test("spread PK is zero; malformed totals are rejected", () => {
  const pick = parse("Spread", [{ ...spreadGame, sides: [{ ...spreadGame.sides[0], label: "GB Packers PK" }, { ...spreadGame.sides[1], label: "ATL Falcons Pick'em" }] }]);
  assert.deepEqual(pick.games[0].sides.map((row) => row.line), [0, 0]);
  assert.equal(parse("Total", [{ ...totalGame, sides: [{ ...totalGame.sides[0], label: "Over PK" }, totalGame.sides[1]] }]).games.length, 0);
});

test("canonical team matching distinguishes both LA teams and rejects unknown", () => {
  for (const [source, canonical] of [["LA Rams", "lar"], ["LA Chargers", "lac"], ["WAS Commanders", "wsh"], ["NY Jets", "nyj"], ["NY Giants", "nyg"], ["JAX Jaguars", "jax"]]) assert.equal(resolveDraftKingsTeam(source, teams), canonical);
  assert.equal(resolveDraftKingsTeam("Unknown Wolves", teams), null);
});

function entry(market, games) { return { parsed: parse(market, games, [1]), fetchedAt: capturedAt }; }
const threeMarkets = () => [entry("Spread", [spreadGame]), entry("Moneyline", [moneylineGame]), entry("Total", [totalGame])];

const afterAtlKickoff = "2026-09-25T12:10:15.000Z";
const byId = (id) => schedule.find((game) => game.gameId === id);
function canonicalEntries(gameIds, at = afterAtlKickoff) {
  const label = (abbr) => {
    const team = teams.find((entry) => entry.abbr === abbr);
    return `${team.nflverseAbbr} ${team.shortName}`;
  };
  const date = (iso) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).formatToParts(new Date(iso));
    const value = (type) => parts.find((part) => part.type === type).value;
    return `${value("month")}/${value("day")}, ${value("hour")}:${value("minute")}${value("dayPeriod")}`;
  };
  return ["Spread", "Moneyline", "Total"].map((market) => {
    const rows = gameIds.map((id) => {
      const game = byId(id);
      const away = label(game.awayAbbr);
      const home = label(game.homeAbbr);
      const labels = market === "Spread" ? [`${home} -3`, `${away} +3`]
        : market === "Moneyline" ? [home, away] : ["Over 45.5", "Under 45.5"];
      return { heading: `${away} @ ${home}`, date: date(game.dateUtc), sides: labels.map((side, index) => ({ label: side, odds: index ? "+130" : "-150", handle: index ? "40%" : "60%", bets: index ? "45%" : "55%" })) };
    });
    return { parsed: parseDraftKingsSplitsHtml(html(market, rows, [1]), { market, capturedAt: at }), fetchedAt: at };
  });
}

test("joins canonical game ID and classifies unresolved, reversed, duplicate and adjacent-week rows", () => {
  const good = joinDraftKingsGames(threeMarkets().map((p) => p.parsed), teams, schedule, { season: 2026, intendedWeek: 3 });
  assert.equal(good.games[0].gameId, schedule.find((g) => g.awayAbbr === "atl" && g.homeAbbr === "gb" && g.week === 3).gameId);
  assert.equal(good.games[0].markets.spread[0].side, "home");
  const cases = [
    ["Unknown Wolves @ GB Packers", "unresolved_team"],
    ["GB Packers @ ATL Falcons", "reversed_orientation"],
    ["ATL Falcons @ BUF Bills", "matchup_not_found"],
  ];
  for (const [heading, code] of cases) {
    const input = parse("Spread", [{ ...spreadGame, heading, sides: [{ ...spreadGame.sides[0], label: `${heading.split(" @ ")[1]} -4.5` }, { ...spreadGame.sides[1], label: `${heading.split(" @ ")[0]} +4.5` }] }]);
    const joined = joinDraftKingsGames([input], teams, schedule, { season: 2026, intendedWeek: 3 });
    assert.ok(joined.diagnostics.some((item) => item.code === code), code);
  }
  const duplicate = joinDraftKingsGames([parse("Spread", [spreadGame, spreadGame])], teams, schedule, { season: 2026, intendedWeek: 3 });
  assert.ok(duplicate.diagnostics.some((item) => item.code === "duplicate_source_matchup"));
  const candidate = schedule.find((g) => g.week === 4 && g.seasonType === "REG");
  const away = teams.find((t) => t.abbr === candidate.awayAbbr).name;
  const home = teams.find((t) => t.abbr === candidate.homeAbbr).name;
  const adjacent = joinDraftKingsGames([{ ...parse("Moneyline", [{ ...moneylineGame, heading: `${away} @ ${home}`, date: "", sides: [{ ...moneylineGame.sides[0], label: home }, { ...moneylineGame.sides[1], label: away }] }]) }], teams, schedule, { season: 2026, intendedWeek: 3 });
  assert.equal(adjacent.adjacent[0].week, 4);
  const duplicateSchedule = [...schedule, { ...schedule.find((g) => g.awayAbbr === "atl" && g.homeAbbr === "gb" && g.week === 3), gameId: "duplicate" }];
  assert.ok(joinDraftKingsGames([parse("Spread", [spreadGame])], teams, duplicateSchedule, { season: 2026, intendedWeek: 3 }).diagnostics.some((item) => item.code === "duplicate_canonical_candidate"));
});

test("missing started game is excluded from pregame coverage; adjacent week is diagnosed", () => {
  const slate = [byId("2026_03_ATL_GB"), byId("2026_03_LAC_BUF"), byId("2026_04_PIT_CLE")];
  const artifact = makeArtifact(canonicalEntries(["2026_03_LAC_BUF", "2026_04_PIT_CLE"]), teams, slate, 2026, "2026-09-25T12:11:00.000Z");
  const diagnostics = artifact._meta.diagnostics;
  assert.deepEqual(artifact.games.map((game) => game.gameId), ["2026_03_LAC_BUF"]);
  assert.equal(new Set(artifact.games.map((game) => game.gameId)).size, artifact.games.length);
  assert.equal(diagnostics.canonicalWeekGames, 2);
  assert.equal(diagnostics.alreadyStartedGames, 1);
  assert.equal(diagnostics.eligiblePregameGames, 1);
  assert.equal(diagnostics.matchedEligibleGames, 1);
  assert.equal(diagnostics.missingEligibleGames, 0);
  assert.equal(diagnostics.adjacentWeekGames, 1);
  assert.equal(diagnostics.adjacentWeekRows, 3);
  assert.equal(diagnostics.unmatchedRows, 0);
  assert.equal(diagnostics.malformedRows, 0);
  assert.ok(diagnostics.issues.filter((issue) => issue.code === "adjacent_week").every((issue) => issue.gameId === "2026_04_PIT_CLE"));
  assert.deepEqual(publicationIssues(artifact, teams, slate), []);
});

test("started source rows are classified and omitted from current artifact", () => {
  const slate = [byId("2026_03_ATL_GB"), byId("2026_03_LAC_BUF")];
  const artifact = makeArtifact(canonicalEntries(["2026_03_ATL_GB", "2026_03_LAC_BUF"]), teams, slate, 2026, "2026-09-25T12:11:00.000Z");
  assert.deepEqual(artifact.games.map((game) => game.gameId), ["2026_03_LAC_BUF"]);
  assert.equal(artifact._meta.diagnostics.selectedWeekGamesSeen, 2);
  assert.equal(artifact._meta.diagnostics.issues.filter((issue) => issue.code === "already_started").length, 3);
  assert.deepEqual(publicationIssues(artifact, teams, slate), []);
});

test("malformed stale started rows are classified; malformed pregame rows remain fatal", () => {
  const slate = [byId("2026_03_ATL_GB"), byId("2026_03_LAC_BUF")];
  const entries = canonicalEntries(["2026_03_LAC_BUF"]);
  const stale = { ...spreadGame, sides: [{ ...spreadGame.sides[0], odds: "" }, spreadGame.sides[1]] };
  const parseExtra = (game) => ({ parsed: parseDraftKingsSplitsHtml(html("Spread", [game], [1]), { market: "Spread", page: 2, capturedAt: afterAtlKickoff }), fetchedAt: afterAtlKickoff });
  const artifact = makeArtifact([...entries, parseExtra(stale)], teams, slate, 2026, "2026-09-25T12:11:00.000Z");
  assert.deepEqual(artifact.games.map((game) => game.gameId), ["2026_03_LAC_BUF"]);
  assert.equal(artifact._meta.diagnostics.malformedRows, 0);
  assert.ok(artifact._meta.diagnostics.issues.some((issue) => issue.code === "already_started" && issue.sourceIssue === "malformed_side"));
  assert.deepEqual(publicationIssues(artifact, teams, slate), []);

  const pregame = { heading: "LA Chargers @ BUF Bills", date: "9/27, 01:00PM", sides: [{ label: "BUF Bills -7", odds: "", handle: "60%", bets: "55%" }, { label: "LA Chargers +7", odds: "+130", handle: "40%", bets: "45%" }] };
  const invalid = makeArtifact([...entries, parseExtra(pregame)], teams, slate, 2026, "2026-09-25T12:11:00.000Z");
  assert.ok(invalid._meta.diagnostics.malformedRows > 0);
  assert.ok(publicationIssues(invalid, teams, slate).some((issue) => issue.includes("unresolved source diagnostics")));
});

test("missing pregame game blocks publication while a started game does not", () => {
  const slate = [byId("2026_03_ATL_GB"), byId("2026_03_LAC_BUF"), byId("2026_03_CAR_CLE")];
  const artifact = makeArtifact(canonicalEntries(["2026_03_LAC_BUF"]), teams, slate, 2026, "2026-09-25T12:11:00.000Z");
  assert.equal(artifact._meta.diagnostics.alreadyStartedGames, 1);
  assert.equal(artifact._meta.diagnostics.eligiblePregameGames, 2);
  assert.equal(artifact._meta.diagnostics.matchedEligibleGames, 1);
  assert.deepEqual(artifact._meta.diagnostics.missingEligibleGameIds, ["2026_03_CAR_CLE"]);
  assert.deepEqual(validateDraftKingsSplitsArtifact(artifact, teams, slate), []);
  assert.deepEqual(publicationIssues(artifact, teams, slate), ["pregame slate coverage 1/2; missing 2026_03_CAR_CLE"]);
});

test("source capture uses earliest successful page collection; generation is later", () => {
  const pages = threeMarkets();
  pages[1].fetchedAt = "2026-09-24T20:45:30.000Z";
  pages[2].fetchedAt = "2026-09-24T20:45:45.000Z";
  const artifact = makeArtifact(pages, teams, [byId("2026_03_ATL_GB")], 2026, "2026-09-24T20:46:00.000Z");
  assert.equal(artifact._meta.sourceCapturedAt, capturedAt);
  assert.equal(artifact._meta.captureEndAt, "2026-09-24T20:45:45.000Z");
  assert.equal(artifact._meta.generatedAt, "2026-09-24T20:46:00.000Z");
  assert.deepEqual(publicationIssues(artifact, teams, [byId("2026_03_ATL_GB")]), []);
});

test("atomic publication replaces only a valid artifact and retains it after a failed refresh", () => {
  const slate = [byId("2026_03_ATL_GB")];
  const artifact = makeArtifact(threeMarkets(), teams, slate, 2026, "2026-09-24T20:46:00.000Z");
  const directory = mkdtempSync(join(tmpdir(), "jkb-dk-publish-"));
  try {
    const path = join(directory, "current.json");
    writeFileSync(path, "previous-good", "utf8");
    publishArtifact(path, artifact, teams, slate);
    const published = readFileSync(path, "utf8");
    assert.equal(JSON.parse(published)._meta.generatedAt, artifact._meta.generatedAt);
    const invalid = structuredClone(artifact);
    invalid.games[0].markets.spread[0].handlePct = 101;
    assert.throws(() => publishArtifact(path, invalid, teams, slate), /Publication blocked/);
    assert.equal(readFileSync(path, "utf8"), published);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("artifact validation and atomic publication reject incomplete slate without overwriting", () => {
  const artifact = makeArtifact(threeMarkets(), teams, schedule, 2026, "2026-09-24T20:46:00.000Z");
  assert.equal(artifact.schemaVersion, DK_SPLITS_SCHEMA_VERSION);
  assert.equal(artifact._meta.sourceCapturedAt, capturedAt);
  assert.equal(artifact._meta.generatedAt, "2026-09-24T20:46:00.000Z");
  assert.deepEqual(validateDraftKingsSplitsArtifact(artifact, teams, schedule), []);
  assert.ok(publicationIssues(artifact, teams, schedule).some((item) => item.startsWith("pregame slate coverage")));
  const directory = mkdtempSync(join(tmpdir(), "jkb-dk-splits-"));
  try {
    const path = join(directory, "current.json");
    writeFileSync(path, "known-good", "utf8");
    assert.throws(() => publishArtifact(path, artifact, teams, schedule), /Publication blocked/);
    assert.equal(readFileSync(path, "utf8"), "known-good");
  } finally { rmSync(directory, { recursive: true, force: true }); }
  const invalid = structuredClone(artifact);
  invalid.games[0].markets.spread[0].handlePct = 101;
  assert.ok(validateDraftKingsSplitsArtifact(invalid, teams, schedule).length > 0);
  const duplicated = structuredClone(artifact);
  duplicated.games.push(structuredClone(duplicated.games[0]));
  assert.ok(validateDraftKingsSplitsArtifact(duplicated, teams, schedule).some((item) => item.startsWith("duplicate game")));
});
