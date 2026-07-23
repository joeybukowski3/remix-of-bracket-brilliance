# MLB K Projection V2 Shadow UI Validation

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
