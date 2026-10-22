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

## Recovery after the October 22 quota denial

The 500-credit account reported 250 used and 250 remaining. The shared quota policy applied its 50% nonessential cap to all 250 credits already spent by NFL and other consumers, so the NBA one-credit reservation was denied with `QUOTA_HARD_STOP`. The corrected policy allows only the scoped, approved one-credit NBA probe to use the account cap of 450; the request gate still requires a fresh provider counter, the NBA 206/month and 15/day ceilings, and the dynamic peer reserve. Ordinary nonessential work remains under the 50% cap. This change does not itself authorize another provider request.

The denied attempt created a durable claim for its one-credit approval before quota reservation. Its claim exists, while the local ledger has no entry funded by that approval. Recover as follows:

1. Keep `data/nba/quota-probe/claims/` and `data/nba/quota-probe/the-odds-api_unverified-pool.json` intact. Do not delete a claim, reset the ledger, or reuse the denied approval ID.
2. Obtain a fresh authenticated dashboard reading for the same Starter account and update `current-usage.json` with the exact UTC observation time, 500-credit limit, used/remaining balance, and next reset instant. Confirm the values reconcile and that the reading is less than 24 hours old.
3. Obtain **new explicit authorization** for exactly one event/player_points request. Record it in `one-credit-approval.json` with a new unique `nba-odds-...` ID, the probe scope, `maxUnits: 1`, the actual approver and approval time, and an expiry no more than 24 hours later. Retain a private copy of the prior approval for audit; never reuse its ID.
4. Review the chosen upcoming event ID from the completed discovery. Before execution, verify the local quota ledger and approval claim state, and check that one credit leaves the current peer reserve and account safety reserve intact. Then run the one-credit command above once from this same workspace. A failure after the new claim is written requires another explicit approval and new ID; it is never a retry under the same approval.
