# Social card framework

Supported templates: `mlb_daily_morning`, `mlb_daily_confirmed`.

The framework separates frozen upstream selection from normalization, validation, deterministic SVG rendering, Playwright PNG conversion, and output writing. Renderers preserve row order and never select, rerank, infer betting sides, or fabricate odds.

## Snapshot definitions

- `gamesModeled`: scheduled games represented by the upstream slate snapshot.
- `projectedStartingPitchers`: current projected starter rows represented by the upstream snapshot.
- `modeledHitters`: count of hitter projection rows available to the morning adapter. This is not a count of lineups.
- `highestHrScore`: highest HR Score from the already selected/normalized morning HR input.
- `highestProjectedK`: highest projected strikeout value from the already selected/normalized K input.
- `lastRefresh`: Eastern display timestamp supplied by the upstream artifact.

## Commands

```bash
npm run social-card:mlb:morning -- --input=scripts/fixtures/mlb-daily-morning.json
npm run social-card:mlb:confirmed -- --input=scripts/fixtures/mlb-daily-confirmed.json
node scripts/generate-social-card.mjs --template=mlb_daily_confirmed --input=scripts/fixtures/mlb-daily-confirmed-partial.json --preview
```

Fixture mode is network-free. Real-data composite adapters are intentionally not implemented here. Morning may later consume frozen morning HR and K plans. Confirmed generation must fail until a validated confirmed-values source is supplied.

Incomplete confirmed previews use `mlb-daily-confirmed-preview.*`, set `preview: true`, `publishReady: false`, and retain machine-readable readiness reasons.

Logo loading first checks local SVG assets under `public/assets/mlb/team-logos/`, then the existing `public/logos/mlb/` path. It never fetches remote assets at render time. Missing assets use a fixed abbreviation fallback. Existing repository logo mappings largely reference ESPN CDN assets, so they are not reused as runtime dependencies. Add locally licensed/approved SVGs incrementally using canonical filenames and aliases in `core.mjs`.

The live HR selector remains capped at five rows. The renderer supports six; changing the production selection policy requires a separate PR.

Future site migration should consume the same normalized JSON in a React card component, run beside legacy Social Media Tables behind a feature flag, validate parity, then retire the legacy tables in a later PR. X integration should first upload dry-run artifacts during the existing confirmed/morning windows and reuse the current leases, receipts, account checks, and duplicate protection.
