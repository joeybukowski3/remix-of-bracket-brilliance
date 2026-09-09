# NFL TD Scorer Preview V1

Status: implemented as an additive current-week research surface. JKB TD Score is a relative 0–100 player rating. It is not a calibrated touchdown probability, fair price, or sportsbook edge.

## Population and windows

The fixed score population is the current-week QB/RB/WR/TE candidate union from the canonical current-week yardage projection artifact. The touchdown generator calculates all component percentiles and scores for that full population before UI filters. Team, matchup, position, search, sorting, and expansion only operate on finished rows.

- `2025`: 2025 regular-season player and opponent games.
- `2026`: completed 2026 regular-season games. An available source with no completed games is `zero`, distinct from a missing source.
- `last8`: the eight latest applicable games ordered by season and week, crossing the season boundary.
- `TD L5/G`: rushing plus receiving TDs over the latest five games inside the selected sample.

## Formula

Every input component is normalized before blending with the canonical conservative large-population percentile: `count(finite values strictly lower) / finite population × 100`. Ties share the same percentile, missing values remain missing, and a singleton receives 50.

```text
JKB TD Score =
  0.25 × TD Opportunities
+ 0.20 × Player Usage
+ 0.15 × Team Usage %
+ 0.15 × TD Success
+ 0.10 × Opponent TD Opportunities Against
+ 0.10 × Opponent TDs Allowed to Position
+ 0.05 × Implied Team Points
```

A score fails closed to `null` if any required component is unavailable.

### Components

1. **Player Usage**: scoring-eligible carries plus targets per game. QB passing attempts are excluded; QBs contribute rushing usage only. Before full-population normalization, the rate is divided by the mean rate for that position to avoid a structural position-volume advantage.
2. **TD Opportunities**: `0.25 × percentile(RZ Opp/G) + 0.35 × percentile(Inside-10 Opp/G) + 0.40 × percentile(Goal-Line Opp/G)`.
3. **Team Usage %**: player scoring-eligible carries plus targets divided by team scoring-eligible carries plus targets over the selected games. RZ and goal-line shares remain separate audit fields and use their matching team scoring-area denominators.
4. **TD Success**: empirical-Bayes rushing-plus-receiving TD conversion over scorer opportunities: `(player TD + league TD/opportunity × 20) / (player scorer opportunities + 20)`. The fixed 20-opportunity prior prevents one-touch samples from dominating. Passing and special-teams TDs are excluded.
5. **Opponent TD Opportunities Against**: the same 25/35/40 scoring-area blend over the opponent defense's allowed opportunities per game. Higher is favorable to the player.
6. **Opponent TDs Allowed to Position**: rushing plus receiving TDs allowed per defensive game to QB, RB, WR, or TE. A passing touchdown is not counted for the passer, so the pass and reception are never double-counted. Before full-population normalization, the rate is divided by the league mean allowed to that position.
7. **Implied Team Points**: the existing market-derived current-week implied team point total. No points-to-touchdowns conversion is used.

## Touchdown context cache

`scripts/refresh-nfl-touchdown-context-cache.mjs` streams official nflverse PBP, validates every required header, and writes only scorer carry/target events to `data/nfl/nflverse/touchdown-context/`. The compact row retains game/play/drive identifiers, offense, defense, player attribution, opportunity type, yardline, inclusive `<=20`, `<=10`, and `<=5` flags, and the qualifying rushing/receiving touchdown outcome. Raw PBP is discarded. A checksum manifest records source columns, compact columns, row counts, source URL, and SHA-256.

The extractor excludes postseason, no-play, two-point, kneel, spike, passing-only, and unattributed plays. A missing required upstream field aborts extraction. A missing yardline on an otherwise eligible event is retained as missing and makes the affected scoring-area aggregate unavailable rather than counting as zero. If no validated compact cache is present, the preview generator leaves scoring-area fields, team usage, QB scoring-eligible usage, and JKB TD Score unavailable rather than using weekly-stat or points-based approximations.

`scripts/generate-nfl-touchdown-preview.ts` joins the compact cache, canonical nflverse player-week stats, completed game results, current-week identity/opponent context, and existing market implied team points into `public/data/nfl/2026/touchdown-preview.json`. Component raw values, normalized values, ranks, population sizes, source states, player history, and opponent history remain in the artifact for audit.

Anytime-touchdown sportsbook prices remain optional and unavailable. The current NFL market ingestion does not support `player_anytime_td`; TD Edge is outside V1.
