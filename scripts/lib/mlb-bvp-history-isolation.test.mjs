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

  it("the bvp-history generator has exactly one writeFileSync call, targeting its own output path", () => {
    const source = readScript("scripts/generate-mlb-bvp-history.mjs");
    const writeCalls = source.match(/writeFileSync\([^)]*\)/g) ?? [];
    assert.equal(writeCalls.length, 1, `expected exactly one writeFileSync call, found ${writeCalls.length}`);
    assert.match(writeCalls[0], /args\.output/);
    assert.doesNotMatch(writeCalls[0], /hr-props-raw|hr-props-best-bets/);
  });

  it("the bvp-history generator has exactly two readFileSync calls -- its own input path and its own prior output (same-slate cache) -- never hr-props-best-bets.json", () => {
    const source = readScript("scripts/generate-mlb-bvp-history.mjs");
    const readCalls = source.match(/readFileSync\([^)]*\)/g) ?? [];
    assert.equal(readCalls.length, 2, `expected exactly two readFileSync calls (input + same-slate cache), found ${readCalls.length}`);
    assert.ok(readCalls.some((call) => /args\.input/.test(call)), "one readFileSync call must read args.input (hr-props-raw.json by default)");
    assert.ok(readCalls.some((call) => /outputPath/.test(call)), "one readFileSync call must read the generator's own prior output, for same-slate cache reuse");
    for (const call of readCalls) assert.doesNotMatch(call, /hr-props-best-bets/);
  });
});
