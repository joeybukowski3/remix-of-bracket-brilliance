/**
 * AI Picks v2 -- the Stage A prompt must show the SAME dot-paths the validator
 * resolves. recentGame and recentWindow wrap their data in `.facts`; the
 * rendered JSON and every example ref must show that wrapper.
 */
import { describe, expect, it } from "vitest";
import { filterEvidenceRecordsForBlindStageA } from "./nfl-ai-context-sanitizer";
import { buildCitableEvidenceLines as chatgptEvidenceLines } from "./nfl-chatgpt-analysis-adapter";
import { resolveEvidenceAuthority } from "./nfl-evidence-store";
import type { EvidenceModel } from "./nfl-evidence-types";
import { buildCitableEvidenceLines as grokEvidenceLines } from "./nfl-grok-analysis-adapter";
import { buildStageAV2Prompt } from "./nfl-handicap-v2-prompts";
import { validateStageAV2, type StageAV2ValidationContext } from "./nfl-handicap-v2-validator";
import { V2_CONTEXT_HASH, V2_EVIDENCE, V2_GAME, V2_GAME_ID, V2_PACKET, V2_STAGE_A_TIME, stageARaw } from "./__fixtures__/nfl-handicap-v2-fixtures";

const PROVIDERS: EvidenceModel[] = ["grok", "chatgpt"];

function ctx(model: EvidenceModel): StageAV2ValidationContext {
  return { model, gameId: V2_GAME_ID, generatedAt: V2_STAGE_A_TIME, contextHash: V2_CONTEXT_HASH, homeTeam: "buf", awayTeam: "lac", contextPacket: V2_PACKET, allEvidenceRecords: V2_EVIDENCE[model].all };
}

function prompt(model: EvidenceModel): string {
  const authority = resolveEvidenceAuthority(V2_EVIDENCE[model].all);
  const lines = (model === "grok" ? grokEvidenceLines : chatgptEvidenceLines)(filterEvidenceRecordsForBlindStageA(V2_EVIDENCE[model].all), authority);
  return buildStageAV2Prompt({ provider: model, game: V2_GAME, packet: V2_PACKET, evidenceLines: lines });
}

function reasonsFor(model: EvidenceModel, ref: string): string {
  const [first, ...rest] = stageARaw(model).keyDrivers as Record<string, unknown>[];
  const result = validateStageAV2({ ...stageARaw(model), keyDrivers: [{ ...first, factRefs: [ref] }, ...rest] }, ctx(model));
  return result.ok ? "" : result.reasons.join(" | ");
}

describe.each(PROVIDERS)("fact-ref path shape (%s)", (model) => {
  const text = prompt(model);
  const recentGameLine = text.split("\n").find((l) => l.includes("recentGame (most recent"));
  const windowLine = text.split("\n").find((l) => l.includes("recentWindow (last") && l.includes('{"facts"'));

  it("1. renders recentGame data under a visible `facts` wrapper", () => {
    expect(recentGameLine).toBeDefined();
    expect(recentGameLine).toContain('): {"facts":{"points"');
  });

  it("2. renders recentWindow data under a visible `facts` wrapper when it differs from seasonToDate", () => {
    // 2 games played -> window equals season, so the identical-figures line must point at both real paths
    expect(text).toContain("cite them under recentWindow.facts.* or seasonToDate.*");
    expect(windowLine === undefined || windowLine.includes('{"facts":{"gameIds"')).toBe(true);
  });

  it("3. teaches the same real paths in the reading guide and the driver example", () => {
    expect(text).toContain("teamForm.away.recentGame.facts.points");
    expect(text).toContain("teamForm.away.seasonToDate.points");
    expect(text).toContain("teamForm.away.recentGame.facts.efficiency.offense.epaPerPlay");
    expect(text).not.toMatch(/teamForm\.(away|home)\.recentGame\.(efficiency|points|yardage|turnovers)/);
    expect(text).not.toMatch(/teamForm\.(away|home)\.recentWindow\.(efficiency|points|yardage|turnovers)/);
  });

  it("3. every teamForm ref quoted in the prompt resolves", () => {
    const refs = [...new Set(text.match(/teamForm\.(?:away|home)\.[A-Za-z.]+[A-Za-z]/g) ?? [])];
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      if (/\.\*$/.test(ref) || ref.endsWith("recentWindow.facts") ) continue;
      expect(reasonsFor(model, ref), ref).toBe("");
    }
  });

  it("4-5. valid recentGame.facts and recentWindow.facts refs resolve", () => {
    expect(reasonsFor(model, "teamForm.away.recentGame.facts.efficiency.offense.epaPerPlay")).toBe("");
    expect(reasonsFor(model, "teamForm.home.recentWindow.facts.points.scoredPerGame")).toBe("");
  });

  it("6-7. the old flattened recentGame / recentWindow paths still fail", () => {
    expect(reasonsFor(model, "teamForm.away.recentGame.efficiency.offense.epaPerPlay")).toMatch(/does not resolve/);
    expect(reasonsFor(model, "teamForm.away.recentWindow.efficiency.offense.epaPerPlay")).toMatch(/does not resolve/);
  });

  it("8. seasonToDate refs resolve unchanged", () => {
    expect(reasonsFor(model, "teamForm.home.seasonToDate.efficiency.offense.epaPerPlay")).toBe("");
    expect(reasonsFor(model, "teamForm.away.seasonToDate.points.scoredPerGame")).toBe("");
  });
});

it("9. Grok and ChatGPT receive identical football-data rendering", () => {
  const data = (p: string) => p.split("\n").filter((l) => /^\s*(seasonToDate|recentGame|recentWindow)|^- teamForm is/.test(l)).join("\n");
  expect(data(prompt("grok"))).toBe(data(prompt("chatgpt")));
  expect(data(prompt("grok"))).toContain('"facts":');
});
