# First NBA odds capture: local execution handoff

The registry recognizes the owner-confirmed 500-credit Starter month while leaving `liveApproval: null`. The October 20 balance is historical. Both local input files below are gitignored and excluded from Vercel uploads. Do not put a credential in either file.

Before any request, obtain a fresh authenticated provider dashboard reading. Save `data/nba/quota-probe/current-usage.json` with exactly these fields, using the actual observed UTC instant, used and remaining amounts, and the next monthly reset instant:

```json
{"plan":"Starter","limit":500,"used":0,"remaining":500,"observedAtUtc":"YYYY-MM-DDTHH:mm:ssZ","resetDateUtc":"YYYY-MM-01T00:00:00Z"}
```

The values must reconcile and the reading must be less than 24 hours old. The local command refuses missing or stale evidence, an exhausted 206/month or 15/day NBA allowance, the protected peer reserve, and the account quota ceiling. The credential must be available locally as `THE_ODDS_API_KEY`; the GitHub and Vercel secret bindings do not populate a local shell.

No currently valid provider NBA event ID is recorded in source. After **separate authorization for one zero-market discovery request**, save `data/nba/quota-probe/events-discovery-approval.json` with exactly the following fields and actual approval identity/time:

```json
{"id":"nba-odds-unique-discovery-id","approvedBy":"OWNER","approvedOn":"YYYY-MM-DDTHH:mm:ssZ","expiresAt":"YYYY-MM-DDTHH:mm:ssZ","scope":"NBA events discovery one request","maxUnits":0}
```

Run from the repository root:

```powershell
npx tsx scripts/nba-odds-events-discovery.ts --discover-once
```

This calls `/v4/sports/basketball_nba/events` once and returns event IDs. Its claim is consumed before the request and cannot be retried with that approval. Select an upcoming NBA event ID from that response.

After **separate authorization for one event/player_points request**, save `data/nba/quota-probe/one-credit-approval.json` with the same fields except a new unique `id`, scope `NBA one-event player_points one-credit probe`, and `maxUnits: 1`. Refresh `current-usage.json` if it is stale, then run:

```powershell
npx tsx scripts/nba-odds-one-credit-probe.ts --execute-one-credit --event-id=<PROVIDER_EVENT_ID>
```

The probe makes at most one event-odds GET with `regions=us`, `markets=player_points`, and `oddsFormat=american`. No retry or recurring job is enabled. Approval files expire within 24 hours of their `approvedOn` time. The durable claim and quota ledger are stored under `data/nba/quota-probe/`; keep them for duplicate-request protection.
