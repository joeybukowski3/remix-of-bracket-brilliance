# Weekly fantasy artifact operations

The public consumers read the canonical static artifact for the selected season and week. They do not calculate ranks and never substitute another week or the Rest-of-Season board when an artifact is missing.

## Game-week refresh sequence

1. Refresh the current nflverse roster, player, and injury source caches.
2. Generate the current matchup injury artifact with `npm run nfl:matchup-injuries`.
3. Regenerate the weekly fantasy artifact with `npm run fantasy:weekly-rankings -- --season <season> --week <week>`.
4. Validate, then publish the refreshed static artifacts through the normal release process.

The ranking artifact must be regenerated after a new current-week injury report becomes available. Availability remains descriptive and affects confidence or eligibility according to the canonical authority; it never creates an injury penalty or changes the ranking formula.

## Recommended cadence and freshness

- Refresh roster/player inputs on Tuesday and whenever material transactions land.
- Refresh injury inputs after official Wednesday, Thursday, and Friday reports.
- On each game day, refresh about four hours and again about 90 minutes before the relevant kickoff window.
- Target injury-source age of at most 24 hours from Wednesday through Saturday and at most four hours on game day.
- Regenerate the weekly artifact within 30 minutes of a successful source refresh.

If a source refresh or artifact validation fails, retain the last known-good artifact only with its original `inputAsOf` and confidence state. Never relabel a stale artifact, reuse another week's artifact, or fall back to ROS ranks. If no valid artifact exists for the selected week, consumers display an unavailable state while the rest of the application remains functional.

Automation is intentionally deferred to the operations phase; this integration adds no cron, deployment, or publication workflow.
