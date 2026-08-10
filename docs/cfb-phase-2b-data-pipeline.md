# CFB Phase 2B data pipeline

Provider: CollegeFootballData.com (CFBD API v2). The scripts use bearer authentication from the
`CFBD_API_KEY` process environment variable. The credential is never written to disk.

## Commands

```powershell
$env:CFBD_API_KEY = "your-key"
npm run cfb:fetch-data
npm run cfb:fetch-transition-teams
npm run cfb:build-ratings
```

`cfb:fetch-data` fetches six source datasets (four required, two optional), then writes
raw responses and a SHA-256 manifest under `data/cfb/cfbd/raw/`. It never makes per-team requests.
Because CFBD requires a week, team, or conference selector for `/games/teams`, the 2025 team-stat
dataset is assembled from season-type/week bulk requests and deduplicated by game ID.
The immutable 2025 responses are reused by `cfb:build-ratings`; React never calls CFBD.

The build command resolves the 138-team mapping, normalizes games and selected team-game stats,
derives deterministic opponent-adjusted yards per play, passes the inputs through the Phase 2A
model and SOS engine, validates the output, and writes review artifacts under
`data/generated/cfb/`.

## FCS policy

FCS games are retained in normalized historical data and raw team QA summaries. They are excluded
from opponent adjustment and SOS because no reliable FCS strength baseline is present. An FCS or
unknown opponent is skipped, never assigned a zero-strength rating. This policy is centralized as
`CFB_PIPELINE_CONFIG.fcsPolicy`.

## Optional inputs

CFBD's current returning-production response contains offensive PPA/usage only. The pipeline uses
`percentPPA` as returning offensive production when present; defensive returning production and QB
continuity remain `null`. Talent composite is stored in model inputs for future use, but the Phase
2A roster-talent weight remains disabled.

Generated files must not be hand-edited. Production pages should only be switched from sample data
after a fetched build validates all 138 teams and the generated output is reviewed.

## FCS-to-FBS transition fallback

`cfb:fetch-transition-teams` makes four narrow requests: `/games` and `/games/teams` for North
Dakota State and Sacramento State. It writes `transition-teams-2025.json` separately from the FBS
cache and a companion manifest with request metadata, byte size, and SHA-256.

The build normalizes those games and statistics through the same shared parser, deduplicates by
CFBD game ID, and uses the full prior-FCS sample only when the team has no adequate prior-FBS
history. These raw inputs carry `prior-fcs-fallback` provenance, source classification, sample-game
count, and source game IDs. They never enter the FBS opponent-adjustment network, receive no
cross-classification penalty/bonus, and retain null returning-production, QB, and talent fields
when unavailable.
