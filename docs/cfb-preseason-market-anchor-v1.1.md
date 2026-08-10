# CFB preseason v1.1 market-anchor production model

Status: production methodology. Active version: `cfb-preseason-v1.1-market-anchor`.

## Source and provenance

The internal preseason baseline is Steve Makinen's 2026 power-rating table in the 2026 VSiN College Football Betting Guide, pages 46–47. The project copy used for verification is `C:\Users\jbloo\Desktop\2026-VSiN-CFB-Betting-Guide.pdf`.

The source table is an input, not a published JKB output. Public-facing methodology wording should be:

> JKB Preseason Power combines a market-informed preseason strength baseline with JoeKnowsBall efficiency data.

This wording does not imply that VSiN created or endorses JKB Power. Raw source values, VSiN commentary, picks, prose, and branding are not exposed in the runtime College Football data.

## Production calculation

1. Map all 138 source teams deterministically to JKB team IDs.
2. Standardize the raw market baseline across the 138-team league using a population z-score. This preserves ordering, ties, and relative spacing.
3. Build JKB statistical offense from 50% opponent-adjusted yards/play and 50% opponent-adjusted points/play.
4. Build JKB statistical defense from 50% inverted opponent-adjusted yards/play allowed and 50% inverted opponent-adjusted points/play allowed.
5. Apply the existing generic prior-FCS fallback policy to the performance offense/defense inputs for every transition team. This occurs before the league standardization in step 7 and is not applied again after blending.
6. Build statistical power from 50% statistical offense and 50% statistical defense.
7. Standardize statistical power across the 138-team league using a population z-score.
8. Compute raw JKB Power as `0.75 × market z-score + 0.25 × JKB statistical-power z-score`.
9. Generate unique ranks from raw JKB Power, breaking exact ties by ascending team ID.
10. Convert raw JKB Power to the existing 40–99 display scale using percentile normalization only after blending.

Returning production uses option A: it is excluded from the 25% statistical component. This keeps the candidate aligned with the requested efficiency-only adjustment and prevents a second preseason roster signal from stacking on top of the market baseline. Existing JKB Offense and JKB Defense display ratings are carried forward unchanged and remain statistical, not market-derived.

AP Rank is copied only as an independent comparison field. It is never passed to the calculation. Candidate SOS Remaining is recalculated with candidate JKB Power because the SOS engine uses opponent power.

## In-season boundary

The centralized market/JKB bands are 75/25 at 0 games, 65/35 after 1–2, 50/50 after 3–4, 35/65 after 5–6, 20/80 after 7–8, and 10/90 after 9 or more. Only the preseason band is active. The typed future boundary reserves 2026 opponent-adjusted offense and defense, record, scoring efficiency, and SOS Played without fabricating current-season performance.
