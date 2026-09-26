/**
 * AI Picks v2 -- Stage A early-season calibration wording, the prior-season
 * baseline, and the trench-season fix. Uses the REAL 2026 Week 3 LAC @ BUF
 * packet built by the production loader.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildBlindContextSummaryLines } from "./nfl-ai-blind-context-lines";
import { auditStageAPromptForMarketPricing, sanitizeGameContextPacketForBlindStageA } from "./nfl-ai-context-sanitizer";
import { buildStageAInitialPrompt as buildChatgptStageA } from "./nfl-chatgpt-analysis-adapter";
import { loadFreshGameContextPacket } from "./nfl-full-game-context-loader";
import type { NflGameContextPacket } from "./nfl-full-game-context";
import { buildStageAInitialPrompt as buildGrokStageA, type AnalysisGameFacts } from "./nfl-grok-analysis-adapter";
import { validateJkbContextRefs } from "./nfl-grok-analysis-validator";
import { buildStageAV2Prompt } from "./nfl-handicap-v2-prompts";
import { buildPriorSeasonBaseline } from "./nfl-prior-season-baseline";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GAME_ID = "2026_03_LAC_BUF";
const loaded = loadFreshGameContextPacket({ root: ROOT, season: 2026, week: 3, gameId: GAME_ID, now: () => new Date("2026-09-25T12:00:00.000Z") });
if (loaded.result.status !== "ok") throw new Error(`fixture packet failed to build: ${loaded.result.reason}`);
const PACKET: NflGameContextPacket = loaded.result.packet;
const BLIND = sanitizeGameContextPacketForBlindStageA(PACKET);
const GAME: AnalysisGameFacts = { gameId: GAME_ID, homeTeamFull: PACKET.identity.homeTeamFull, awayTeamFull: PACKET.identity.awayTeamFull, homeTeam: PACKET.identity.homeTeam, awayTeam: PACKET.identity.awayTeam, kickoffUtc: PACKET.schedule.kickoffUtc };

const DATA = buildBlindContextSummaryLines(BLIND).join("\n");
const PROMPTS = {
  v2Grok: buildStageAV2Prompt({ provider: "grok", game: GAME, packet: PACKET, evidenceLines: [] }),
  v2Chatgpt: buildStageAV2Prompt({ provider: "chatgpt", game: GAME, packet: PACKET, evidenceLines: [] }),
  v1Grok: buildGrokStageA(GAME, PACKET, []),
  v1Chatgpt: buildChatgptStageA(GAME, PACKET, []),
};

describe("1. recentGame stays fully available", () => {
  it("still prints the full per-game metrics for both teams", () => {
    const lines = DATA.split("\n").filter((l) => l.includes("recentGame (most recent"));
    expect(lines).toHaveLength(2);
    for (const line of lines) for (const key of ["epaPerPlay", "epaPerRush", "successRate", "yardsPerPlay", "turnovers", "explosivePasses"]) expect(line).toContain(key);
  });
});

describe.each(Object.entries(PROMPTS))("calibration guidance in %s", (_name, prompt) => {
  it("2-3. says recentGame is a subset of seasonToDate and must not be double counted", () => {
    expect(prompt).toContain("recentGame is a SUBSET of seasonToDate");
    expect(prompt).toContain("Do not count the recent game and the season aggregate as independent evidence");
  });
  it("4. warns that correlated metrics are not independent evidence", () => {
    expect(prompt).toContain("Group correlated signals rather than counting each statistic as independent evidence");
  });
  it("5. warns about early-season instability", () => {
    expect(prompt).toContain("Early-season samples can produce extreme EPA, scoring and turnover results that are not yet stable");
    expect(prompt).toContain("Do not assume an extreme early-season rate is a stable team level");
  });
  it("6. states opponent strength is not adjusted for", () => {
    expect(prompt).toContain("Opponent strength is not currently included in this packet");
    expect(prompt).toContain("Do not treat a small unadjusted sample as if it were opponent-adjusted");
  });
  it("10. stays market blind", () => {
    expect(auditStageAPromptForMarketPricing(prompt, BLIND, [])).toEqual({ pass: true, findings: [] });
    expect(prompt).not.toMatch(/draftkings|sportsbook=|spread\(home\)/i);
  });
});

it("11. both providers receive identical calibration guidance", () => {
  const guide = (p: string) => p.split("\n").filter((l) => /^- (recentGame is|Several metrics|Early-season samples|Opponent strength|teamMetrics\.\*)/.test(l)).join("\n");
  expect(guide(PROMPTS.v2Grok)).toBe(guide(PROMPTS.v2Chatgpt));
  expect(guide(PROMPTS.v1Grok)).toBe(guide(PROMPTS.v1Chatgpt));
  expect(guide(PROMPTS.v2Grok)).toBe(guide(PROMPTS.v1Grok));
  expect(guide(PROMPTS.v2Grok).split("\n")).toHaveLength(5);
});

describe("7. prior-season background covers offense AND defense", () => {
  const baseline = BLIND.teamMetrics.priorSeasonBaseline;
  it("is available for both teams with defense, scoring and record", () => {
    expect(baseline.provenance_status).toBe("available");
    expect(baseline.season).toBe(2025);
    for (const side of [baseline.home, baseline.away]) {
      expect(side?.record).toMatch(/^\d+-\d+(-\d+)?$/);
      expect(side?.gamesPlayed).toBe(17);
      for (const k of ["offEpaPerPlay", "defEpaAllowedPerPlay", "offPointsPerGame", "defPointsAllowedPerGame", "offYardsPerPlay", "defYardsPerPlayAllowed"] as const) expect(typeof side?.[k]).toBe("number");
    }
  });
  it("is rendered with defense, scoring and record, and its refs resolve", () => {
    expect(DATA).toContain("teamMetrics.priorSeasonBaseline [PRIOR-SEASON BACKGROUND, 2025 regular season");
    for (const key of ['"record"', '"defEpaAllowedPerPlay"', '"offPointsPerGame"', '"defPointsAllowedPerGame"']) expect(DATA).toContain(key);
    expect(validateJkbContextRefs(["teamMetrics.priorSeasonBaseline.home.defEpaAllowedPerPlay", "teamMetrics.priorSeasonBaseline.away.record"], BLIND, "t")).toEqual([]);
  });
  it("does not print offense EPA / yards per play twice", () => {
    const baselineLines = DATA.split("\n").filter((l) => /^\s+(away|home) \(/.test(l) && l.includes('"defEpaAllowedPerPlay"'));
    expect(baselineLines).toHaveLength(2);
    for (const l of baselineLines) expect(l).not.toContain("offEpaPerPlay");
  });
  it("leaves success rate out rather than inventing it (not in the source artifacts)", () => {
    expect(JSON.stringify(baseline)).not.toMatch(/success/i);
  });
  it("records W-L-T from prior results without inventing games", () => {
    const team = { through: { season: 2025, dateUtc: "x" }, totals: { offense: { offEpa: 0, offPlays: 1 } }, metrics: {} };
    const window = { teams: { a: team, b: team } };
    const rows = [
      { homeAbbr: "a", awayAbbr: "b", homeScore: 20, awayScore: 10, seasonType: "REG", final: true },
      { homeAbbr: "b", awayAbbr: "a", homeScore: 17, awayScore: 17, seasonType: "REG", final: true },
      { homeAbbr: "a", awayAbbr: "b", homeScore: 3, awayScore: 30, seasonType: "POST", final: true },
      { homeAbbr: "a", awayAbbr: "b", homeScore: null, awayScore: null, seasonType: "REG", final: false },
    ];
    const out = buildPriorSeasonBaseline({ epaWindow: window, yppWindow: null, priorSeasonResults: rows, homeTeam: "a", awayTeam: "b" });
    expect(out.home?.record).toBe("1-0-1");
    expect(out.away?.record).toBe("0-1-1");
  });
  it("stays smaller than the current-season block", () => {
    const lines = DATA.split("\n");
    const size = (pred: (l: string) => boolean) => lines.filter(pred).join("\n").length;
    const current = size((l) => /^\s+(seasonToDate|recentGame|recentWindow)/.test(l));
    const prior = size((l) => /^(teamMetrics\.|matchup\.trenches)/.test(l) || /^\s+(away|home) \(.*\): \{"record"/.test(l));
    expect(prior).toBeGreaterThan(0);
    expect(prior).toBeLessThan(current);
  });
});

describe("8-9. labels and the trench season", () => {
  it("every prior-season line says 2025 / prior season and no line mixes labels", () => {
    const priorLines = DATA.split("\n").filter((l) => /^(teamMetrics\.|matchup\.trenches)/.test(l));
    expect(priorLines.length).toBeGreaterThanOrEqual(4);
    for (const l of priorLines) expect(l).toContain("PRIOR-SEASON BACKGROUND, 2025 regular season");
    expect(DATA).not.toContain('"source_season":2026');
  });
  it("9. matchup.trenches is the PRIOR completed season (2025, through Week 18), not the in-season 2026 archive", () => {
    const t = PACKET.matchup.trenches;
    expect(t.source_season).toBe(2025);
    expect(t.source_timestamp).toBe("2026-01-06T15:51:59Z");
    expect(t.window).toBe("prior_season_through_week_18");
    expect(t.provenance_status).toBe("available");
  });
});

describe("legacy persisted packets without a prior-season baseline", () => {
  it("sanitize to an explicit unavailable baseline and still hash", () => {
    const legacy = JSON.parse(JSON.stringify(PACKET)) as NflGameContextPacket;
    delete (legacy.teamMetrics as Partial<NflGameContextPacket["teamMetrics"]>).priorSeasonBaseline;
    const blind = sanitizeGameContextPacketForBlindStageA(legacy);
    expect(blind.teamMetrics.priorSeasonBaseline.provenance_status).toBe("unavailable");
    expect(buildBlindContextSummaryLines(blind).join("\n")).not.toContain("teamMetrics.priorSeasonBaseline [PRIOR-SEASON");
  });
});
