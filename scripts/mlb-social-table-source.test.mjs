import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/pages/MlbGameDetail.tsx", "utf8");

test("real HR social table renders odds through React structured rows", () => {
  assert.match(source, /function SocialTableHR/);
  assert.match(source, /data-hr-row/);
  assert.match(source, /data-hr-odds=\{hrOdds \?\? ""\}/);
  assert.match(source, /socialOdds\(r\.hrOddsYes\)/);
});

test("real K social table renders line and over price through React structured rows", () => {
  assert.match(source, /function SocialTableK/);
  assert.match(source, /data-k-line=\{kLineLabel\}/);
  assert.match(source, /data-k-odds-over=\{kOver \?\? ""\}/);
  assert.match(source, /data-k-odds-under=\{kUnder \?\? ""\}/);
  assert.match(source, /O \$\{kLineLabel\} \(\$\{kOver\}\)/);
});

test("odds are not patched through mobile enhancement DOM observers", () => {
  const mobileEnhancements = readFileSync("src/components/mlb/MlbMobileHubEnhancements.tsx", "utf8");
  assert.doesNotMatch(mobileEnhancements, /data-jkb-social/);
  assert.doesNotMatch(mobileEnhancements, /hrOddsYes|kOddsOver|data-hr-odds|data-k-odds-over/);
});
