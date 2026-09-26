/**
 * AI Picks v2 WU2 -- proves the market-blind Stage A context (a) carries the
 * WU1 team-form facts for BOTH providers and (b) carries no JKB opinion or
 * composite field, and that neither can perturb the Stage A rerun hash.
 *
 * Uses the REAL 2026 Week 3 LAC @ BUF packet built by the production loader,
 * so the market fields (present on the full packet) are genuinely real.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildBlindContextSummaryLines } from "./nfl-ai-blind-context-lines";
import { assertBlindPacketHasNoMarketLeakage, auditStageAPromptForMarketPricing, sanitizeGameContextPacketForBlindStageA } from "./nfl-ai-context-sanitizer";
import { buildStageAInitialPrompt as buildChatgptStageA, buildStageAUpdatePrompt as buildChatgptStageAUpdate } from "./nfl-chatgpt-analysis-adapter";
import { loadFreshGameContextPacket } from "./nfl-full-game-context-loader";
import { footballContextHash, footballContextIdentity, type NflGameContextPacket } from "./nfl-full-game-context";
import { buildStageAInitialPrompt as buildGrokStageA, buildStageAUpdatePrompt as buildGrokStageAUpdate, type AnalysisGameFacts } from "./nfl-grok-analysis-adapter";
import { validateJkbContextRefs } from "./nfl-grok-analysis-validator";
import { validateGameContextPacket } from "./nfl-game-context-validators";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GAME_ID = "2026_03_LAC_BUF";

const loaded = loadFreshGameContextPacket({ root: ROOT, season: 2026, week: 3, gameId: GAME_ID, now: () => new Date("2026-09-25T12:00:00.000Z") });
if (loaded.result.status !== "ok") throw new Error(`fixture packet failed to build: ${loaded.result.reason}`);
const PACKET: NflGameContextPacket = loaded.result.packet;

const GAME: AnalysisGameFacts = {
  gameId: GAME_ID,
  homeTeamFull: PACKET.identity.homeTeamFull,
  awayTeamFull: PACKET.identity.awayTeamFull,
  homeTeam: PACKET.identity.homeTeam,
  awayTeam: PACKET.identity.awayTeam,
  kickoffUtc: PACKET.schedule.kickoffUtc,
};

const GROK_PROMPT = buildGrokStageA(GAME, PACKET, []);
const CHATGPT_PROMPT = buildChatgptStageA(GAME, PACKET, []);
const PREVIOUS = { thesis: null, fairSpread: null, projectedTotal: null };

/** The deterministic football-data block of a Stage A prompt: from the identity line through the reading guide. */
function dataBlock(prompt: string): string {
  const lines = prompt.split("\n");
  const start = lines.findIndex((l) => l.startsWith("identity:"));
  const end = lines.findIndex((l) => l.startsWith("- null means the value is unavailable"));
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return lines.slice(start, end + 1).join("\n");
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

describe("1. the Stage A packet carries the WU1 team-form facts", () => {
  it("has available teamForm for both teams, oriented correctly", () => {
    expect(PACKET.teamForm.provenance_status).toBe("available");
    expect(PACKET.teamForm.away?.team).toBe("lac");
    expect(PACKET.teamForm.home?.team).toBe("buf");
    const blind = sanitizeGameContextPacketForBlindStageA(PACKET);
    expect(blind.teamForm).toEqual(PACKET.teamForm);
  });

  it("adds the form source files to the provenance list", () => {
    const names = loaded.provenanceSources.map((s) => s.logicalName);
    expect(names).toEqual(expect.arrayContaining(["performance-team-game", "stats-team-week"]));
  });
});

describe("2. the correct season and recent-game sample reaches the prompt (both providers)", () => {
  for (const [provider, prompt] of [["grok", GROK_PROMPT], ["chatgpt", CHATGPT_PROMPT]] as const) {
    it(`${provider}: season record, scoring, recent game, window sample and turnovers come from the WU1 facts`, () => {
      const lac = PACKET.teamForm.away!;
      const recent = lac.recentGame!;
      const offense = recent.facts.efficiency!.offense;
      expect(prompt).toContain("away (LAC):");
      expect(prompt).toContain(`seasonToDate (2026 regular season, games=${lac.seasonToDate.games}, record=${lac.seasonToDate.record})`);
      expect(prompt).toContain(`recentGame (most recent completed game: Week ${recent.week} vs ${recent.opponent.toUpperCase()}, ${recent.homeAway}, result=${recent.outcome}, score=${recent.pointsScored}-${recent.pointsAllowed}`);
      expect(prompt).toContain(`"epaPerPlay":${round4(offense.epaPerPlay!)}`);
      expect(prompt).toContain(`"epaPerRush":${round4(offense.epaPerRush!)}`);
      expect(prompt).toContain(`"yardsPerPlay":${round4(recent.facts.yardage!.offense.yardsPerPlay!)}`);
      expect(prompt).toContain(`"committed":${recent.facts.turnovers!.committed}`);
      expect(prompt).toContain(`recentWindow (last ${lac.recentWindow.requestedGames} completed games requested, ACTUAL games=${lac.recentWindow.games}`);
    });

    it(`${provider}: acceptance -- LAC is 0-2, scored 14 in each game, lost Week 2 to LV; -0.30 EPA/play, -0.54 rush EPA, 3 turnovers, 5.15 yards/play; window games = 2`, () => {
      expect(prompt).toContain("record=0-2");
      expect(prompt).toContain('"scored":28,"allowed":52,"scoredPerGame":14,"allowedPerGame":26');
      expect(prompt).toContain("Week 2 vs LV, home, result=L, score=14-26");
      expect(prompt).toContain('"epaPerPlay":-0.3013');
      expect(prompt).toContain('"epaPerRush":-0.5404');
      expect(prompt).toContain('"yardsPerPlay":5.1452');
      expect(prompt).toContain('"committed":3');
      expect(prompt).toContain("ACTUAL games=2");
      expect(prompt).toContain("same games as seasonToDate");
    });

    it(`${provider}: labels current form and prior-season background separately and tells the model to weigh sample size`, () => {
      expect(prompt).toContain("teamForm (CURRENT-SEASON deterministic facts");
      expect(prompt).toContain("[PRIOR-SEASON BACKGROUND");
      expect(prompt).toContain("Current-season samples may still be small. Weigh recent evidence against broader prior information appropriately and account for sample uncertainty.");
      expect(prompt).not.toMatch(/shrink/i);
    });
  }

  it("the Stage A UPDATE prompts carry the same block", () => {
    expect(dataBlock(buildGrokStageAUpdate(GAME, PACKET, PREVIOUS, []))).toContain("recentGame (most recent completed game");
    expect(dataBlock(buildChatgptStageAUpdate(GAME, PACKET, PREVIOUS, []))).toContain("recentGame (most recent completed game");
  });

  it("renders an explicit unavailable state (not zeros) when no team-form facts exist", () => {
    const withoutForm = { ...PACKET, teamForm: { home: null, away: null, provenance_status: "unavailable" as const } };
    const lines = buildBlindContextSummaryLines(sanitizeGameContextPacketForBlindStageA(withoutForm)).join("\n");
    expect(lines).toContain("teamForm: unavailable for this game");
    expect(lines).not.toContain("seasonToDate (");
    expect(lines).not.toContain("recentGame (");
  });
});

describe("3. future games do not leak into the context", () => {
  it("teamForm samples contain only earlier-week games; the matchup game and later weeks are absent", () => {
    for (const side of [PACKET.teamForm.home!, PACKET.teamForm.away!]) {
      for (const id of [...side.seasonToDate.gameIds, ...side.recentWindow.facts.gameIds, ...(side.recentGame ? [side.recentGame.gameId] : [])]) {
        expect(id).not.toBe(GAME_ID);
        expect(Number(id.split("_")[1])).toBeLessThan(PACKET.identity.week);
      }
    }
    expect(GROK_PROMPT).not.toMatch(/2026_0[4-9]_|2026_1\d_/);
  });
});

describe("4-10. no JKB opinion or composite field is visible to Stage A", () => {
  const blind = sanitizeGameContextPacketForBlindStageA(PACKET);
  const forbiddenText = [
    "jkbModels",
    "projectedSpread",
    "projectedTotal",
    "modelMarketEdge",
    "powerRating",
    "offenseVsDefense",
    "matchupScore",
    "tdScore",
    "yardageProjections",
    "projectedYards",
    "coaching_rating",
    "coaching_differential",
    "coaching_advantage_team",
    "advantage_team",
    "_differential",
    "_ats",
  ];

  it("the blind packet passes the deep structural leak assertion and has no forbidden key at any depth", () => {
    expect(assertBlindPacketHasNoMarketLeakage(blind)).toEqual([]);
    const serialized = JSON.stringify(blind);
    for (const token of forbiddenText) expect(serialized, token).not.toContain(token);
  });

  // The prompt's own output-schema instructions legitimately say "prediction.projectedTotal" (the MODEL's projection), so that one token is checked on the packet only.
  const promptForbidden = forbiddenText.filter((t) => t !== "projectedTotal");
  for (const [provider, prompt] of [["grok", GROK_PROMPT], ["chatgpt", CHATGPT_PROMPT]] as const) {
    it(`${provider}: the prompt contains none of the forbidden JKB fields (projected spread/edge, powerRating, offenseVsDefense, coaching composite, player matchup/TD scores)`, () => {
      for (const token of promptForbidden) expect(prompt, token).not.toContain(token);
      expect(prompt).not.toContain("jkbModels.projectedTotal");
    });
  }

  it("keeps descriptive coach facts and raw values", () => {
    expect(blind.coaching).toHaveProperty("home_coach");
    expect(blind.coaching).not.toHaveProperty("home_coach_context");
    expect(blind.teamMetrics.epa).toHaveProperty("home_epa_value");
  });

  it("jkbContextRefs into removed fields fail validation; refs into the new/raw sections pass", () => {
    expect(validateJkbContextRefs(["jkbModels.powerRating"], blind, "t")).toHaveLength(1);
    expect(validateJkbContextRefs(["players.tdScores"], blind, "t")).toHaveLength(1);
    expect(validateJkbContextRefs(["matchup.offenseVsDefense"], blind, "t")).toHaveLength(1);
    expect(validateJkbContextRefs(["coaching.home_coaching_rating"], blind, "t")).toHaveLength(1);
    expect(validateJkbContextRefs(["teamForm.away.seasonToDate", "teamForm.away.recentGame", "teamMetrics.epa", "matchup.trenches"], blind, "t")).toEqual([]);
  });
});

describe("11. excluded fields never alter the Stage A football-context hash", () => {
  const baseline = footballContextHash(PACKET);

  function mutate(mutator: (draft: NflGameContextPacket) => void): NflGameContextPacket {
    const draft = JSON.parse(JSON.stringify(PACKET)) as NflGameContextPacket;
    mutator(draft);
    return draft;
  }

  it("is unchanged by JKB spread/total/edge/power-rating changes", () => {
    const changed = mutate((d) => {
      d.jkbModels.projectedSpread = { homeLine: -13.5, favoredTeam: "buf", modelVersion: "x" };
      d.jkbModels.projectedTotal = { line: 61.5, modelVersion: "x" };
      d.jkbModels.modelMarketEdge = { spread: 9.5, total: 9.5 };
      d.jkbModels.powerRating = { home: 99, away: 1, modelVersion: "x" };
    });
    expect(footballContextHash(changed)).toBe(baseline);
  });

  it("is unchanged by player projection / matchup / TD score changes", () => {
    const changed = mutate((d) => {
      d.players = {
        yardageProjections: [{ playerId: "p", name: "n", team: "buf", position: "QB", statCategory: "passing", projectedYards: 999, matchupScore: 99, starterUncertain: false }],
        tdScores: [{ playerId: "p", name: "n", team: "buf", tdScore: 99, window: "last8" }],
        provenance_status: "available",
      };
    });
    expect(footballContextHash(changed)).toBe(baseline);
  });

  it("is unchanged by offense-vs-defense labels, coaching composites/ATS, and advantage/differential labels", () => {
    const changed = mutate((d) => {
      d.matchup.offenseVsDefense = { passing: "away", rushing: "away" };
      d.coaching.home_coaching_rating = 1;
      d.coaching.away_coaching_rating = 99;
      d.coaching.coaching_differential = -98;
      d.coaching.coaching_advantage_team = "away";
      d.coaching.rating_version = "changed";
      if (d.coaching.home_coach_context) d.coaching.home_coach_context.career_ats = "0-99";
      d.teamMetrics.epa.epa_advantage_team = "away";
      d.teamMetrics.epa.epa_differential = -9;
      d.teamMetrics.ypp.ypp_advantage_team = "away";
      d.teamMetrics.ypp.ypp_differential = -9;
      d.matchup.trenches.trenches_advantage_team = "away";
      d.matchup.trenches.trenches_differential = -9;
    });
    expect(footballContextHash(changed)).toBe(baseline);
  });

  it("is unchanged by market moves, provenance and generatedAt", () => {
    const changed = mutate((d) => {
      d.market.spread.homeLine = (d.market.spread.homeLine ?? 0) + 3;
      d.market.total.line = (d.market.total.line ?? 40) + 4;
      d.market.lineMovement.spread = 2;
      d.provenance.builtAt = "2030-01-01T00:00:00.000Z";
      d.generatedAt = "2030-01-01T00:00:00.000Z";
    });
    expect(footballContextHash(changed)).toBe(baseline);
  });

  it("DOES change when real football facts change (a completed game's result / team form)", () => {
    const changed = mutate((d) => {
      d.teamForm.away!.seasonToDate.points = { scored: 999, allowed: 0, scoredPerGame: 499.5, allowedPerGame: 0 };
    });
    expect(footballContextHash(changed)).not.toBe(baseline);
  });

  it("the hash identity is derived from the exact blind packet Stage A sees", () => {
    const identity = footballContextIdentity(PACKET) as Record<string, unknown>;
    expect(identity).not.toHaveProperty("market");
    expect(identity).not.toHaveProperty("jkbModels");
    expect(identity).not.toHaveProperty("players");
    expect(identity).not.toHaveProperty("provenance");
    expect(identity).toHaveProperty("teamForm");
  });
});

describe("12. sportsbook market data stays out of Stage A", () => {
  it("the packet has real market data, but no market key or price reaches either prompt", () => {
    expect(PACKET.market.provenance_status).toBe("available");
    const blind = sanitizeGameContextPacketForBlindStageA(PACKET);
    expect(blind).not.toHaveProperty("market");
    for (const prompt of [GROK_PROMPT, CHATGPT_PROMPT]) {
      expect(prompt).not.toMatch(/"market"\s*:/);
      // Real market-value shapes only: the prompt's own "you are NOT given the sportsbook..." instruction legitimately names these concepts.
      expect(prompt).not.toMatch(/sportsbook=|spread\(home\)=|line movement:|currentHomeLine/i);
      expect(prompt).not.toContain("firstObserved");
      expect(prompt).not.toContain("openingLineCaveat");
    }
  });

  it("the existing Stage A prompt-leak audit passes on the real prompts of both providers", () => {
    const blind = sanitizeGameContextPacketForBlindStageA(PACKET);
    for (const prompt of [GROK_PROMPT, CHATGPT_PROMPT]) {
      expect(auditStageAPromptForMarketPricing(prompt, blind, [])).toEqual({ pass: true, findings: [] });
    }
  });

  it("the audit still catches a leak injected next to the new form block", () => {
    const blind = sanitizeGameContextPacketForBlindStageA(PACKET);
    const leaked = `${GROK_PROMPT}\nsportsbook=draftkings spread(home)=-7.5`;
    expect(auditStageAPromptForMarketPricing(leaked, blind, []).pass).toBe(false);
  });
});

describe("13. Grok and ChatGPT receive equivalent deterministic form context", () => {
  it("the football-data block is byte-identical across providers (initial and update)", () => {
    expect(dataBlock(GROK_PROMPT)).toBe(dataBlock(CHATGPT_PROMPT));
    expect(dataBlock(buildGrokStageAUpdate(GAME, PACKET, PREVIOUS, []))).toBe(dataBlock(buildChatgptStageAUpdate(GAME, PACKET, PREVIOUS, [])));
    expect(dataBlock(GROK_PROMPT)).toBe(buildBlindContextSummaryLines(sanitizeGameContextPacketForBlindStageA(PACKET)).join("\n").split("\n- null means")[0] + "\n- null means the value is unavailable, never zero.");
  });
});

describe("regression: the production packet validator accepts the packet with teamForm", () => {
  // Found by the WU3 dry run: the pregame-safety scan rejects any key named `result`, and the WU1 fact sheet used one. Every runner validates the packet before spending money, so this must stay green.
  it("validateGameContextPacket reports no errors for the real Week 3 packet", () => {
    const teams = JSON.parse(readFileSync(join(ROOT, "public", "data", "nfl", "teams.json"), "utf8"));
    const errors = validateGameContextPacket(PACKET, teams).filter((issue) => issue.severity === "error");
    expect(errors).toEqual([]);
  });
});
