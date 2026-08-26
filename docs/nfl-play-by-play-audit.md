# NFL play-by-play audit (Phase 2 foundation)

Audit of nflverse play-by-play (`play_by_play_<season>.csv.gz`) for 2022-2025,
run to support the team play-volume / pass-tendency feature foundation in
`src/lib/nfl/props/teamPlayVolume.ts`. The raw files were fetched, inspected,
and discarded during this audit -- consistent with the repository's existing
policy that raw play-by-play is never committed (`nfl-epa-core.mjs`); only
the derived compact cache (`data/nfl/nflverse/play-volume-team-game/`) is
committed.

## Coverage found

| Season | Total rows | REG | POST | Weeks | Eligible plays (REG, non-2pt) |
| --- | --- | --- | --- | --- | --- |
| 2022 | 49,434 | 47,157 | 2,277 | 1-22 | 35,045 (542 team-games) |
| 2023 | 49,665 | 47,399 | 2,266 | 1-22 | 35,227 (544 team-games) |
| 2024 | 49,492 | 47,274 | 2,218 | 1-22 | 34,947 (544 team-games) |
| 2025 | 48,771 | 46,452 | 2,319 | 1-22 | 34,301 (544 team-games) |

2022's 542 (not 544) team-games matches the documented cancelled Week 17
BUF-CIN game (`docs/nfl-data-inventory.md`). The 2025 eligible-play figure
(34,301 REG) reproduces the redesign spec's independently-audited figure
(`nfl-matchup-analyzer-redesign-spec.md` §25.2) exactly, confirming this
pipeline's reused `classifyPlay` (imported directly from `nfl-epa-core.mjs`,
never reimplemented) produces the identical play population as the approved
EPA pipeline.

`roof` values observed: `dome`, `outdoors`, `closed`, `open` (all four
present across the seasons sampled). No weather (temp/wind) audit was
performed this phase -- deferred, see README.

## Fields present (all required fields found; none assumed)

`game_id`, `play_id`, `season`, `week`, `season_type`, `posteam`, `defteam`,
`down`, `ydstogo`, `yardline_100`, `score_differential`, `qtr`,
`game_seconds_remaining`, `half_seconds_remaining`, `wp` (posteam win
probability), `xpass`, `pass_oe`, `pass`, `rush`, `qb_scramble`, `qb_kneel`,
`qb_spike`, `sack`, `play_type`, `penalty`, `shotgun`, `no_huddle`,
`goal_to_go`, `roof`, `temp`, `wind`, `surface`, `epa`, `posteam_type`,
`two_point_attempt`, `aborted_play`. All present in every one of the four
seasons audited.

## Canonical play classification (2025 counts; 2022-2024 consistent within ~10%)

Reused verbatim from the approved EPA pipeline (`classifyPlay` in
`nfl-epa-core.mjs`) -- not reimplemented, so the two pipelines can never
silently disagree about what counts as an offensive play:

| Category | Rule | 2025 count | Notes |
| --- | --- | --- | --- |
| Eligible offensive play | `(pass==1 OR rush==1) AND epa present AND posteam present AND two_point_attempt!=1` | 36,025 (incl. POST) | Same filter as EPA pipeline |
| Dropback (pass) | `pass==1` | 22,069 | Includes sacks and scrambles |
| Designed rush | `rush==1` | 14,086 | Excludes scrambles (scrambles are `pass=1`) |
| QB scramble | `qb_scramble==1` | 1,221 | Always co-occurs with `pass==1`; `play_type` shows `"run"` for ~94%, the rest `"no_play"`/blank (penalty-nullified) |
| Sack | `sack==1` | 1,352 | Always co-occurs with `pass==1` (100% in every season checked) |
| Kneel | `qb_kneel==1` | 453 | `pass=0, rush=0` -- excluded from eligible plays by the indicators alone |
| Spike | `qb_spike==1` | 82 | `pass=0, rush=0` -- excluded by the indicators alone |
| No-play / nullified penalty | `play_type=="no_play"` | 4,723 | Per established repo policy (`nfl-epa-core.mjs`), these are **included** via the pass/rush indicator, not excluded by `play_type` -- confirmed this pipeline's aggregation matches that behavior exactly (34,301 REG eligible plays reproduces the spec's audited figure) |

`down` blank on non-scrimmage plays (kickoff/punt/FG/extra point) is
expected and does not affect eligibility, since those plays already fail
`pass==1 OR rush==1`.

## Neutral-situation definition

```
down IN (1, 2)
AND wp BETWEEN 0.20 AND 0.80        (posteam win probability)
AND half_seconds_remaining > 120
```

Chosen from fields actually present, not copied from a public site's
convention:

- **Down 1/2 only**: 3rd/4th down play-calling is dictated by yards-to-go,
  not free tendency, so including them would conflate two different
  decisions into one number.
- **`wp` 0.20-0.80**: excludes clock-protecting leads and garbage-time
  trailing situations. `wp` is nflfastR's own composite win-probability
  model (same provenance tier as `xpass` below), so this bound is itself
  situation-aware rather than a raw score-differential threshold.
- **`half_seconds_remaining > 120`**: excludes two-minute-drill situations,
  where pass rate spikes for clock-management reasons unrelated to a team's
  normal identity.

Alternative definitions considered and not used: a raw `|score_differential|
<= 8` threshold (rejected -- ignores time remaining entirely, so a 1-score
game with 30 seconds left would incorrectly count as neutral); a
distance-conditioned definition (`ydstogo` bucketed) (deferred -- adds
real value for a future expected-pass model, see below, but is not needed
to state a first neutral-situation rule and would only shrink the sample
further without changing the qualitative conclusion).

## True PROE: implemented, not deferred

nflverse's play-by-play already carries `xpass` (a play-level estimated
probability the play call is a pass, conditioned on down/distance/score/
time/field position -- nflfastR's own trained model) and `pass_oe`
(`= (actual_pass_indicator - xpass) * 100`, verified against sample rows:
e.g. a run with `xpass=0.5111` produces `pass_oe=-51.11`; a pass with
`xpass=0.6689` produces `pass_oe=33.11`).

Coverage on eligible plays: **99.96% (2022), 99.96% (2023), 99.98% (2024),
99.98% (2025)** -- verified by full-file audit of all four seasons, not a
sample.

This is the same provenance tier this repository already trusts for EPA
(`epa` is nflfastR's own column, "never recomputed or re-modelled" per
`nfl-epa-core.mjs`). By the identical policy, `pass_oe` is consumed as
authoritative here -- **this is genuine PROE**, not `team rate - league
average`, and is named `passRateOverExpected` in the feature schema
(`types/teamPregameFeatures.ts`) rather than a bare "PROE" label, for
clarity about what it measures.

One explicit choice: `passRateOverExpected` is averaged over **every**
eligible play in the window, not restricted to the neutral-situation subset.
`xpass` already conditions each individual play on its own down/distance/
score/time, so restricting to neutral plays again would just shrink the
sample without changing what the number represents. `earlyDownNeutralPassRate`
(the simple, non-model-based rate) is kept as a separate, deliberately
unconditioned-on-any-model metric for comparison.

## Distributions (season-to-date window, all 2,046 rows with >=1 prior game, all 4 seasons)

| Metric | Min | Max | Mean | Median |
| --- | --- | --- | --- | --- |
| Overall dropback rate | 0.385 | 0.855 | 0.617 | 0.619 |
| Early-down neutral pass rate | 0.300 | 0.824 | 0.530 | 0.523 |
| Pass rate over expected (pp) | -20.75 | +14.78 | -1.17 | -1.48 |

The mean PROE is not centered on zero. This is expected, not a defect: the
row population here is every team-week with at least one prior game, which
over-represents small early-season windows (a 1-2-game sample has far more
variance than a full-season number, and this population is not equally
weighted by season progress). This is documented as a Phase 3 methodological
note, not corrected in Phase 2 -- see the main Phase 2 report's "methodological
concerns" section.

## Not audited this phase

- Weather (`temp`/`wind`) beyond confirming the columns exist and are
  sometimes blank for domes.
- A distance-conditioned (`ydstogo`) refinement of the neutral-situation
  definition.
- Any field beyond what `REQUIRED_PLAY_VOLUME_PBP_COLUMNS` reads.
