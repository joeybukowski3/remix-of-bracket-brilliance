# Proposed per-game win-probability model (unimplemented)

Status: **proposal only, not implemented.** No code in this repository computes
a per-game NFL win probability. This document exists so a future pass can
review and calibrate the model before any probability number reaches the
Seattle chapter, the season recap, or any other page.

## Why nothing shipped this pass

An audit of the repository (2026-07-17, branch `chatgpt/nfl-team-dashboards-final`)
found:

- No logistic/Elo-style conversion of a rating difference into a probability
  anywhere in the codebase, for any sport.
- No home-field, rest-day, or matchup adjustment folded into a probability.
- No season simulation or Poisson-binomial logic.
- No historical calibration or backtesting artifact (Brier score, log loss)
  for any NFL rating.
- No per-game historical dataset on this branch: only `main` has 2022-2025
  `games.json`/`results.json` and the nflverse weekly stats CSVs needed to
  fit and validate a model against real outcomes. This branch carries only
  the 2025 season-aggregate metrics pulled for the v0.3 guide rebuild.

Fitting and validating a probability model — properly, with a held-out
season, a real scoring rule, and no look-ahead bias — is a separate, sizeable
effort from building the schedule breakdown UI. Rather than ship an
uncalibrated number labeled "probability," this pass builds the full
schedule breakdown from real, already-sourced data (opponent identity,
rating, market win total, rest edge, matchup rating gaps) with no
probability field, and leaves the model below for a dedicated future pass.

## Proposed formula

```
P(Seattle win) = clamp(
  1 / (1 + 10 ^ (-adjustedRatingDiff / S)),
  P_MIN, P_MAX
)

adjustedRatingDiff =
    (seattle.publicRating - opponent.publicRating)      // v0.3 base effect
  + homeFieldPoints(homeAway)                            // +H home, -H away, 0 neutral
  + restPoints(restEdgeDays)                              // small, capped
```

- `S` (logistic scale), `H` (home-field points), and the rest-day
  coefficient are **not chosen here** — they must come from fitting against
  real historical outcomes, not a guessed constant.
- `P_MIN` / `P_MAX`: propose `0.05` / `0.95` so no game is ever presented as
  a certainty. Exact values should be revisited once calibration data is in
  hand.

### Avoiding double-counting

`seattle.publicRating` is itself a composite that already reflects offense
and defense performance (see `preseason-power-ratings.json`'s
`formulaWeights`). The per-game offense-vs-defense matchup gaps already
shown in the schedule breakdown (`matchupEdge.offenseVsOpponentDefense`,
`.defenseVsOpponentOffense`) are a *decomposition* of that same composite
gap, not additional independent signal. The proposed formula above
deliberately uses only the **overall** rating gap as the base term — it does
not also add the offense/defense sub-edges on top, which would count the
same underlying signal twice.

### Base rating vs. adjustments

The formula is structured so the base-rating term (`publicRating` difference)
and the situational adjustments (home field, rest) are additive and
separable, so each can be reported and audited independently rather than
folded into one opaque number.

## Required calibration work before this ships

1. Pull `public/data/nfl/<season>/games.json` and `results.json` for
   2022-2025 from `main` (same copy pattern already used for the v0.3
   artifacts), plus a **point-in-time** rating for each team entering each
   game — not a season-end rating, to avoid look-ahead bias. This point-in-
   time rating does not currently exist in the repository and would need to
   be generated or reconstructed.
2. Fit `S`, `H`, and the rest coefficient by maximum likelihood against
   actual win/loss outcomes.
3. Evaluate on a held-out season (e.g., fit on 2022-2024, test on 2025) using
   Brier score and log loss, compared against a naive baseline (a
   constant-0.5 model, and a home-field-only model) to confirm the fitted
   model actually adds skill.
4. Only if the held-out Brier score is meaningfully better than the naive
   baselines should the model be labeled and shipped as "Experimental" —
   with the coefficients, sample size, and held-out score documented
   alongside it in the UI, not just in this file.
5. Until then, no page should display a number that looks like a win
   probability for an NFL game.

## What this unblocks once approved

With a calibrated per-game probability, `NFL_SEATTLE_SCHEDULE_2026` (see
`src/lib/nfl/seattleSchedule.ts`) already has every other input the formula
needs (`opponent.v03PublicRating`, `homeAway`, `rest.edgeDays`) — adding the
probability would mean adding one field to `NflSeattleScheduleGame`, not
restructuring the schedule contract. From there, Phase 4/7 of the original
request (season win distribution via exact Poisson-binomial calculation,
expected/low/most-likely/high-side outcomes) become straightforward.
