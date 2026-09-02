# MLB K Projection V2 Shadow UI Validation

> **Status (2026-08-31 knowledge audit): HISTORICAL — validation snapshot
> (2026-07-23).** Records a browser-check pass of the internal `?debug=k-v2`
> comparison UI. **Not** current authority.
>
> **Superseded:** as of `KS-013` (2026-09-02) the live `projectedKs` is **K
> Projection V2.2** (`mlb-k-projection-v2-production`, `projectStrikeoutsV2`),
> resolved by `mlb-k-production-projection-v1` with legacy as a per-row
> fail-safe. The separate `workload-team-k-v3` workload/team-rate projection
> still rides shadow (`kWorkloadProjectionMode: "shadow"`).
>
> - Current K methodology and V2 status: [models/mlb-k-score.md](models/mlb-k-score.md)
> - Current K-props surface contract: [features/mlb-k.md](features/mlb-k.md)
> - Promotion decision: [DECISIONS.md](DECISIONS.md) `KS-013`; residual open
>   items in BACKLOG [BL-MLB-002](BACKLOG.md)

Date: 2026-07-23

Branch: NewKProp

Starting SHA: b188a8240e52f375db14b1dfe8e8b64faeac4f11

## Scope

Internal-only Strikeout Props V2 shadow comparison UI behind:

`/mlb/strikeout-props?debug=k-v2`

The public route remains:

`/mlb/strikeout-props`

The public `Proj K` value remains the legacy `projectedKs` field. V2 is labeled Shadow, Experimental, not production, and not historically validated.

## Browser Validation

Local production-like preview:

`npm run preview -- --host 127.0.0.1 --port 4173`

Audit command:

`node scripts/audit/mlb-k-v2-shadow-ui-browser-check.mjs`

| Route | Width | Document scrollWidth | Body scrollWidth | Page overflow | Debug banner | Shadow comparison | Expanded detail | X export attr |
|---|---:|---:|---:|---|---|---|---|---|
| `/mlb/strikeout-props` | 1440 | 1440 | 1440 | false | false | false | true | `mlb-strikeout-props` |
| `/mlb/strikeout-props` | 1280 | 1280 | 1280 | false | false | false | true | `mlb-strikeout-props` |
| `/mlb/strikeout-props` | 1024 | 1024 | 1024 | false | false | false | true | `mlb-strikeout-props` |
| `/mlb/strikeout-props` | 768 | 768 | 768 | false | false | false | true | `mlb-strikeout-props` |
| `/mlb/strikeout-props` | 390 | 390 | 390 | false | false | false | true | `mlb-strikeout-props` |
| `/mlb/strikeout-props?debug=k-v2` | 1440 | 1440 | 1440 | false | true | true | true | `mlb-strikeout-props` |
| `/mlb/strikeout-props?debug=k-v2` | 1280 | 1280 | 1280 | false | true | true | true | `mlb-strikeout-props` |
| `/mlb/strikeout-props?debug=k-v2` | 1024 | 1024 | 1024 | false | true | true | true | `mlb-strikeout-props` |
| `/mlb/strikeout-props?debug=k-v2` | 768 | 768 | 768 | false | true | true | true | `mlb-strikeout-props` |
| `/mlb/strikeout-props?debug=k-v2` | 390 | 390 | 390 | false | true | true | true | `mlb-strikeout-props` |
| missing shadow artifact simulation | 390 | 390 | 390 | false | true | false | true | `mlb-strikeout-props` |
| stale shadow artifact simulation | 390 | 390 | 390 | false | true | false | true | `mlb-strikeout-props` |

## Notes

- Normal public mode does not show V2 shadow metrics.
- Debug mode shows the internal comparison row only when a current-slate, valid, unambiguous shadow match exists.
- Missing or stale shadow artifacts suppress the V2 comparison and preserve the legacy Strikeout Props table and expanded row.
- The source-integrity panel surfaces `mlb-odds.json has no trustworthy date field.` as a nonfatal warning.
- The `data-x-export="mlb-strikeout-props"` attribute is unchanged in all checked modes.
