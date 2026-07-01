# MLB Numerology v3 — Promotion Criteria

Branch: `test/numerology-scoring-hierarchy`  
Target: merge to `main` and replace live scoring

v3 may replace the live scoring engine when **all** of the following conditions are met.

---

## 1. Score Parity and Saturation

- [ ] Avg v3 score for a full slate is within ±5 points of the v2 avg (prevents score inflation or compression)
- [ ] Saturation (players scoring ≥76 / ceiling) is ≤ 15% of the slate — v3 should not hand top marks to a third of the field
- [ ] Score distribution covers all four tiers (Elite / Strong / Qualified / Watchlist) with no tier empty

## 2. Fixture Behavior (Regression Tests)

The following specific-player scores must match on every run:

| Player | Condition | Expected Score |
|--------|-----------|----------------|
| Jackson Merrill | June 30 2026 — LP 19 exact + BD 19 exact | 79 |
| George Springer | June 30 2026 — BD 19 exact + LP 46/1 root | 61 |
| Alejandro Osuna | June 30 2026 — Jersey #19 Tier2 exact + BD 10/1 root | 38 |
| Kazuma Okamoto | June 30 2026 — accumulated indirect only | 30 |

Run: `npx vitest run src/lib/numerology/hierarchical-scoring.test.ts`  
All 40 tests (including edge-case synergy and precedence tests) must pass.

## 3. Ranking Turnover Review

- [ ] Top-5 rank turnover vs v2 baseline has been manually reviewed and each new entrant is explained by a confirmed numerological alignment (not a data artifact)
- [ ] Top-10 rank turnover has been reviewed and no player appears solely due to a missing-data default
- [ ] No player is ranked top-10 with `identityCoverage: none`

## 4. Identity Coverage

- [ ] ≥ 85% of scored batters have `identityCoverage: full` (birthDate confirmed via player identity cache)
- [ ] The remaining ≤ 15% are `jersey_only` with confirmed jersey numbers — no `none` coverage player in top 20

## 5. No Player-Specific Hardcoding

- [ ] `scripts/generate-mlb-numerology.mjs` contains zero player-name conditionals
- [ ] `src/lib/numerology/mlbScoreAudit.ts` contains zero player-name conditionals
- [ ] All weights and thresholds come from `config/mlb-numerology-methodology.json`
- [ ] `grep -n "Merrill\|Springer\|Osuna\|Okamoto"` in those three files returns nothing

## 6. Synergy Qualification Verified

- [ ] `family_support` type signals do NOT trigger the +4 exact+root synergy bonus (test: hierarchical-scoring.test.ts)
- [ ] `secondary_exact` (Calendar Day match) signals do NOT trigger the +4 synergy bonus (test: hierarchical-scoring.test.ts)
- [ ] Only `primary_root`, `personal_cycle`, `name_resonance` qualify as root matches for synergy

## 7. Signal Precedence Verified

- [ ] Jersey: Universal Day exact (direct, 18 pts) always evaluated before Calendar Day exact (indirect, 8 pts)
- [ ] BirthDay: root match (11 pts indirect) always evaluated before Calendar Day exact (8 pts indirect)
- [ ] Both verified by dedicated precedence tests in `hierarchical-scoring.test.ts`

## 8. Config is the Single Source of Truth

- [ ] Generator does not hardcode `TIER1_FIELDS`, `TIER2_FIELDS`, `INDIRECT_DECAY` — all derived from JSON
- [ ] Audit does not maintain a separate `DEFAULT_WEIGHTS` block — all derived from JSON
- [ ] `config/mlb-numerology-methodology.json` version field reads `"3.0.0"`

## 9. Full Test Suite

- [ ] `npx vitest run` — all tests in `src/lib/numerology/` pass (pre-existing failures in `numerology-target-priority.test.ts` must be resolved or explicitly accepted with documented reason)
- [ ] `npx tsc --noEmit` passes with zero errors

## 10. Build Passes

- [ ] `npm run build` (or `pnpm build`) completes without error
- [ ] No browser-bundle imports of Node.js-only modules (the config JSON import via `resolveJsonModule` is safe for Vite/browser bundles)

## 11. Desktop and Mobile Audit

- [ ] Numerology leaderboard renders correctly on desktop (1440px)
- [ ] Score breakdown modal opens and shows signals for at least one player with full identity coverage
- [ ] No layout regression on mobile (375px)

## 12. Shadow Comparison Filed

- [ ] `artifacts/numerology-shadow-comparison-YYYY-MM-DD.json` exists for at least one recent slate
- [ ] Shadow comparison has been reviewed by a human before promoting
- [ ] No production data file was modified during shadow comparison run

---

## Sign-off Checklist

When all criteria above are checked, create a PR from `test/numerology-scoring-hierarchy` → `main` with:

- This document as part of the PR description
- The shadow comparison summary table (top-10 v3 ranking and deltas)
- Confirmation that no production data was overwritten

Only then merge.
