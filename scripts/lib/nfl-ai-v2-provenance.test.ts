/**
 * AI Picks v2 -- record provenance: `researchMode` ("site-only" | "live") on every NEW record, and the bumped
 * promptVersion. Both are internal provenance only: they change no handicap logic, are never published, and records
 * written before them (no researchMode, promptVersion "...-1") stay readable and publishable.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generatePresentationForGame } from "../generate-nfl-ai-handicap-presentation";
import type { ResearchMode } from "./nfl-ai-v2-research-mode";
import { planProviderV2 } from "./nfl-ai-v2-slate-plan";
import { gameFacts, providerFacts } from "./nfl-ai-v2-slate.fixtures";
import type { EvidenceModel } from "./nfl-evidence-types";
import { buildHandicapV2PublicCard, isPublishableHandicapV2Record, readLatestPublishableHandicapV2Record } from "./nfl-handicap-v2-presentation";
import { buildHandicapV2Record, handicapV2Directory, writeHandicapV2Record } from "./nfl-handicap-v2-record";
import { HANDICAP_V2_PROMPT_VERSION, LEGACY_HANDICAP_V2_PROMPT_VERSIONS, type HandicapV2Record } from "./nfl-handicap-v2-types";
import { validateStageAV2, validateStageBV2 } from "./nfl-handicap-v2-validator";
import { V2_CONTEXT_HASH, V2_GAME, V2_GAME_ID, V2_MARKET_MINUS_7, V2_PACKET, V2_STAGE_A_TIME, V2_STAGE_B_TIME, stageARaw, stageBRaw, trustedStageA } from "./__fixtures__/nfl-handicap-v2-fixtures";

const ROOT = join(__dirname, "..", "..");
const SEASON = 2026;
const WEEK = 3;

/** A genuinely valid record, built the way the runner builds one: validated Stage A + Stage B, then the record builder. */
function buildRecord(model: EvidenceModel, researchMode: ResearchMode): HandicapV2Record {
  const a = validateStageAV2(stageARaw(model), { model, gameId: V2_GAME_ID, generatedAt: V2_STAGE_A_TIME, contextHash: V2_CONTEXT_HASH, homeTeam: "buf", awayTeam: "lac", contextPacket: V2_PACKET, allEvidenceRecords: [] as never[] });
  // the shared Stage A fixture cites one evidence record; for a record with no evidence use the factRef-only form
  const stageA = a.ok ? a.analysis : trustedStageA(model);
  const b = validateStageBV2(stageBRaw(model, { injuryParagraph: null, evidenceRefs: [] }), { model, gameId: V2_GAME_ID, generatedAt: V2_STAGE_B_TIME, contextHash: V2_CONTEXT_HASH, game: V2_GAME, lockedStageA: stageA, market: V2_MARKET_MINUS_7, contextPacket: V2_PACKET, allEvidenceRecords: [] });
  if (!b.ok) throw new Error(`fixture Stage B failed: ${b.reasons.join(" | ")}`);
  return buildHandicapV2Record({ stageA, stageB: b.analysis, market: V2_MARKET_MINUS_7, evidenceRecords: [], researchMode });
}

/** The same record as an older build would have written it: legacy prompt version, no researchMode key at all. */
function asLegacy(record: HandicapV2Record): Record<string, unknown> {
  const { researchMode: _dropped, ...rest } = record;
  return { ...rest, promptVersion: LEGACY_HANDICAP_V2_PROMPT_VERSIONS[0] };
}

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nfl-ai-v2-provenance-"));
  // the exporter resolves team identity / kickoff from the stored game-context artifact
  const dir = join(root, "data", "nfl", "game-context", String(SEASON), String(WEEK));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${V2_GAME_ID}.json`), JSON.stringify({ identity: { homeTeam: "buf", awayTeam: "lac" }, schedule: { kickoffUtc: "2026-09-27T17:00:00.000Z" } }));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("researchMode on new records", () => {
  it.each([["site-only"], ["live"]] as const)("a %s record stores researchMode exactly, in memory and in the stored JSON file", (mode) => {
    const record = buildRecord("grok", mode);
    expect(record.researchMode).toBe(mode);
    const path = writeHandicapV2Record(root, SEASON, WEEK, record);
    expect(JSON.parse(readFileSync(path, "utf8")).researchMode).toBe(mode);
    expect(readLatestPublishableHandicapV2Record(root, SEASON, WEEK, V2_GAME_ID, "grok")?.researchMode).toBe(mode);
  });

  it("is required by the record builder, so a new record cannot be written without it", () => {
    const source = readFileSync(join(__dirname, "nfl-handicap-v2-record.ts"), "utf8");
    expect(source).toMatch(/researchMode: ResearchMode;\r?\n\}/);
    expect(source).toContain("researchMode: input.researchMode,");
  });

  it("does not change anything else on the record: the two modes differ only in researchMode", () => {
    const { researchMode: _a, ...site } = buildRecord("chatgpt", "site-only");
    const { researchMode: _b, ...live } = buildRecord("chatgpt", "live");
    expect(site).toEqual(live);
  });

  it("is never published: the public card and the generated artifact omit it (and the prompt version)", () => {
    const record = buildRecord("grok", "site-only");
    expect(JSON.stringify(buildHandicapV2PublicCard(record, "Grokowski"))).not.toMatch(/researchMode|promptVersion/);
    writeHandicapV2Record(root, SEASON, WEEK, record);
    const published = JSON.stringify(generatePresentationForGame(root, V2_GAME_ID, SEASON, WEEK).handicapV2);
    expect(published).toContain("Grokowski");
    expect(published).not.toMatch(/researchMode|promptVersion|site-only/);
  });

  it("does not influence planning: the same record with either mode, or none, plans identically", () => {
    const base = buildRecord("grok", "live");
    const variants: Array<HandicapV2Record> = [base, { ...base, researchMode: "site-only" }, asLegacy(base) as unknown as HandicapV2Record];
    const plans = variants.map((record) => planProviderV2(gameFacts({ footballContextHash: record.contextHash }), providerFacts("grok", { record })));
    expect(new Set(plans.map((p) => JSON.stringify({ ...p, reasons: [] }))).size).toBe(1);
  });
});

describe("promptVersion", () => {
  it("is bumped for the site-only-capable information contract, and new runs write the new version", () => {
    expect(HANDICAP_V2_PROMPT_VERSION).toBe("nfl-handicap-v2-prompts-2");
    expect(LEGACY_HANDICAP_V2_PROMPT_VERSIONS).toEqual(["nfl-handicap-v2-prompts-1"]);
    for (const mode of ["site-only", "live"] as const) expect(buildRecord("grok", mode).promptVersion).toBe(HANDICAP_V2_PROMPT_VERSION);
  });

  it("is the version in the source the runner builds records through (no second literal)", () => {
    expect(readFileSync(join(__dirname, "nfl-handicap-v2-record.ts"), "utf8")).toContain("promptVersion: HANDICAP_V2_PROMPT_VERSION,");
  });
});

describe("records written before researchMode / the bump stay readable", () => {
  it("an old record (no researchMode, promptVersion -1) is publishable, loads, and publishes", () => {
    const legacy = asLegacy(buildRecord("grok", "live"));
    expect(legacy).not.toHaveProperty("researchMode");
    expect(isPublishableHandicapV2Record(legacy, V2_GAME_ID, "grok")).toBe(true);
    const dir = handicapV2Directory(root, SEASON, WEEK, V2_GAME_ID, "grok");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "20260925T120000000Z-legacy000000.json"), `${JSON.stringify(legacy, null, 2)}\n`);
    const loaded = readLatestPublishableHandicapV2Record(root, SEASON, WEEK, V2_GAME_ID, "grok");
    expect(loaded?.promptVersion).toBe("nfl-handicap-v2-prompts-1");
    expect(loaded?.researchMode).toBeUndefined();
    expect(generatePresentationForGame(root, V2_GAME_ID, SEASON, WEEK).handicapV2?.grokowski?.verdict).toBe(loaded?.verdict);
  });

  it("a legacy record and a new record coexist: the newest wins, the legacy one is untouched", () => {
    const dir = handicapV2Directory(root, SEASON, WEEK, V2_GAME_ID, "grok");
    mkdirSync(dir, { recursive: true });
    const legacyPath = join(dir, "20260101T000000000Z-legacy000000.json");
    const legacyText = `${JSON.stringify(asLegacy(buildRecord("grok", "live")), null, 2)}\n`;
    writeFileSync(legacyPath, legacyText);
    writeHandicapV2Record(root, SEASON, WEEK, buildRecord("grok", "site-only"));
    expect(readLatestPublishableHandicapV2Record(root, SEASON, WEEK, V2_GAME_ID, "grok")?.researchMode).toBe("site-only");
    expect(readFileSync(legacyPath, "utf8")).toBe(legacyText);
  });

  const committed = (() => {
    const out: string[] = [];
    const base = join(ROOT, "data", "nfl", "analysis");
    const walk = (dir: string): void => {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith(".json") && dir.endsWith(join("", "handicap-v2"))) out.push(path);
      }
    };
    walk(base);
    return out;
  })();

  it.skipIf(committed.length === 0)("every persisted v2 record in the repo (written before this change) is still readable and publishable", () => {
    for (const path of committed) {
      const record = JSON.parse(readFileSync(path, "utf8")) as HandicapV2Record;
      const provider = record.provider as "grok" | "chatgpt";
      expect(isPublishableHandicapV2Record(record, record.gameId, provider), path).toBe(true);
      expect((LEGACY_HANDICAP_V2_PROMPT_VERSIONS as readonly string[]).includes(record.promptVersion) || record.promptVersion === HANDICAP_V2_PROMPT_VERSION, path).toBe(true);
      expect(() => buildHandicapV2PublicCard(record, provider), path).not.toThrow();
    }
  });
});
