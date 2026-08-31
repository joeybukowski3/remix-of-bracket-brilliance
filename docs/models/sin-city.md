# Sin City / Masonic (Numerology component)

## Current authority

This document is the current methodology and contract authority for the
**Sin City / Masonic** symbol evaluation — an optional, standalone scoring
component of the JoeKnowsBall MLB Numerology product.

Subject to the authority hierarchy in [../DECISIONS.md](../DECISIONS.md)
(`KS-007`, `KS-008`). Product routing: [../features/numerology.md](../features/numerology.md).
Base Numerology is a separate contract: [numerology-base.md](numerology-base.md).

This is **not** the `/mlb/sin-city` HR-rules screen — that is an unrelated Statcast
3-of-5 qualification system in `src/lib/mlb/mlbHrFilter.ts`, documented in
[../features/mlb-hr.md](../features/mlb-hr.md). Name collision only; no shared
code, fields, or artifacts.

## Standalone status

- Implemented by `evaluateSinCityMasonic` in
  `src/lib/numerology/sinCityMasonic.ts`.
- **Browser-only.** Computed client-side inside the Numerology Explorer
  (`src/components/mlb/numerology/NumerologyExplorer.tsx`,
  `ExplorerTable.tsx`, `ExplorerFilters.tsx`) via
  `calculateNumerologyScoreBreakdown`'s `options.sinCity`
  (`src/lib/numerology/mlbScoreAudit.ts`). Rendered only when the Explorer's
  Sin City toggle is on (`options.sinCity.included === true`).
- **No producer, no artifact, no workflow, no grading.** It is not written into
  `numerology-daily.json` and has no performance/results tracker.
- Weights are read from `config/mlb-numerology-methodology.json` `sinCity`
  block; code defaults (`DEFAULT_SIN_CITY_WEIGHTS`) match that block.

## Included fields

`SIN_CITY_FIELD_KEYS` — all included by default (`DEFAULT_SIN_CITY_FIELDS`),
each independently toggleable in the Explorer:

| Field | Source | Label |
| --- | --- | --- |
| `jersey` | jersey number | "Jersey #" |
| `battingOrder` | lineup spot | "Lineup Spot / Batting Order" |
| `birthDay` | reduced birth-day number | "Birthday" |
| `lifePath` | reduced life-path number | "Life Path" |
| `currentHrCount` | **season HR total only** | "Current HR Count" |

Missing / non-finite values contribute nothing (`matchKind: "missing"`,
0 points). Overlapping fields (`jersey`, `battingOrder`, `birthDay`, `lifePath`)
**also** score in the Base Numerology `/76` ledger at their normal weights — Sin
City awards only its own smaller symbol points, so no field is double-counted at
base weights.

## Exact signal types

Each reduced field value is classified against the daily profile
(`classifyMatch`) into one of:

| Kind | Condition |
| --- | --- |
| `exact` | value original/compound/master equals the Universal Day **master**, OR value original/compound equals the Universal Day **raw sum** (`universalDayRawSum`) |
| `root` | value root equals the Universal Day **root** |
| `family` | value root is in the day's **primary family** |
| `none` | no match (also the `0/0` sentinel) |
| `missing` | field value absent / non-finite |

Signal-type inclusion (`DEFAULT_SIN_CITY_SIGNAL_TYPES`: `exact`, `root`,
`family` all on) is independently toggleable; an excluded kind scores 0 for that
field (`"<kind> excluded"`).

## Weights

`DEFAULT_SIN_CITY_WEIGHTS` / config `sinCity`:

| Key | Value |
| --- | --- |
| `exact` | 3 |
| `root` | 2 |
| `family` | 1 |
| `combo3` | 2 |
| `combo4` | 4 |
| `combo5` | 6 |

## Combination bonuses

`comboBonusFor(hits)` where `hits` = count of fields with `points > 0` and a
match kind of `exact` / `root` / `family`:

- `hits ≥ 5` → `+combo5` (6)
- `hits ≥ 4` → `+combo4` (4)
- `hits ≥ 3` → `+combo3` (2)
- otherwise → 0

## Raw ceiling / normalization

```
fieldPoints = Σ(match points across all evaluated fields)   (missing / none / excluded = 0)
bonus       = fieldPoints + comboBonus
score       = min(100, round(bonus / SIN_CITY_RAW_CEILING × 100))
```

`SIN_CITY_RAW_CEILING` = **21** (5 fields × `exact` 3 = 15, plus `combo5` 6).

## Final output scale

`SinCityEvaluation.score` — an integer **0–100** standalone grade. Also returned:
`matches[]` (per-field detail), `matchCount` (qualifying hits), `evaluatedCount`,
`fieldPoints`, `comboBonus`, `bonus`, `rawCeiling`.

## Artifacts / producers

None. See "Standalone status" — this component has no generation script, no
JSON artifact, no workflow, and no grading pipeline.

## Consumers

- Numerology Explorer table (Sin City column), via `mlbScoreAudit.ts`
  `options.sinCity`.
- Nothing else. It is not consumed by the leaderboard score, the daily card, the
  email, the X post, or any tracker.

## Relevant tests

- `src/lib/numerology/sinCityMasonic.test.ts` — classification, weights, combo
  bonus, ceiling, standalone score.
- `src/lib/numerology/mlbScoreAudit.controls.test.ts` — Sin City opt-in /
  field / signal-type toggles through the audit layer.

## Limitations

- No calibration or validation gate (`KS-008`): a symbol-alignment grade, not a
  probability, edge, or pick.
- `currentHrCount` is season total only — no recent-window or rate context.
- `family` classification uses only the **primary** family (no secondary-family
  or countercurrent handling, unlike the Base Numerology ledger).
- `SIN_CITY_RAW_CEILING` (21) is a fixed constant, not an empirical maximum.
- Browser-only: not reproducible from committed artifacts.

## Version / reopening criteria

- Sin City / Masonic has **no independent version string**; it moves with
  `config/mlb-numerology-methodology.json` `version` (currently `3.0.0`).
- Any change to `SIN_CITY_FIELD_KEYS`, the `classifyMatch` rules, the `sinCity`
  weights, the combo thresholds, or `SIN_CITY_RAW_CEILING` is a methodology
  change: update the config and this document in the same PR.

## Locked boundary

**Sin City / Masonic is independent of Base Numerology and is never blended into
the Base Alignment Score.** The standalone `score` is normalized against its own
ceiling (21) and is "never folded into the /76 base ledger"
(`sinCityMasonic.ts`). Base Numerology's `rawNumerology` / Alignment Score
computation does not read any Sin City output. Combining the two — or feeding
Sin City points into the base ledger — requires explicit approval and a recorded
decision in [../DECISIONS.md](../DECISIONS.md).
