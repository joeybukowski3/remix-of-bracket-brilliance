import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadProductionKCandidatePool } from "./mlb-k-production-candidates.mjs";

function withTempFile(content, fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "mlb-k-prod-"));
  const file = path.join(dir, "candidates.json");
  writeFileSync(file, content, "utf8");
  try {
    return fn(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const VALID_CANDIDATE = {
  pitcher: "Zack Wheeler", pitcherId: 1001, team: "PHI", opponent: "ATL", gameId: 9001,
  gameStartTime: "2026-08-20T23:20:00Z", kLine: 6.5, projectedKs: 7.4, projectedIP: 6.1,
  direction: "OVER", oddsOver: "+105", oddsUnder: null, valueScore: 20.1,
};

describe("loadProductionKCandidatePool", () => {
  it("throws when no path is given -- never silently falls back to fixture", () => {
    assert.throws(() => loadProductionKCandidatePool({}), /requires --candidates-file/);
  });

  it("throws when the file does not exist", () => {
    assert.throws(
      () => loadProductionKCandidatePool({ path: "/nonexistent/does-not-exist.json" }),
      /does not exist/,
    );
  });

  it("throws on malformed JSON", () => {
    withTempFile("not json", (file) => {
      assert.throws(() => loadProductionKCandidatePool({ path: file }), /not valid JSON/);
    });
  });

  it("throws when candidatePool is missing", () => {
    withTempFile(JSON.stringify({ slateDate: "2026-08-20" }), (file) => {
      assert.throws(() => loadProductionKCandidatePool({ path: file }), /no candidatePool array/);
    });
  });

  it("throws when a candidate is missing a required field", () => {
    withTempFile(JSON.stringify({ candidatePool: [{ pitcher: "X" }] }), (file) => {
      assert.throws(() => loadProductionKCandidatePool({ path: file }), /missing required field/);
    });
  });

  it("throws when a candidate has an invalid direction", () => {
    const bad = { ...VALID_CANDIDATE, direction: "SIDEWAYS" };
    withTempFile(JSON.stringify({ candidatePool: [bad] }), (file) => {
      assert.throws(() => loadProductionKCandidatePool({ path: file }), /invalid direction/);
    });
  });

  it("returns the candidate pool with pendingConfirmationCount always 0", () => {
    withTempFile(JSON.stringify({
      slateDate: "2026-08-20", generatedAt: "2026-08-20T12:00:00.000Z",
      sourceSummary: ["production hr-props-raw.json"], candidatePool: [VALID_CANDIDATE],
    }), (file) => {
      const result = loadProductionKCandidatePool({ path: file });
      assert.equal(result.candidatePool.length, 1);
      assert.equal(result.pendingConfirmationCount, 0);
      assert.equal(result.generatedAt, "2026-08-20T12:00:00.000Z");
      assert.deepEqual(result.sourceSummary, ["production hr-props-raw.json"]);
    });
  });
});
