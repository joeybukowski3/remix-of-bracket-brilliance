/**
 * The line-capture ledger: what an approved odds request leaves behind.
 * Invented players, lines and event only; the "provider" is a stub or a stubbed fetch. No network, no credentials.
 */
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { at, captureDeps, makeGame, memoryCaptureSink, mockProps, okLines, line, TIPOFF } from "./__fixtures__/pipelineFixtures";
import { buildLineCapture, fileLineCaptureSink, readLineCaptures, snapshotsFromCapture, teamCodeFromName, type LineCaptureSink, type NbaLineCapture } from "./pipeline/lineCapture";
import { ODDS_SOURCE_LICENSES } from "./pipeline/oddsSources";
import { fileProbeClaim } from "./pipeline/probeClaim";
import { runPregameCapture, type ProviderPropLine, type PropsFetchResult, type PropsProvider } from "./pipeline/pregameJob";
import { MemoryPipelineStore } from "./pipeline/store";
import { createTheOddsApiNbaProvider } from "./pipeline/theOddsApiNba";
import { oneCreditNbaProbe } from "./pipeline/theOddsApiNbaProbe";
import type { RequestGate } from "./pipeline/budget";

const dirs: string[] = [];
const tempDir = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), "nba-capture-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const EVENT = { id: "evt-nyk-bos", commenceTimeUtc: "2026-11-10T00:30:00Z", homeTeam: "Boston Celtics", awayTeam: "New York Knicks" };
const RECEIVED = "2026-11-09T21:30:00Z";
const LINES: ProviderPropLine[] = [
  { playerName: "Demo Guard One", team: null, identityAmbiguous: true, market: "pts", sportsbook: "demobook", line: 24.5, overPrice: -115, underPrice: -105, lastUpdateUtc: "2026-11-09T21:20:00Z", rawProviderRef: { eventId: EVENT.id, bookmakerKey: "demobook", marketKey: "player_points", overOutcomeIndex: 0, underOutcomeIndex: 1 } },
  { playerName: "Demo Big Four", team: null, identityAmbiguous: true, market: "pts", sportsbook: "otherbook", line: 14.5, overPrice: 105, underPrice: -125, lastUpdateUtc: null },
];

const capture = (over: Partial<Parameters<typeof buildLineCapture>[0]> = {}): NbaLineCapture =>
  buildLineCapture({ sourceId: "the-odds-api", capturedAtUtc: RECEIVED, approvalId: "nba-odds-points-test0001", requestRef: "basketball_nba/events/evt-nyk-bos/odds", creditsCharged: 1, event: { sourceEventId: EVENT.id, commenceTimeUtc: EVENT.commenceTimeUtc, homeTeamName: EVENT.homeTeam, awayTeamName: EVENT.awayTeam }, lines: LINES, unmatched: ["demobook/player_points/3: malformed outcome"], usageIssue: null, ...over });

describe("line capture record", () => {
  it("keeps game, player, bookmaker, market, line, both prices, provenance, license and diagnostics", () => {
    const c = capture();
    expect(c.event).toMatchObject({ sourceEventId: "evt-nyk-bos", homeTeam: "BOS", awayTeam: "NYK", canonicalGameKey: "2026-11-09|NYK@BOS" });
    expect(c.lines[0]).toMatchObject({ playerName: "Demo Guard One", bookmaker: "demobook", market: "pts", line: 24.5, overPrice: -115, underPrice: -105, sourceLastUpdateUtc: "2026-11-09T21:20:00Z" });
    expect(c.lines[0].rawProviderRef).toMatchObject({ bookmakerKey: "demobook", marketKey: "player_points" });
    expect(c).toMatchObject({ approvalId: "nba-odds-points-test0001", requestRef: "basketball_nba/events/evt-nyk-bos/odds", creditsCharged: 1, source: { sourceId: "the-odds-api", method: "api" } });
    expect(c.license).toMatchObject({ status: "restricted", reviewedOn: "2026-10-20" });
    expect(c.license.permittedUses).not.toContain("raw-redistribution");
    expect(c.diagnostics).toEqual({ unmatched: ["demobook/player_points/3: malformed outcome"], unmatchedCount: 1, lineCount: 2, usageIssue: null });
  });

  it("is deterministic for identical content and changes id when anything changes", () => {
    expect(capture().captureId).toBe(capture().captureId);
    expect(capture({ capturedAtUtc: "2026-11-09T21:31:00Z" }).captureId).not.toBe(capture().captureId);
  });

  it("leaves the game key empty rather than guessing when a team name is unknown", () => {
    const c = capture({ event: { sourceEventId: "e", commenceTimeUtc: EVENT.commenceTimeUtc, homeTeamName: "Mystery Team", awayTeamName: "New York Knicks" } });
    expect(c.event).toMatchObject({ homeTeam: null, canonicalGameKey: null });
    expect(snapshotsFromCapture(c).snapshots).toEqual([]);
    expect(snapshotsFromCapture(c).rejected).toHaveLength(2);
    expect(teamCodeFromName("LA Clippers")).toBe("LAC");
    expect(teamCodeFromName("Seattle SuperSonics")).toBeNull();
  });

  it("converts to pregame snapshots, rejecting out-of-window lines with the reason and applying the narrower rights", () => {
    const good = snapshotsFromCapture(capture(), { teamOf: (name) => (name === "Demo Guard One" ? "NYK" : "MIA") });
    expect(good.snapshots).toHaveLength(2);
    expect(good.snapshots[0].player.team).toBe("NYK");
    expect(good.snapshots[1].player.team).toBeNull(); // MIA is not in the game: unknown, not guessed
    expect(good.snapshots[0].permissions.permittedUses).toContain("public-display");
    const narrowed = snapshotsFromCapture(capture(), { currentLicenses: { ...ODDS_SOURCE_LICENSES, "the-odds-api": { ...ODDS_SOURCE_LICENSES["the-odds-api"], permittedUses: ["private-research"] } } });
    expect(narrowed.snapshots[0].permissions.permittedUses).toEqual(["private-research"]);
    const late = snapshotsFromCapture(capture({ capturedAtUtc: "2026-11-09T23:50:00Z" }));
    expect(late.snapshots).toEqual([]);
    expect(late.rejected[0].reason).toMatch(/45 minutes/);
  });
});

describe("file ledger", () => {
  it("writes once, read-only, and a second identical write is a no-op", async () => {
    const dir = tempDir();
    const sink = fileLineCaptureSink(dir);
    const c = capture();
    const first = await sink(c);
    expect(first.status).toBe("stored");
    expect(await sink(c)).toMatchObject({ status: "duplicate", captureId: c.captureId });
    expect(readdirSync(dir)).toHaveLength(1);
    expect(() => writeFileSync(first.file, "overwrite")).toThrow();
    expect(readLineCaptures(dir)).toEqual([c]);
    expect(JSON.stringify(c)).not.toMatch(/apiKey|api_key|TEST_TOKEN/);
    expect(statSync(first.file).mode & 0o222).toBe(0);
  });

  it("fails the read when a stored capture has been altered", async () => {
    const dir = tempDir();
    const { file } = await fileLineCaptureSink(dir)(capture());
    chmodSync(file, 0o666);
    writeFileSync(file, readFileSync(file, "utf8").replace("24.5", "99.5"));
    expect(() => readLineCaptures(dir)).toThrow(/content hash mismatch/);
  });

  it("returns an empty list for a directory that does not exist", () => {
    expect(readLineCaptures(path.join(tempDir(), "missing"))).toEqual([]);
  });
});

function probeKit(result: PropsFetchResult, sink: LineCaptureSink) {
  const events: string[] = [];
  const claim = fileProbeClaim(tempDir());
  const provider: PropsProvider = { sourceId: "the-odds-api", fetchEventProps: vi.fn(async () => (events.push("fetch"), result)) };
  const gate: RequestGate = { accountId: "the-odds-api:unverified-pool", enforcesNbaAllowance: true, reserve: async () => ({ ok: true as const, settle: async () => void events.push("settle") }) };
  const wrapped: LineCaptureSink = async (c) => (events.push("persist"), sink(c));
  const deps = { eventId: EVENT.id, approvalId: "nba-odds-points-test0001", provider, gate, claim, captureSink: wrapped };
  return { events, deps, provider };
}

const OK: PropsFetchResult = { status: "ok", lines: LINES, unmatched: ["demobook/player_points/3: malformed outcome"], creditsCharged: 1, requestRef: "basketball_nba/events/evt-nyk-bos/odds", event: EVENT, receivedAtUtc: RECEIVED };

describe("approved single-event probe persistence", () => {
  it("persists the response before the quota is settled and reports the file", async () => {
    const { sink, captures } = memoryCaptureSink();
    const { events, deps } = probeKit(OK, sink);
    const result = await oneCreditNbaProbe(deps)();
    expect(events).toEqual(["fetch", "persist", "settle"]);
    expect(result).toMatchObject({ status: "ok", capture: { status: "stored" } });
    expect(captures).toHaveLength(1);
    expect(captures[0]).toMatchObject({ approvalId: "nba-odds-points-test0001", creditsCharged: 1 });
    expect(captures[0].lines).toHaveLength(2);
  });

  it("reports a failed write loudly, still settles the spent credit, and never allows a second request", async () => {
    const { events, deps, provider } = probeKit(OK, async () => { throw new Error("disk full"); });
    const probe = oneCreditNbaProbe(deps);
    expect(await probe()).toMatchObject({ status: "ok", capture: { status: "failed", message: "disk full" } });
    expect(events).toEqual(["fetch", "persist", "settle"]);
    expect(await probe()).toMatchObject({ status: "error" });
    expect(await oneCreditNbaProbe(deps)()).toMatchObject({ status: "error", message: expect.stringContaining("already claimed") });
    expect(provider.fetchEventProps).toHaveBeenCalledTimes(1);
  });

  it("flags a response that carried no event metadata instead of inventing a game", async () => {
    const { event: _event, ...noEvent } = OK as Extract<PropsFetchResult, { status: "ok" }>;
    const { sink, captures } = memoryCaptureSink();
    const { deps } = probeKit(noEvent, sink);
    expect(await oneCreditNbaProbe(deps)()).toMatchObject({ capture: { status: "failed", message: expect.stringContaining("no event metadata") } });
    expect(captures).toEqual([]);
  });

  it("writes nothing for an error response", async () => {
    const { sink, captures } = memoryCaptureSink();
    const { deps } = probeKit({ status: "error", message: "HTTP 503", failureKind: "http-error", creditsCharged: 0 }, sink);
    expect((await oneCreditNbaProbe(deps)()).capture).toBeUndefined();
    expect(captures).toEqual([]);
  });

  it("stores the real adapter's normalized lines and refused entries, from a stubbed response", async () => {
    const dir = tempDir();
    const outcomes = [
      { name: "Over", description: "Demo Guard One", point: 24.5, price: -115 },
      { name: "Under", description: "Demo Guard One", point: 24.5, price: -105 },
      { name: "Over", description: "Demo Orphan", point: 9.5, price: -110 }, // no Under: refused, kept as a diagnostic
    ];
    const body = { id: EVENT.id, sport_key: "basketball_nba", commence_time: EVENT.commenceTimeUtc, home_team: EVENT.homeTeam, away_team: EVENT.awayTeam, bookmakers: [{ key: "demobook", last_update: "2026-11-09T21:20:00Z", markets: [{ key: "player_points", outcomes }] }] };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "x-requests-used": "11", "x-requests-remaining": "489", "x-requests-last": "1" } }));
    const provider = createTheOddsApiNbaProvider({ apiKey: "PRIVATE_TEST_TOKEN_123456", fetchImpl, now: () => new Date(RECEIVED) });
    const gate: RequestGate = { accountId: "the-odds-api:unverified-pool", enforcesNbaAllowance: true, reserve: async () => ({ ok: true as const, settle: async () => undefined }) };
    const result = await oneCreditNbaProbe({ eventId: EVENT.id, approvalId: "nba-odds-points-test0002", provider, gate, claim: fileProbeClaim(tempDir()), captureSink: fileLineCaptureSink(dir) })();
    expect(result).toMatchObject({ status: "ok", capture: { status: "stored" } });
    const [stored] = readLineCaptures(dir);
    expect(stored).toMatchObject({ capturedAtUtc: "2026-11-09T21:30:00.000Z", creditsCharged: 1, event: { canonicalGameKey: "2026-11-09|NYK@BOS" } });
    expect(stored.lines).toEqual([expect.objectContaining({ playerName: "Demo Guard One", bookmaker: "demobook", line: 24.5, overPrice: -115, underPrice: -105 })]);
    expect(stored.diagnostics.unmatched.join(" ")).toMatch(/Demo Orphan/);
    expect(readFileSync(path.join(dir, readdirSync(dir)[0]), "utf8")).not.toContain("PRIVATE_TEST_TOKEN");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("scheduled pregame capture", () => {
  it("writes the full response to the ledger before filtering, and fails the run if the ledger cannot be written", async () => {
    const game = makeGame();
    const store = new MemoryPipelineStore();
    await store.upsertGame(game);
    const { sink, captures } = memoryCaptureSink();
    const provider = mockProps([okLines([line({ playerName: "Sam Rivera", team: "NYK" }), line({ playerName: "Lee Park", team: "BOS", market: "reb", line: 7.5 })])]);
    const report = await runPregameCapture(captureDeps(store, provider, () => at(TIPOFF, 150), { captureSink: sink }));
    expect(report).toMatchObject({ outcome: "completed", linesStored: 2 });
    expect(captures).toHaveLength(1);
    expect(captures[0]).toMatchObject({ event: { sourceEventId: game.sourceEventId, canonicalGameKey: game.canonicalGameKey }, source: { sourceId: "synthetic-odds" } });
    expect(captures[0].lines.map((l) => l.playerName)).toEqual(["Sam Rivera", "Lee Park"]);

    const failing = new MemoryPipelineStore();
    await failing.upsertGame(game);
    const failed = await runPregameCapture(captureDeps(failing, mockProps([okLines([line()])]), () => at(TIPOFF, 150), { captureSink: async () => { throw new Error("ledger down"); } }));
    expect(failed).toMatchObject({ outcome: "failed", reason: "ledger down" });
    expect((await failing.listAttempts()).at(-1)).toMatchObject({ outcome: "error" });
  });
});
