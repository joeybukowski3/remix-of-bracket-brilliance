/**
 * AI Picks v2 -- exporter selection tests: a valid v2 record is published
 * beside (never over) the v1 cards, v1 remains the fallback, invalid records
 * are skipped, internal provenance stays out of the public card, and
 * source URLs are never invented. Fixtures only; no model calls. The v2
 * records used are the real, already-written live LAC @ BUF outputs.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generatePresentationForGame } from "./generate-nfl-ai-handicap-presentation";
import { handicapV2Directory, writeHandicapV2Record } from "./lib/nfl-handicap-v2-record";
import { buildPublicV2Sources } from "./lib/nfl-handicap-v2-presentation";
import type { HandicapV2Record } from "./lib/nfl-handicap-v2-types";

const GAME_ID = "2026_03_LAC_BUF";
const FIXTURES = JSON.parse(readFileSync(join(process.cwd(), "scripts", "lib", "__fixtures__", "nfl-handicap-v2-live-lac-buf.json"), "utf8")) as Record<"grok" | "chatgpt", HandicapV2Record>;

function liveRecord(provider: "grok" | "chatgpt"): HandicapV2Record {
  return FIXTURES[provider];
}

describe("v2 presentation export", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "nfl-v2-presentation-"));
    const dir = join(root, "data", "nfl", "game-context", "2026", "3");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${GAME_ID}.json`), JSON.stringify({ identity: { homeTeam: "buf", awayTeam: "lac" }, schedule: { kickoffUtc: "2026-09-27T17:00:00.000Z" } }));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("1. publishes valid v2 records beside the v1 cards without touching them", () => {
    writeHandicapV2Record(root, 2026, 3, liveRecord("chatgpt"));
    writeHandicapV2Record(root, 2026, 3, liveRecord("grok"));
    const out = generatePresentationForGame(root, GAME_ID, 2026, 3);
    expect(out.schemaVersion).toBe("nfl-ai-handicap-presentation-v1");
    expect(out.handicapV2?.chattyIce?.verdict).toBe("LEAN");
    expect(out.handicapV2?.chattyIce?.coverProbabilityPreferred).toBe(56);
    expect(out.handicapV2?.grokowski?.projectedTotal).toBe(47.5);
    expect(out.handicappers.grokowski.status).toBe("analysis_unavailable");
  });

  it("2/11. with no v2 record there is no handicapV2 block (pure v1 output)", () => {
    expect(generatePresentationForGame(root, GAME_ID, 2026, 3).handicapV2).toBeUndefined();
  });

  it("a provider with no v2 is null while the other is published", () => {
    writeHandicapV2Record(root, 2026, 3, liveRecord("grok"));
    const out = generatePresentationForGame(root, GAME_ID, 2026, 3);
    expect(out.handicapV2?.chattyIce).toBeNull();
    expect(out.handicapV2?.grokowski?.provider).toBe("grok");
  });

  it("skips a malformed newest record and uses the older valid one", () => {
    const good = liveRecord("chatgpt");
    writeHandicapV2Record(root, 2026, 3, good);
    const bad = { ...good, verdict: "SMASH", coverProbabilityPreferred: "lots" };
    writeFileSync(join(handicapV2Directory(root, 2026, 3, GAME_ID, "chatgpt"), "99999999T999999999Z-bad.json"), JSON.stringify(bad));
    expect(generatePresentationForGame(root, GAME_ID, 2026, 3).handicapV2?.chattyIce?.verdict).toBe("LEAN");
  });

  it("does not publish internal provenance", () => {
    writeHandicapV2Record(root, 2026, 3, liveRecord("chatgpt"));
    const json = JSON.stringify(generatePresentationForGame(root, GAME_ID, 2026, 3).handicapV2!.chattyIce!);
    for (const internal of ["contextHash", "promptVersion", "factRefs", "evidenceRefs", "evidenceId", "warnings", "stageAGeneratedAt"]) {
      expect(json).not.toContain(internal);
    }
  });

  it("10. sources: null-url stays null, non-http urls are dropped, duplicates collapse", () => {
    const out = buildPublicV2Sources([
      { label: "Team", url: "https://a.example/x", type: "injury" },
      { label: "Team", url: "https://a.example/x", type: "injury" },
      { label: "JKB team-game data", url: null, type: "other" },
      { label: "Sneaky", url: "javascript:alert(1)", type: "news" },
    ]);
    expect(out).toEqual([
      { label: "Team", url: "https://a.example/x", type: "injury" },
      { label: "JKB team-game data", url: null, type: "other" },
      { label: "Sneaky", url: null, type: "news" },
    ]);
  });
});
