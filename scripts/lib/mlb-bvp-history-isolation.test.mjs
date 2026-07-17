/**
 * mlb-bvp-history-isolation.test.mjs
 * Run via: node --test scripts/lib/mlb-bvp-history-isolation.test.mjs
 *
 * Guards the "absolute isolation requirement": batter-vs-pitcher history is
 * a separate static lookup joined only at display time. It must never be
 * read or written by score computation, the raw/best-bets output files, or
 * any social/X-post generation script.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

function readScript(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("bvp-history isolation", () => {
  it("the HR props generator never references bvp history (scoring stays untouched)", () => {
    const source = readScript("scripts/generate-mlb-hr-props.mjs");
    assert.doesNotMatch(source, /bvp-?history/i);
  });

  it("the strikeout prop details generator never references bvp history (different feature, different file)", () => {
    const source = readScript("scripts/generate-mlb-strikeout-prop-details.mjs");
    assert.doesNotMatch(source, /bvp-?history/i);
  });

  it("no social/X-post generation script references bvp history", () => {
    const scripts = [
      "scripts/post-mlb-hr-props-to-x.mjs",
      "scripts/post-mlb-strikeout-props-to-x.mjs",
      "scripts/post-mlb-ml-edges-to-x.mjs",
      "scripts/plan-mlb-x-posts.mjs",
      "scripts/generate-mlb-social-graphic-previews.mjs",
      "scripts/generate-mlb-daily-picks.mjs",
      "scripts/check-mlb-x-posting-readiness.mjs",
    ];
    for (const relativePath of scripts) {
      const source = readScript(relativePath);
      assert.doesNotMatch(source, /bvp-?history/i, `${relativePath} must not reference bvp history`);
    }
  });

  it("the bvp-history generator has exactly one writeFileSync call, targeting its own OUTPUT_PATH", () => {
    const source = readScript("scripts/generate-mlb-bvp-history.mjs");
    const writeCalls = source.match(/writeFileSync\([^)]*\)/g) ?? [];
    assert.equal(writeCalls.length, 1, `expected exactly one writeFileSync call, found ${writeCalls.length}`);
    assert.match(writeCalls[0], /OUTPUT_PATH/);
    assert.doesNotMatch(writeCalls[0], /hr-props-raw|hr-props-best-bets/);
  });

  it("the bvp-history generator's only readFileSync call targets its own input path (hr-props-raw.json by default), never hr-props-best-bets.json", () => {
    const source = readScript("scripts/generate-mlb-bvp-history.mjs");
    const readCalls = source.match(/readFileSync\([^)]*\)/g) ?? [];
    assert.equal(readCalls.length, 1, `expected exactly one readFileSync call, found ${readCalls.length}`);
    assert.match(readCalls[0], /args\.input/);
    assert.doesNotMatch(readCalls[0], /hr-props-best-bets/);
  });
});
