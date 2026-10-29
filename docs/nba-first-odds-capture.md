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

**Discovery above the ordinary NBA cap (owner decision 2026-10-28).** The provider's v4 documentation says `GET /v4/sports/{sport}/events` "does not count against the usage quota" (recorded as `EVENTS_ENDPOINT_CONTRACT`, reviewed 2026-10-28; the event-odds route costs 1 per market per region). So the quota policy lets exactly one discovery run when the shared account is past the ordinary 50% NBA limit (308 used of 500 was refused before this), and only when all of these hold: workflow `events-discovery`, endpoint `/events`, zero expected units, and a current approval with scope `NBA events discovery one request` and `maxUnits: 0`. Everything else keeps its limits: ordinary NBA requests, the NFL reserve, the account's own reserve cap, and the one-credit probe rule. The approval is single-use (file claim plus ledger), and a discovery the provider reports as charged is settled as a breach that blocks later NBA requests.

After **separate authorization for one event/player_points request**, save `data/nba/quota-probe/one-credit-approval.json` with the same fields except a new unique `id`, scope `NBA one-event player_points one-credit probe`, and `maxUnits: 1`. Refresh `current-usage.json` if it is stale, then run:

```powershell
npx tsx scripts/nba-odds-one-credit-probe.ts --execute-one-credit --event-id=<PROVIDER_EVENT_ID> --tipoff-utc=<COMMENCE_TIME_FROM_DISCOVERY>
```

`--tipoff-utc` is the event's `commenceTimeUtc` from the discovery response. Before the approval is read, claimed or reserved, the command refuses unless the current time is 47 to 240 minutes before that tipoff (the preferred window is 120 to 180; the last 2 minutes above the 45-minute floor are a margin for the response arriving), unless `THE_ODDS_API_KEY` is set in the shell, and unless `data/nba/odds-captures/` can take a file. The tipoff is what you supply: it is not tied to the event id, so copy it from the discovery response for that exact event. A line captured outside the window is still stored, but it can never become a pregame snapshot, so the board would show none of it; a response with nowhere to go is never bought.

The probe makes at most one event-odds GET with `regions=us`, `markets=player_points`, and `oddsFormat=american`: one event, one market and one region cost one credit, and `x-requests-last` is checked against that. The response is written to `data/nba/odds-captures/` (write-once, read-only, gitignored, excluded from Vercel uploads) before the quota reservation is settled. No retry or recurring job is enabled.

## Showing the captured line on the private board

The private preview board reads `data/nba/odds-captures/` and joins each stored line to the board by game, player and market. It makes no request and spends no credit.

```powershell
npx tsx scripts/nba-props-v1-build.ts --private-preview
```

The slate (`data/nba/props-v1/slate.json`) must contain the captured game, and the build must run before tipoff. The report prints how many lines were retrieved, matched, unmatched and shown, and every unmatched line with its reason (no projection for that player, game not on the board, tipoff more than an hour from the schedule, outside the pregame window, rights). With several books, the board shows the line most books agree on (ties go to the middle of the posted lines, then the lower one) from the book that posted it most recently, with that book's prices. A line with no provider update time is withheld; a stale one is shown flagged. Lines appear only in the private file under `data/nba/props-v1/`, which the published page refuses to display. Rules and tests: `src/lib/nba/props/v1/privateLines.ts`. Approval files expire within 24 hours of their `approvedOn` time. The durable claim and quota ledger are stored under `data/nba/quota-probe/`; keep them for duplicate-request protection.

### Alternate-line ladders (Bovada)

Some books, Bovada in the first real capture, return a ladder of alternate thresholds for one player (six to nine thresholds per player, each with its own prices) under the same market key `player_points` as the main line. The provider marks none of them as the main line, so the board does not guess: a book that posts several distinct lines for a player and market in one capture is **left out of the vote**, its lines are reported as unmatched ("alternate-line ladder: ..."), and every rung it posted is kept on the entry (`lineDetail.excluded`) and in the immutable capture. Not the middle rung, not the rung nearest the other books: a position in a ladder says nothing about which line the book calls its main one. A line that merely moved between two captures is not a ladder. If a provider later exposes a defensible main-line designation (a separate market key or an explicit flag), the rule can use it; until then the books that post one line per player carry the consensus. Applied to the first real capture it set aside Bovada's lines and changed no displayed line.

Each private board entry also carries `lineDetail`: every voting book's own line, over/under prices, provider update time and capture time, which book is shown (its line with its own prices, never a blend), the selection rationale in words, and the excluded books. The entry is private-only data (`containsPrivateData` refuses it on the public page). Scoring the lines afterwards: `docs/nba-evaluation-protocol.md`.

## Recovery after the October 22 quota denial

The 500-credit account reported 250 used and 250 remaining. The shared quota policy applied its 50% nonessential cap to all 250 credits already spent by NFL and other consumers, so the NBA one-credit reservation was denied with `QUOTA_HARD_STOP`. The corrected policy allows only the scoped, approved one-credit NBA probe to use the account cap of 450; the request gate still requires a fresh provider counter, the NBA 206/month and 15/day ceilings, and the dynamic peer reserve. Ordinary nonessential work remains under the 50% cap. This change does not itself authorize another provider request.

The denied attempt created a durable claim for its one-credit approval before quota reservation. Its claim exists, while the local ledger has no entry funded by that approval. Recover as follows:

1. Keep `data/nba/quota-probe/claims/` and `data/nba/quota-probe/the-odds-api_unverified-pool.json` intact. Do not delete a claim, reset the ledger, or reuse the denied approval ID.
2. Obtain a fresh authenticated dashboard reading for the same Starter account and update `current-usage.json` with the exact UTC observation time, 500-credit limit, used/remaining balance, and next reset instant. Confirm the values reconcile and that the reading is less than 24 hours old.
3. Obtain **new explicit authorization** for exactly one event/player_points request. Record it in `one-credit-approval.json` with a new unique `nba-odds-...` ID, the probe scope, `maxUnits: 1`, the actual approver and approval time, and an expiry no more than 24 hours later. Retain a private copy of the prior approval for audit; never reuse its ID.
4. Review the chosen upcoming event ID from the completed discovery. Before execution, verify the local quota ledger and approval claim state, and check that one credit leaves the current peer reserve and account safety reserve intact. Then run the one-credit command above once from this same workspace. A failure after the new claim is written requires another explicit approval and new ID; it is never a retry under the same approval.
