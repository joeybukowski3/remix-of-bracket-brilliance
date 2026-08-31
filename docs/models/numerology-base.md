# Base Numerology (Alignment Score)

## Current authority

This document is the current methodology and contract authority for the
JoeKnowsBall MLB **Base Numerology** model — the daily "Alignment Score" that
selects and ranks the numerology leaderboard.

Subject to the authority hierarchy in [../DECISIONS.md](../DECISIONS.md).
`KS-007` (methodology vs presentation) and `KS-008` (a score is not a calibrated
probability, edge, or pick) are binding. Product routing, artifacts, and
delivery: [../features/numerology.md](../features/numerology.md).

The Sin City / Masonic component is a **separate** contract:
[sin-city.md](sin-city.md). It is never blended into the Base Numerology score.

## Status / version

- **Methodology version `3.0.0`** — `config/mlb-numerology-methodology.json`
  `version` field; hierarchical scoring.
- Deterministic engine: `scripts/numerology-scoring-engine.mjs`
  (`scorePlayerProfile`), driven by `scripts/generate-mlb-numerology.mjs`.
  Browser display port: `calculateNumerologyScoreBreakdown` in
  `src/lib/numerology/mlbScoreAudit.ts` (same weights JSON, same normalization —
  parity enforced by `src/lib/numerology/generator-parity.test.ts`).
- The legacy v2 module `src/lib/numerology/scoring.ts` (`scorePlayer`, `/60`
  ceiling, `v2.0.0`) is **superseded** and appears to be referenced only by
  tests.
- `KS-004` conflict: `docs/numerology-v3-promotion-criteria.md` still frames v3
  as un-promoted. Current committed code shows v3 is live. See
  [../features/numerology.md](../features/numerology.md#conflict-v3-promotion-criteria-doc-vs-current-code).

## Included fields / signals

Numerology system: Pythagorean. Master numbers `[11, 22, 33]`. Number families
`[1,4,7] [2,5,8] [3,6,9]`.

Scored player fields, by tier (`fieldTiers` in the config):

| Tier | Fields | Notes |
| --- | --- | --- |
| Tier 1 | `personalDay`, `lifePath`, `birthDay`, `expression` | Exact-compound matches here dominate and drive the synergy bonus. |
| Tier 2 | `jersey` | |
| Tier 3 | `battingOrder`, `calendarDay`, `repeatedDigit` | |

Signal / match types (`ScoredSignal.type`): `primary_exact_master`,
`primary_exact_root`, `primary_root`, `personal_cycle`, `name_resonance`,
`secondary_exact` (Calendar Day), `secondary_root`, `family_support`,
`contextual_echo` (repeated date digit), `countercurrent` (negative).

Daily profile inputs: Universal Day (`full_date_all_digits` raw sum → compound →
root/master), Calendar Day (`day_of_month_digits`), primary/secondary family,
countercurrent (`9 − root`, `0 → 9`), repeated date digits.

Signal capabilities currently **implemented**: `personalDay`, `jersey`,
`battingOrder`, `lifePath`, `birthDay`, `expressionNumber`, `repeatedDateDigits`,
`multipleCountercurrentPenalty`.

## Excluded fields

- **Age** — `signalCapabilities.age` = "display-only — informational profile
  data, never scored". Both engines contain an explicit
  `Age is informational … never awards points` branch and never call `award`
  for age. `ageExactMaster` / `ageExact` / `ageRoot` weights remain in the JSON
  but are **dead** (no code path reads them). **Verified: Age is currently
  excluded.** It remains excluded unless explicitly reopened (see "Reopening"
  below).
- **Baseball opportunity** — `numerologyWeight: 1`, `baseballWeight: 0`;
  `rankingBasis: "numerology_only"`. Displayed as context only; never affects
  score, qualification, or rank.
- **Disabled signals** (defined but not in the scoring pipeline):
  `gameStartTimeNumber`, `teamCityBallpark`, `opposingPitcherProfile`,
  `statisticalMilestone`.
- `convergenceMaxBonus`, `exactComboBonus`, `birthdayComboBonus` weights are all
  `0` (superseded by the synergy bonus).

## Scoring / normalization contract

For each field, the strongest applicable match is awarded once
(`awarded` set prevents the same source scoring again at a lower tier). Signals
are then split:

- **Direct** positive signals (exact-master / exact-target matches): full raw
  points, never decayed.
- **Indirect** positive signals (root / secondary / family / echo): sorted by
  tier asc → raw points desc → field name, then multiplied by the
  **indirect decay schedule** `[1.0, 0.7, 0.4, 0.2]` (first indirect 100%,
  second 70%, third 40%, fourth+ 20%), floored at 1 point each.
- **Countercurrent** signals: negative, applied at full weight. Two or more
  independent countercurrents add a compounding penalty
  `−countercurrentMultiple × (n − 1)`.

**Synergy bonus** (Tier-1 only; only `primary_root` / `personal_cycle` /
`name_resonance` qualify as a Tier-1 root match):

- ≥ 2 Tier-1 fields with an exact-compound match → `+synergyDoubleExactTier1`
  (12); ≥ 3 → additional `+synergyTripleExactTier1` (6).
- exactly 1 Tier-1 exact + ≥ 1 Tier-1 root match → `+synergyExactPlusRootTier1`
  (4).

## Weights (current — `config/mlb-numerology-methodology.json`)

Selected values (full list in the config `weights` block):

| Weight | Value | | Weight | Value |
| --- | --- | --- | --- | --- |
| `personalDayExactMaster` | 24 | | `lifePathExact` | 22 |
| `personalDayExact` | 22 | | `lifePathRoot` | 11 |
| `personalDayRoot` | 11 | | `birthDayExactMaster` | 24 |
| `jerseyExactMaster` | 24 | | `birthDayExact` | 22 |
| `jerseyExact` | 18 | | `birthDayRoot` | 11 |
| `jerseyRoot` | 9 | | `expressionExact` | 22 |
| `battingOrderExactRoot` | 8 | | `expressionRoot` | 11 |
| `calendarDayExactCompound` | 8 | | `primaryFamilyMatchTier1` | 5 |
| `calendarDayRoot` | 4 | | `primaryFamilyMatch` | 3 |
| `secondaryFamilyMatch` | 1 | | `repeatedDateDigit` | 2 |
| `countercurrentHighField` | 7 | | `countercurrentTier2` | 5 |
| `countercurrentTier3` | 3 | | `countercurrentMultiple` | 3 |
| `synergyDoubleExactTier1` | 12 | | `synergyTripleExactTier1` | 6 |
| `synergyExactPlusRootTier1` | 4 | | | |

## Output scale

```
rawNumerology = Σ(direct) + Σ(indirect × decay) − countercurrentTotal + synergyBonus   (floored at 0)
Alignment Score = min(100, round(rawNumerology / 76 × 100))
```

`normCeiling` = `normalizationDenominator` = **76**.

Score tiers (`scoreTiers`): **≥ 85 Elite Alignment**, **≥ 75 Strong**,
**≥ 60 Qualified**, **< 60 Watchlist**.

## Artifacts / producers

| Artifact | Producer |
| --- | --- |
| `public/data/mlb/numerology-daily.json` | `scripts/generate-mlb-numerology.mjs` + `scripts/numerology-scoring-engine.mjs` + `config/mlb-numerology-methodology.json`; workflow `generate-mlb-numerology.yml` |
| `public/data/mlb/numerology/daily-card.json`, `archive/`, `history/` | `scripts/lib/mlb-numerology-tracking.mjs` |
| `public/data/mlb/numerology/performance*.json` | `scripts/grade-mlb-numerology-plays.mjs`, `scripts/persist-mlb-numerology-performance.mjs`; workflow `mlb-numerology-grade.yml` |

Layer 3 Grok narrative (`prompts/mlb-numerology-system.md`,
`grokPermittedFields`) is presentation copy only — it cannot change any number,
add players, or change lines/lineups (`grokProhibitedActions`, `KS-008`).

## Consumers

- `/mlb/numerology` (`MlbNumerologyPageEnhanced`) via
  `src/hooks/useMLBNumerology.ts` + `mlbScoreAudit.ts` breakdown.
- Numerology Explorer (`src/components/mlb/numerology/*`).
- Numerology email + X delivery — filtered by
  `scripts/lib/mlb-numerology-x-selection-core.mjs`
  (`NUMEROLOGY_QUALIFYING_SCORE_THRESHOLD = 50`, confirmed-lineup only). Delivery
  never re-scores or re-ranks.
- `x-export` social-image route.

## Known limitations

- No calibration or validation gate: the Alignment Score is a deterministic
  resonance measure, **not** a win probability, edge, or pick (`KS-008`).
  Surfaces use descriptive language only.
- `normCeiling` (76) is a fixed normalization constant, not an empirically
  derived maximum; scores can saturate at 100.
- Identity coverage varies — players without a confirmed birth date score on a
  reduced field set (`jersey_only` / `none`); the v3 promotion doc's coverage
  gates were point-in-time.
- `src/lib/numerology/numerology-target-priority.test.ts` has pre-existing
  failures noted in the promotion doc.
- Disabled signals mean team/ballpark, game-time, opposing-pitcher, and
  milestone numerology are collected but unscored.

## Reopening / version criteria

- Any change to weights, tiers, the decay schedule, `normCeiling`, synergy
  rules, the scored-field set, or the Age exclusion is a methodology change:
  bump `config/mlb-numerology-methodology.json` `version`, update this document
  in the same PR, and record the decision in [../DECISIONS.md](../DECISIONS.md)
  if it is repository-level.
- **Age stays excluded** unless a PR explicitly reopens it with a documented
  rationale, a `version` bump, and updated `signalCapabilities.age`.
- The historical gate checklist in
  `docs/numerology-v3-promotion-criteria.md` is provenance for how v3 was
  evaluated; it is not a live checklist and does not govern future versions.
