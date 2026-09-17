# NFL Situational Trends Study v1 — Phase 2 robustness

> Research artifact only. Results are descriptive historical associations, not picks, causal estimates, calibrated probabilities, or a betting system.

## Scope and methodology

Phase 2 preserves the locked Phase 1 baseline and studies exactly five areas over **2011-2025**: pre-bye teams, West-to-East early games, divisional underdogs, recognizable rest structures, and pre-bye versus post-bye composition. The source remains 3,919 regular-season games / 7,838 team-games with full spread coverage.

All cutoffs were fixed before inspecting Phase 2 results. Spread buckets are 7+, 3.5-6.5, 0.5-3, pick'em, and their underdog mirrors. Dog buckets are +0.5 to +3, +3.5 to +6.5, and +7 or more. FULL HISTORY is 2011-2025, RECENT FORM is 2021-2025, and eras are 2011-2018 versus 2019-2025.

Team and opponent quality use only completed current-season games before kickoff. Win percentage counts a tie as one-half win; pregame point differential is the average margin in those prior games. No end-of-season result enters a pregame classification. Season openers are retained as `No prior games`.

Rest differential bands are mutually exclusive. Recognizable schedule flags are explicitly nested/non-exclusive: one row may, for example, be both Thursday-after-Sunday and equally rested. Travel distance is coarse great-circle stadium distance, with Oakland (Raiders through 2019) and San Diego (Chargers through 2016) deterministic relocation overrides; it is not a route, arrival, or geospatial performance model.

Sample labels are descriptive only: **VERY SMALL** n<50, **LIMITED** n=50-99, **MODERATE** n=100-199, and **LARGER** n>=200. Wilson 95% intervals exclude pushes; ATS ROI assumes -110 and also excludes pushes.

## Executive conclusions

| Area | Robustness label | Conservative conclusion | Article value |
| --- | --- | --- | --- |
| Pre-bye robustness | SUBGROUP-DEPENDENT | The newer-era and recent gains are spread across four of five recent seasons and both winning- and losing-record teams, but are concentrated by market role and venue: favorites/home teams strengthened sharply while away teams and underdogs remained near 50% ATS. | The useful story is not a generic pre-bye rule: it is a neutral older era followed by broad recent-season improvement that is nevertheless concentrated among home favorites. |
| West-to-East early robustness | BROADLY SUPPORTED | The positive direction appears in both eras, for favorites and underdogs, in four of five Pacific-origin franchises, and across most seasons. It is not dominated by one or two teams, but the full sample is only moderate and large underdogs are a clear exception. | The narrow qualifier runs opposite the familiar fatigue narrative. Its broad distribution is notable, but the moderate total sample and unclustered uncertainty keep the conclusion descriptive. |
| Divisional underdog robustness | WEAK / NO BROAD EDGE | The 1,440-game full-history result is below -110 break-even. Recent improvement is concentrated in smaller dogs, road teams, and selected divisions; second meetings do not outperform first meetings. | The familiar divisional-dog story is worth retaining mainly as a reference angle: second meetings were not better, and the broad historical sample did not beat -110 break-even. |
| Rest disadvantage / rest advantage robustness | WEAK / NO BROAD EDGE | Neither generic rest advantage nor disadvantage shows a broad edge. Thursday short weeks are usually equal-rest games, Phase 1 short-rest disadvantage is overwhelmingly Monday-to-Sunday, and the only recent positive structure—mini-bye rest edge—remains negative after vig over full history. | The strongest article point is definitional: Thursday football is usually shared short rest, while true asymmetric rest structures show little broad ATS edge. |
| Pre-bye versus post-bye direct comparison | SUBGROUP-DEPENDENT | Pre-bye and post-bye samples have similar average team/opponent quality, home share, and broad market-role mix. The ATS gap is concentrated among favorites and home teams, so basic composition does not explain it away, but neither does the comparison establish a causal bye effect. | The comparison is valuable because simple strength and home/favorite frequency do not account for the gap; the divergence lives mainly inside the home/favorite subgroups and remains non-causal. |

## Pre-bye robustness

**Conclusion: SUBGROUP-DEPENDENT.** The newer-era and recent gains are spread across four of five recent seasons and both winning- and losing-record teams, but are concentrated by market role and venue: favorites/home teams strengthened sharply while away teams and underdogs remained near 50% ATS.

Article value: The useful story is not a generic pre-bye rule: it is a neutral older era followed by broad recent-season improvement that is nevertheless concentrated among home favorites.

Key findings:

- Full history is 251-218-11 ATS (53.5%, +2.2% ROI); recent form is 93-67-2 (58.1%, +11.0%). The fixed eras move from 49.6% to 57.9% ATS.
- Home pre-bye teams were 57.4% ATS full history and 66.2% recent; away teams were 48.6% and 50.0%.
- Favorites were 57.6% ATS full history and 67.9% recent; underdogs were 49.4% and 48.1%. The favorite/underdog split is the clearest concentration.
- Winning-record teams were stronger over full history, but recent results were also positive for losing-record teams (56.0%); this is not only a strong-team cohort.
- Four of five recent seasons exceeded 50% ATS, led by 2022 (24-9-1); 2021 was 16-16. Recent strength is not a single-season result, though every season is a very small sample.

### Overall qualifier

Final game before exactly one missing scheduled week, with 10-17 calendar days until the next game. Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| All qualifiers | Full 2011-2025 | 480 (LARGER) | 251-218-11 | 53.5% | 2.2% | 49.0%-58.0% | 258-218-4 | 54.2% | 0.18 | 0.83 | 49.5% | 49.8% |
| All qualifiers | Recent 2021-2025 | 162 (MODERATE) | 93-67-2 | 58.1% | 11.0% | 50.4%-65.5% | 89-71-2 | 55.6% | 0.32 | 0.42 | 49.5% | 50.5% |
| All qualifiers | Older 2011-2018 | 254 (LARGER) | 122-124-8 | 49.6% | -5.3% | 43.4%-55.8% | 134-118-2 | 53.2% | -0.18 | 0.85 | 49.4% | 49.3% |
| All qualifiers | Newer 2019-2025 | 226 (LARGER) | 129-94-3 | 57.9% | 10.4% | 51.3%-64.1% | 124-100-2 | 55.4% | 0.57 | 0.81 | 49.5% | 50.4% |

### Home / away

Phase 1 venue classification Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Home | Full 2011-2025 | 220 (LARGER) | 124-92-4 | 57.4% | 9.6% | 50.7%-63.8% | 130-90-0 | 59.1% | -1.06 | 1.72 | 49.5% | 51.6% |
| Home | Recent 2021-2025 | 69 (LIMITED) | 45-23-1 | 66.2% | 26.3% | 54.3%-76.3% | 41-28-0 | 59.4% | -0.42 | 1.52 | 51.0% | 53.3% |
| Home | Older 2011-2018 | 118 (MODERATE) | 59-56-3 | 51.3% | -2.1% | 42.3%-60.3% | 68-50-0 | 57.6% | -1.56 | 1.61 | 48.4% | 52.4% |
| Home | Newer 2019-2025 | 102 (MODERATE) | 65-36-1 | 64.4% | 22.9% | 54.6%-73.0% | 62-40-0 | 60.8% | -0.48 | 1.85 | 50.7% | 50.7% |
| Away | Full 2011-2025 | 192 (MODERATE) | 90-95-7 | 48.6% | -7.1% | 41.5%-55.8% | 91-99-2 | 47.9% | 1.68 | -0.18 | 51.8% | 50.5% |
| Away | Recent 2021-2025 | 71 (LIMITED) | 35-35-1 | 50.0% | -4.5% | 38.6%-61.4% | 34-35-2 | 49.3% | 1.13 | -1.05 | 48.8% | 50.3% |
| Away | Older 2011-2018 | 100 (MODERATE) | 44-51-5 | 46.3% | -11.6% | 36.6%-56.3% | 48-52-0 | 48.0% | 1.45 | 0.08 | 54.5% | 48.9% |
| Away | Newer 2019-2025 | 92 (LIMITED) | 46-44-2 | 51.1% | -2.4% | 40.9%-61.2% | 43-47-2 | 47.8% | 1.93 | -0.46 | 48.8% | 52.4% |
| Neutral | Full 2011-2025 | 68 (LIMITED) | 37-31-0 | 54.4% | 3.9% | 42.7%-65.7% | 37-29-2 | 56.1% | -0.07 | 0.82 | 43.0% | 42.1% |
| Neutral | Recent 2021-2025 | 22 (VERY SMALL) | 13-9-0 | 59.1% | 12.8% | 38.7%-76.7% | 14-8-0 | 63.6% | 0.02 | 1.70 | 47.2% | 42.0% |
| Neutral | Older 2011-2018 | 36 (VERY SMALL) | 19-17-0 | 52.8% | 0.8% | 37.0%-68.0% | 18-16-2 | 52.9% | -0.14 | 0.50 | 38.7% | 40.1% |
| Neutral | Newer 2019-2025 | 32 (VERY SMALL) | 18-14-0 | 56.3% | 7.4% | 39.3%-71.8% | 19-13-0 | 59.4% | 0.02 | 1.17 | 47.9% | 44.3% |

### Favorite / underdog / pick'em

Market role from team-relative settled spread Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Favorite | Full 2011-2025 | 240 (LARGER) | 136-100-4 | 57.6% | 10.0% | 51.2%-63.8% | 171-66-3 | 72.2% | -4.49 | 1.65 | 58.2% | 41.3% |
| Favorite | Recent 2021-2025 | 82 (LIMITED) | 55-26-1 | 67.9% | 29.6% | 57.1%-77.1% | 60-20-2 | 75.0% | -3.96 | 1.72 | 59.7% | 44.8% |
| Favorite | Older 2011-2018 | 130 (MODERATE) | 69-58-3 | 54.3% | 3.7% | 45.7%-62.7% | 91-38-1 | 70.5% | -4.54 | 2.49 | 55.6% | 41.0% |
| Favorite | Newer 2019-2025 | 110 (MODERATE) | 67-42-1 | 61.5% | 17.3% | 52.1%-70.1% | 80-28-2 | 74.1% | -4.42 | 0.65 | 61.2% | 41.7% |
| Underdog | Full 2011-2025 | 240 (LARGER) | 115-118-7 | 49.4% | -5.8% | 43.0%-55.7% | 87-152-1 | 36.4% | 4.84 | 0.02 | 40.8% | 58.3% |
| Underdog | Recent 2021-2025 | 80 (LIMITED) | 38-41-1 | 48.1% | -8.2% | 37.4%-59.0% | 29-51-0 | 36.3% | 4.71 | -0.91 | 39.1% | 56.3% |
| Underdog | Older 2011-2018 | 124 (MODERATE) | 53-66-5 | 44.5% | -15.0% | 35.9%-53.5% | 43-80-1 | 35.0% | 4.40 | -0.86 | 43.0% | 57.9% |
| Underdog | Newer 2019-2025 | 116 (MODERATE) | 62-52-2 | 54.4% | 3.8% | 45.3%-63.2% | 44-72-0 | 37.9% | 5.31 | 0.96 | 38.5% | 58.8% |
| Pick'em | Full 2011-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pick'em | Recent 2021-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pick'em | Older 2011-2018 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pick'em | Newer 2019-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |

### Fixed spread buckets

Predefined conventional half-point-aligned spread ranges Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Favorite 7+ | Full 2011-2025 | 44 (VERY SMALL) | 28-15-1 | 65.1% | 24.3% | 50.2%-77.6% | 40-3-1 | 93.0% | -9.25 | 4.86 | 66.4% | 28.2% |
| Favorite 7+ | Recent 2021-2025 | 10 (VERY SMALL) | 8-1-1 | 88.9% | 69.7% | 56.5%-98.0% | 9-0-1 | 100.0% | -8.05 | 8.25 | 61.6% | 28.2% |
| Favorite 7+ | Older 2011-2018 | 25 (VERY SMALL) | 16-9-0 | 64.0% | 22.2% | 44.5%-79.8% | 22-3-0 | 88.0% | -9.50 | 5.26 | 69.5% | 29.0% |
| Favorite 7+ | Newer 2019-2025 | 19 (VERY SMALL) | 12-6-1 | 66.7% | 27.3% | 43.8%-83.7% | 18-0-1 | 100.0% | -8.92 | 4.34 | 62.2% | 27.2% |
| Favorite 3.5 to 6.5 | Full 2011-2025 | 92 (LIMITED) | 52-40-0 | 56.5% | 7.9% | 46.3%-66.2% | 68-24-0 | 73.9% | -4.76 | 0.70 | 60.1% | 40.1% |
| Favorite 3.5 to 6.5 | Recent 2021-2025 | 31 (VERY SMALL) | 18-13-0 | 58.1% | 10.8% | 40.8%-73.6% | 21-10-0 | 67.7% | -4.94 | -0.61 | 62.3% | 43.3% |
| Favorite 3.5 to 6.5 | Older 2011-2018 | 50 (LIMITED) | 28-22-0 | 56.0% | 6.9% | 42.3%-68.8% | 39-11-0 | 78.0% | -4.60 | 2.26 | 56.3% | 40.8% |
| Favorite 3.5 to 6.5 | Newer 2019-2025 | 42 (VERY SMALL) | 24-18-0 | 57.1% | 9.1% | 42.2%-70.9% | 29-13-0 | 69.0% | -4.95 | -1.17 | 64.6% | 39.4% |
| Favorite 0.5 to 3 | Full 2011-2025 | 104 (MODERATE) | 56-45-3 | 55.5% | 5.9% | 45.7%-64.8% | 63-39-2 | 61.8% | -2.23 | 1.13 | 53.0% | 47.9% |
| Favorite 0.5 to 3 | Recent 2021-2025 | 41 (VERY SMALL) | 29-12-0 | 70.7% | 35.0% | 55.5%-82.4% | 30-10-1 | 75.0% | -2.23 | 1.89 | 57.3% | 49.9% |
| Favorite 0.5 to 3 | Older 2011-2018 | 55 (LIMITED) | 25-27-3 | 48.1% | -8.2% | 35.1%-61.3% | 30-24-1 | 55.6% | -2.24 | 1.44 | 48.6% | 46.7% |
| Favorite 0.5 to 3 | Newer 2019-2025 | 49 (VERY SMALL) | 31-18-0 | 63.3% | 20.8% | 49.3%-75.3% | 33-15-1 | 68.8% | -2.21 | 0.79 | 58.0% | 49.2% |
| Pick'em | Full 2011-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pick'em | Recent 2021-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pick'em | Older 2011-2018 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pick'em | Newer 2019-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Underdog 0.5 to 3 | Full 2011-2025 | 106 (MODERATE) | 49-53-4 | 48.0% | -8.3% | 38.6%-57.6% | 42-63-1 | 40.0% | 2.23 | -0.47 | 45.5% | 48.2% |
| Underdog 0.5 to 3 | Recent 2021-2025 | 40 (VERY SMALL) | 18-22-0 | 45.0% | -14.1% | 30.7%-60.2% | 16-24-0 | 40.0% | 2.21 | -0.86 | 44.0% | 49.1% |
| Underdog 0.5 to 3 | Older 2011-2018 | 57 (LIMITED) | 25-28-4 | 47.2% | -10.0% | 34.4%-60.3% | 22-34-1 | 39.3% | 2.25 | -1.18 | 47.6% | 47.4% |
| Underdog 0.5 to 3 | Newer 2019-2025 | 49 (VERY SMALL) | 24-25-0 | 49.0% | -6.5% | 35.6%-62.5% | 20-29-0 | 40.8% | 2.20 | 0.37 | 43.0% | 49.1% |
| Underdog 3.5 to 6.5 | Full 2011-2025 | 74 (LIMITED) | 40-34-0 | 54.0% | 3.2% | 42.8%-64.9% | 34-40-0 | 46.0% | 4.89 | 1.64 | 40.0% | 60.0% |
| Underdog 3.5 to 6.5 | Recent 2021-2025 | 18 (VERY SMALL) | 11-7-0 | 61.1% | 16.7% | 38.6%-79.7% | 9-9-0 | 50.0% | 4.83 | 2.94 | 35.9% | 52.7% |
| Underdog 3.5 to 6.5 | Older 2011-2018 | 45 (VERY SMALL) | 20-25-0 | 44.4% | -15.2% | 30.9%-58.8% | 17-28-0 | 37.8% | 4.96 | -0.20 | 39.5% | 62.3% |
| Underdog 3.5 to 6.5 | Newer 2019-2025 | 29 (VERY SMALL) | 20-9-0 | 69.0% | 31.7% | 50.8%-82.7% | 17-12-0 | 58.6% | 4.79 | 4.48 | 40.9% | 56.6% |
| Underdog 7+ | Full 2011-2025 | 60 (LIMITED) | 26-31-3 | 45.6% | -12.9% | 33.4%-58.4% | 11-49-0 | 18.3% | 9.38 | -1.12 | 33.4% | 74.1% |
| Underdog 7+ | Recent 2021-2025 | 22 (VERY SMALL) | 9-12-1 | 42.9% | -18.2% | 24.5%-63.4% | 4-18-0 | 18.2% | 9.16 | -4.16 | 32.9% | 72.4% |
| Underdog 7+ | Older 2011-2018 | 22 (VERY SMALL) | 8-13-1 | 38.1% | -27.3% | 20.8%-59.1% | 4-18-0 | 18.2% | 8.84 | -1.39 | 38.0% | 76.0% |
| Underdog 7+ | Newer 2019-2025 | 38 (VERY SMALL) | 18-18-2 | 50.0% | -4.5% | 34.5%-65.5% | 7-31-0 | 18.4% | 9.70 | -0.96 | 30.7% | 73.0% |

### Studied team pregame quality

Current-season record using only games completed before the qualifying kickoff; ties count as one-half win Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Winning pregame record | Full 2011-2025 | 206 (LARGER) | 117-85-4 | 57.9% | 10.6% | 51.0%-64.5% | 131-72-3 | 64.5% | -2.09 | 1.43 | 72.6% | 52.0% |
| Winning pregame record | Recent 2021-2025 | 74 (LIMITED) | 43-31-0 | 58.1% | 10.9% | 46.7%-68.7% | 44-28-2 | 61.1% | -1.78 | -0.49 | 70.4% | 54.6% |
| Winning pregame record | Older 2011-2018 | 104 (MODERATE) | 59-41-4 | 59.0% | 12.6% | 49.2%-68.1% | 68-35-1 | 66.0% | -2.19 | 3.11 | 73.1% | 51.2% |
| Winning pregame record | Newer 2019-2025 | 102 (MODERATE) | 58-44-0 | 56.9% | 8.6% | 47.2%-66.0% | 63-37-2 | 63.0% | -1.99 | -0.28 | 72.2% | 52.8% |
| .500 pregame record | Full 2011-2025 | 64 (LIMITED) | 30-32-2 | 48.4% | -7.6% | 36.4%-60.6% | 31-33-0 | 48.4% | 0.66 | 1.33 | 50.0% | 54.7% |
| .500 pregame record | Recent 2021-2025 | 11 (VERY SMALL) | 8-3-0 | 72.7% | 38.8% | 43.4%-90.3% | 8-3-0 | 72.7% | -0.55 | 7.36 | 50.0% | 46.5% |
| .500 pregame record | Older 2011-2018 | 46 (VERY SMALL) | 17-27-2 | 38.6% | -26.2% | 25.7%-53.4% | 17-29-0 | 37.0% | 0.78 | -0.87 | 50.0% | 55.1% |
| .500 pregame record | Newer 2019-2025 | 18 (VERY SMALL) | 13-5-0 | 72.2% | 37.9% | 49.1%-87.5% | 14-4-0 | 77.8% | 0.33 | 6.94 | 50.0% | 53.7% |
| Losing pregame record | Full 2011-2025 | 210 (LARGER) | 104-101-5 | 50.7% | -3.1% | 43.9%-57.5% | 96-113-1 | 45.9% | 2.26 | 0.10 | 26.6% | 46.2% |
| Losing pregame record | Recent 2021-2025 | 77 (LIMITED) | 42-33-2 | 56.0% | 6.9% | 44.8%-66.7% | 37-40-0 | 48.0% | 2.46 | 0.31 | 29.4% | 47.0% |
| Losing pregame record | Older 2011-2018 | 104 (MODERATE) | 46-56-2 | 45.1% | -13.9% | 35.8%-54.8% | 49-54-1 | 47.6% | 1.42 | -0.64 | 25.5% | 44.7% |
| Losing pregame record | Newer 2019-2025 | 106 (MODERATE) | 58-45-3 | 56.3% | 7.5% | 46.7%-65.5% | 47-59-0 | 44.3% | 3.08 | 0.83 | 27.7% | 47.6% |
| No prior games | Full 2011-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| No prior games | Recent 2021-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| No prior games | Older 2011-2018 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| No prior games | Newer 2019-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |

### Opponent pregame quality

Current-season record using only games completed before the qualifying kickoff; ties count as one-half win Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Winning pregame record | Full 2011-2025 | 204 (LARGER) | 100-95-9 | 51.3% | -2.1% | 44.3%-58.2% | 88-114-2 | 43.6% | 2.97 | -0.50 | 50.3% | 74.0% |
| Winning pregame record | Recent 2021-2025 | 70 (LIMITED) | 36-33-1 | 52.2% | -0.4% | 40.6%-63.5% | 31-38-1 | 44.9% | 2.63 | -1.80 | 52.5% | 72.0% |
| Winning pregame record | Older 2011-2018 | 108 (MODERATE) | 49-52-7 | 48.5% | -7.4% | 39.0%-58.1% | 48-59-1 | 44.9% | 2.43 | -0.11 | 49.7% | 73.6% |
| Winning pregame record | Newer 2019-2025 | 96 (LIMITED) | 51-43-2 | 54.3% | 3.6% | 44.2%-64.0% | 40-55-1 | 42.1% | 3.57 | -0.95 | 50.9% | 74.4% |
| .500 pregame record | Full 2011-2025 | 61 (LIMITED) | 32-28-1 | 53.3% | 1.8% | 40.9%-65.4% | 32-29-0 | 52.5% | -1.20 | 1.15 | 59.4% | 50.0% |
| .500 pregame record | Recent 2021-2025 | 18 (VERY SMALL) | 11-7-0 | 61.1% | 16.7% | 38.6%-79.7% | 9-9-0 | 50.0% | -0.19 | -2.81 | 57.0% | 50.0% |
| .500 pregame record | Older 2011-2018 | 35 (VERY SMALL) | 16-18-1 | 47.1% | -10.2% | 31.4%-63.3% | 19-16-0 | 54.3% | -1.56 | 2.39 | 59.4% | 50.0% |
| .500 pregame record | Newer 2019-2025 | 26 (VERY SMALL) | 16-10-0 | 61.5% | 17.5% | 42.5%-77.6% | 13-13-0 | 50.0% | -0.71 | -0.52 | 59.3% | 50.0% |
| Losing pregame record | Full 2011-2025 | 215 (LARGER) | 119-95-1 | 55.6% | 6.2% | 48.9%-62.1% | 138-75-2 | 64.8% | -2.08 | 2.01 | 45.9% | 26.8% |
| Losing pregame record | Recent 2021-2025 | 74 (LIMITED) | 46-27-1 | 63.0% | 20.3% | 51.5%-73.2% | 49-24-1 | 67.1% | -1.74 | 3.30 | 44.9% | 30.2% |
| Losing pregame record | Older 2011-2018 | 111 (MODERATE) | 57-54-0 | 51.3% | -2.0% | 42.2%-60.5% | 67-43-1 | 60.9% | -2.27 | 1.30 | 46.0% | 25.3% |
| Losing pregame record | Newer 2019-2025 | 104 (MODERATE) | 62-41-1 | 60.2% | 14.9% | 50.5%-69.1% | 71-32-1 | 68.9% | -1.87 | 2.77 | 45.8% | 28.5% |
| No prior games | Full 2011-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| No prior games | Recent 2021-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| No prior games | Older 2011-2018 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| No prior games | Newer 2019-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |

### Season-by-season

Fixed NFL season Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2011 | Season | 32 (VERY SMALL) | 16-13-3 | 55.2% | 5.3% | 37.5%-71.6% | 19-13-0 | 59.4% | 0.08 | 0.77 | 50.7% | 51.2% |
| 2012 | Season | 32 (VERY SMALL) | 10-22-0 | 31.3% | -40.3% | 17.9%-48.6% | 12-20-0 | 37.5% | -1.13 | -3.16 | 49.3% | 46.3% |
| 2013 | Season | 32 (VERY SMALL) | 19-13-0 | 59.4% | 13.4% | 42.3%-74.5% | 19-13-0 | 59.4% | -0.67 | 5.02 | 45.6% | 45.1% |
| 2014 | Season | 32 (VERY SMALL) | 14-17-1 | 45.2% | -13.8% | 29.2%-62.2% | 15-17-0 | 46.9% | 0.48 | -0.70 | 51.2% | 48.8% |
| 2015 | Season | 32 (VERY SMALL) | 16-16-0 | 50.0% | -4.5% | 33.6%-66.4% | 17-15-0 | 53.1% | -0.44 | 0 | 50.7% | 48.4% |
| 2016 | Season | 32 (VERY SMALL) | 18-14-0 | 56.3% | 7.4% | 39.3%-71.8% | 18-12-2 | 60.0% | 1.11 | 2.20 | 48.5% | 52.6% |
| 2017 | Season | 30 (VERY SMALL) | 14-14-2 | 50.0% | -4.5% | 32.6%-67.4% | 15-15-0 | 50.0% | -0.20 | 1.77 | 52.0% | 51.1% |
| 2018 | Season | 32 (VERY SMALL) | 15-15-2 | 50.0% | -4.5% | 33.1%-66.8% | 19-13-0 | 59.4% | -0.64 | 0.98 | 47.4% | 50.7% |
| 2019 | Season | 32 (VERY SMALL) | 19-12-1 | 61.3% | 17.0% | 43.8%-76.3% | 18-14-0 | 56.3% | 1.91 | 2.47 | 49.8% | 57.2% |
| 2020 | Season | 32 (VERY SMALL) | 17-15-0 | 53.1% | 1.4% | 36.4%-69.1% | 17-15-0 | 53.1% | 0.52 | 1.14 | 49.4% | 43.6% |
| 2021 | Season | 32 (VERY SMALL) | 16-16-0 | 50.0% | -4.5% | 33.6%-66.4% | 16-16-0 | 50.0% | -0.53 | -3.06 | 50.6% | 47.3% |
| 2022 | Season | 34 (VERY SMALL) | 24-9-1 | 72.7% | 38.8% | 55.8%-84.9% | 21-12-1 | 63.6% | 0.15 | 3.65 | 50.3% | 49.8% |
| 2023 | Season | 32 (VERY SMALL) | 17-14-1 | 54.8% | 4.7% | 37.8%-70.8% | 18-14-0 | 56.3% | 1.30 | 1.14 | 49.0% | 56.0% |
| 2024 | Season | 32 (VERY SMALL) | 17-15-0 | 53.1% | 1.4% | 36.4%-69.1% | 16-16-0 | 50.0% | 0.22 | -0.78 | 49.1% | 49.6% |
| 2025 | Season | 32 (VERY SMALL) | 19-13-0 | 59.4% | 13.4% | 42.3%-74.5% | 18-13-1 | 58.1% | 0.48 | 0.95 | 48.5% | 49.6% |

## West-to-East early robustness

**Conclusion: BROADLY SUPPORTED.** The positive direction appears in both eras, for favorites and underdogs, in four of five Pacific-origin franchises, and across most seasons. It is not dominated by one or two teams, but the full sample is only moderate and large underdogs are a clear exception.

Article value: The narrow qualifier runs opposite the familiar fatigue narrative. Its broad distribution is notable, but the moderate total sample and unclustered uncertainty keep the conclusion descriptive.

Key findings:

- The 175-game cohort was 56.7% ATS (+8.3% ROI), with 53.8% in 2011-2018 and 59.1% in 2019-2025; recent form was 58.7% over 63 games.
- Favorites (58.2%) and underdogs (55.4%) both pointed positive over full history, so market role alone does not explain the aggregate.
- LAC, LAR, SEA, and SF each exceeded 57% ATS; LV/Oakland was the exception at 45.5%. Seattle was strongest, but removing the idea of a single-franchise driver is supported by the other positive clubs.
- The +7-or-more underdog bucket was 45.2% ATS, unlike the smaller dog buckets. Every spread bucket is small or very small, so this exception is contextual rather than a new filter.
- Ten seasons were above 50%, two were exactly 50%, and three were below. Four of five recent seasons were above 50%; 2025 was 8-8.
- Coarse distance buckets all pointed above 50%, offering no evidence that one distance band creates the aggregate; the outer buckets are very small.

### Overall qualifier

Pacific-origin team plays at a non-neutral Eastern-time home site at exactly 1:00 p.m. Eastern. Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| All qualifiers | Full 2011-2025 | 175 (MODERATE) | 97-74-4 | 56.7% | 8.3% | 49.2%-63.9% | 96-79-0 | 54.9% | 0.74 | 1.37 | 54.9% | 45.2% |
| All qualifiers | Recent 2021-2025 | 63 (LIMITED) | 37-26-0 | 58.7% | 12.1% | 46.4%-70.0% | 41-22-0 | 65.1% | -0.55 | 1.58 | 59.4% | 47.8% |
| All qualifiers | Older 2011-2018 | 81 (LIMITED) | 42-36-3 | 53.8% | 2.8% | 42.9%-64.5% | 34-47-0 | 42.0% | 2.71 | 1.03 | 46.3% | 46.5% |
| All qualifiers | Newer 2019-2025 | 94 (LIMITED) | 55-38-1 | 59.1% | 12.9% | 49.0%-68.6% | 62-32-0 | 66.0% | -0.95 | 1.66 | 62.8% | 44.1% |

### Favorite / underdog / pick'em

Market role from team-relative settled spread Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Favorite | Full 2011-2025 | 80 (LIMITED) | 46-33-1 | 58.2% | 11.2% | 47.2%-68.5% | 60-20-0 | 75.0% | -4.76 | 2.36 | 63.6% | 33.8% |
| Favorite | Recent 2021-2025 | 37 (VERY SMALL) | 23-14-0 | 62.2% | 18.7% | 46.1%-75.9% | 30-7-0 | 81.1% | -4.76 | 3.27 | 66.8% | 38.9% |
| Favorite | Older 2011-2018 | 24 (VERY SMALL) | 14-10-0 | 58.3% | 11.4% | 38.8%-75.5% | 16-8-0 | 66.7% | -4.50 | 3.79 | 56.3% | 30.4% |
| Favorite | Newer 2019-2025 | 56 (LIMITED) | 32-23-1 | 58.2% | 11.1% | 45.0%-70.3% | 44-12-0 | 78.6% | -4.87 | 1.74 | 66.9% | 35.3% |
| Underdog | Full 2011-2025 | 95 (LIMITED) | 51-41-3 | 55.4% | 5.8% | 45.3%-65.2% | 36-59-0 | 37.9% | 5.37 | 0.54 | 47.8% | 54.6% |
| Underdog | Recent 2021-2025 | 26 (VERY SMALL) | 14-12-0 | 53.8% | 2.8% | 35.5%-71.2% | 11-15-0 | 42.3% | 5.44 | -0.83 | 48.9% | 60.3% |
| Underdog | Older 2011-2018 | 57 (LIMITED) | 28-26-3 | 51.8% | -1.0% | 38.9%-64.6% | 18-39-0 | 31.6% | 5.75 | -0.13 | 42.1% | 53.1% |
| Underdog | Newer 2019-2025 | 38 (VERY SMALL) | 23-15-0 | 60.5% | 15.6% | 44.7%-74.4% | 18-20-0 | 47.4% | 4.82 | 1.55 | 56.9% | 57.0% |
| Pick'em | Full 2011-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pick'em | Recent 2021-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pick'em | Older 2011-2018 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pick'em | Newer 2019-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |

### Fixed spread buckets

Predefined conventional half-point-aligned spread ranges Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Favorite 7+ | Full 2011-2025 | 20 (VERY SMALL) | 12-8-0 | 60.0% | 14.5% | 38.7%-78.1% | 18-2-0 | 90.0% | -8.93 | 4.53 | 63.8% | 23.8% |
| Favorite 7+ | Recent 2021-2025 | 8 (VERY SMALL) | 4-4-0 | 50.0% | -4.5% | 21.5%-78.5% | 6-2-0 | 75.0% | -8.94 | 2.31 | 77.6% | 36.2% |
| Favorite 7+ | Older 2011-2018 | 6 (VERY SMALL) | 5-1-0 | 83.3% | 59.1% | 43.6%-97.0% | 6-0-0 | 100.0% | -8.83 | 8.17 | 55.6% | 24.0% |
| Favorite 7+ | Newer 2019-2025 | 14 (VERY SMALL) | 7-7-0 | 50.0% | -4.5% | 26.8%-73.2% | 12-2-0 | 85.7% | -8.96 | 2.96 | 67.5% | 23.8% |
| Favorite 3.5 to 6.5 | Full 2011-2025 | 28 (VERY SMALL) | 14-13-1 | 51.8% | -1.0% | 34.0%-69.3% | 22-6-0 | 78.6% | -4.80 | 1.73 | 68.4% | 32.1% |
| Favorite 3.5 to 6.5 | Recent 2021-2025 | 14 (VERY SMALL) | 7-7-0 | 50.0% | -4.5% | 26.8%-73.2% | 12-2-0 | 85.7% | -5.07 | 3.36 | 68.2% | 29.2% |
| Favorite 3.5 to 6.5 | Older 2011-2018 | 8 (VERY SMALL) | 6-2-0 | 75.0% | 43.2% | 40.9%-92.8% | 7-1-0 | 87.5% | -4.56 | 11.06 | 65.4% | 32.9% |
| Favorite 3.5 to 6.5 | Newer 2019-2025 | 20 (VERY SMALL) | 8-11-1 | 42.1% | -19.6% | 23.1%-63.7% | 15-5-0 | 75.0% | -4.90 | -2 | 69.6% | 31.8% |
| Favorite 0.5 to 3 | Full 2011-2025 | 32 (VERY SMALL) | 20-12-0 | 62.5% | 19.3% | 45.3%-77.1% | 20-12-0 | 62.5% | -2.11 | 1.55 | 58.4% | 42.4% |
| Favorite 0.5 to 3 | Recent 2021-2025 | 15 (VERY SMALL) | 12-3-0 | 80.0% | 52.7% | 54.8%-93.0% | 12-3-0 | 80.0% | -2.23 | 3.70 | 59.5% | 50.8% |
| Favorite 0.5 to 3 | Older 2011-2018 | 10 (VERY SMALL) | 3-7-0 | 30.0% | -42.7% | 10.8%-60.3% | 3-7-0 | 30.0% | -1.85 | -4.65 | 48.7% | 32.6% |
| Favorite 0.5 to 3 | Newer 2019-2025 | 22 (VERY SMALL) | 17-5-0 | 77.3% | 47.5% | 56.6%-89.9% | 17-5-0 | 77.3% | -2.23 | 4.36 | 63.3% | 47.3% |
| Pick'em | Full 2011-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pick'em | Recent 2021-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pick'em | Older 2011-2018 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pick'em | Newer 2019-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Underdog 0.5 to 3 | Full 2011-2025 | 39 (VERY SMALL) | 20-17-2 | 54.0% | 3.2% | 38.4%-69.0% | 20-19-0 | 51.3% | 2.24 | 2.22 | 53.7% | 49.8% |
| Underdog 0.5 to 3 | Recent 2021-2025 | 10 (VERY SMALL) | 6-4-0 | 60.0% | 14.5% | 31.3%-83.2% | 6-4-0 | 60.0% | 2.60 | 2.50 | 62.2% | 57.6% |
| Underdog 0.5 to 3 | Older 2011-2018 | 23 (VERY SMALL) | 9-12-2 | 42.9% | -18.2% | 24.5%-63.4% | 9-14-0 | 39.1% | 2.35 | -0.52 | 43.7% | 48.6% |
| Underdog 0.5 to 3 | Newer 2019-2025 | 16 (VERY SMALL) | 11-5-0 | 68.8% | 31.3% | 44.4%-85.8% | 11-5-0 | 68.8% | 2.09 | 6.16 | 71.3% | 51.7% |
| Underdog 3.5 to 6.5 | Full 2011-2025 | 24 (VERY SMALL) | 17-7-0 | 70.8% | 35.2% | 50.8%-85.1% | 10-14-0 | 41.7% | 4.79 | 1.75 | 60.1% | 66.3% |
| Underdog 3.5 to 6.5 | Recent 2021-2025 | 6 (VERY SMALL) | 4-2-0 | 66.7% | 27.3% | 30.0%-90.3% | 3-3-0 | 50.0% | 4.42 | 1.92 | 53.0% | 88.1% |
| Underdog 3.5 to 6.5 | Older 2011-2018 | 14 (VERY SMALL) | 10-4-0 | 71.4% | 36.4% | 45.4%-88.3% | 5-9-0 | 35.7% | 4.93 | 1.07 | 62.3% | 59.9% |
| Underdog 3.5 to 6.5 | Newer 2019-2025 | 10 (VERY SMALL) | 7-3-0 | 70.0% | 33.6% | 39.7%-89.2% | 5-5-0 | 50.0% | 4.60 | 2.70 | 57.2% | 74.7% |
| Underdog 7+ | Full 2011-2025 | 32 (VERY SMALL) | 14-17-1 | 45.2% | -13.8% | 29.2%-62.2% | 6-26-0 | 18.8% | 9.63 | -2.41 | 31.9% | 51.7% |
| Underdog 7+ | Recent 2021-2025 | 10 (VERY SMALL) | 4-6-0 | 40.0% | -23.6% | 16.8%-68.7% | 2-8-0 | 20.0% | 8.90 | -5.80 | 35.8% | 45.9% |
| Underdog 7+ | Older 2011-2018 | 20 (VERY SMALL) | 9-10-1 | 47.4% | -9.6% | 27.3%-68.3% | 4-16-0 | 20.0% | 10.22 | -0.53 | 26.2% | 54.0% |
| Underdog 7+ | Newer 2019-2025 | 12 (VERY SMALL) | 5-7-0 | 41.7% | -20.4% | 19.3%-68.0% | 2-10-0 | 16.7% | 8.63 | -5.54 | 40.9% | 48.0% |

### Studied team pregame quality

Current-season record using only games completed before the qualifying kickoff; ties count as one-half win Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Winning pregame record | Full 2011-2025 | 87 (LIMITED) | 47-39-1 | 54.6% | 4.3% | 44.2%-64.8% | 54-33-0 | 62.1% | -1.45 | 1.52 | 76.5% | 44.1% |
| Winning pregame record | Recent 2021-2025 | 37 (VERY SMALL) | 20-17-0 | 54.0% | 3.2% | 38.4%-69.0% | 25-12-0 | 67.6% | -2.50 | 1.36 | 75.0% | 46.3% |
| Winning pregame record | Older 2011-2018 | 30 (VERY SMALL) | 19-11-0 | 63.3% | 20.9% | 45.5%-78.1% | 17-13-0 | 56.7% | 0.27 | 4.13 | 73.7% | 46.4% |
| Winning pregame record | Newer 2019-2025 | 57 (LIMITED) | 28-28-1 | 50.0% | -4.5% | 37.3%-62.7% | 37-20-0 | 64.9% | -2.36 | 0.15 | 78.0% | 42.9% |
| .500 pregame record | Full 2011-2025 | 20 (VERY SMALL) | 13-6-1 | 68.4% | 30.6% | 46.0%-84.6% | 14-6-0 | 70.0% | 0.50 | 6.25 | 50.0% | 50.0% |
| .500 pregame record | Recent 2021-2025 | 6 (VERY SMALL) | 4-2-0 | 66.7% | 27.3% | 30.0%-90.3% | 3-3-0 | 50.0% | 3.25 | 2.42 | 50.0% | 58.8% |
| .500 pregame record | Older 2011-2018 | 11 (VERY SMALL) | 6-4-1 | 60.0% | 14.5% | 31.3%-83.2% | 8-3-0 | 72.7% | -0.41 | 4.68 | 50.0% | 50.9% |
| .500 pregame record | Newer 2019-2025 | 9 (VERY SMALL) | 7-2-0 | 77.8% | 48.5% | 45.3%-93.7% | 6-3-0 | 66.7% | 1.61 | 8.17 | 50.0% | 49.0% |
| Losing pregame record | Full 2011-2025 | 57 (LIMITED) | 27-28-2 | 49.1% | -6.3% | 36.4%-61.9% | 19-38-0 | 33.3% | 4.29 | -1.57 | 23.7% | 45.3% |
| Losing pregame record | Recent 2021-2025 | 15 (VERY SMALL) | 9-6-0 | 60.0% | 14.5% | 35.8%-80.2% | 8-7-0 | 53.3% | 3.17 | -0.70 | 24.8% | 47.1% |
| Losing pregame record | Older 2011-2018 | 37 (VERY SMALL) | 14-21-2 | 40.0% | -23.6% | 25.6%-56.4% | 8-29-0 | 21.6% | 5.45 | -2.77 | 22.9% | 45.1% |
| Losing pregame record | Newer 2019-2025 | 20 (VERY SMALL) | 13-7-0 | 65.0% | 24.1% | 43.3%-81.9% | 11-9-0 | 55.0% | 2.15 | 0.65 | 25.1% | 45.5% |
| No prior games | Full 2011-2025 | 11 (VERY SMALL) | 10-1-0 | 90.9% | 73.6% | 62.3%-98.4% | 9-2-0 | 81.8% | 0.18 | 6.55 | N/A | N/A |
| No prior games | Recent 2021-2025 | 5 (VERY SMALL) | 4-1-0 | 80.0% | 52.7% | 37.5%-96.4% | 5-0-0 | 100.0% | -1.80 | 9 | N/A | N/A |
| No prior games | Older 2011-2018 | 3 (VERY SMALL) | 3-0-0 | 100.0% | 90.9% | 43.9%-100.0% | 1-2-0 | 33.3% | 4.83 | 3.50 | N/A | N/A |
| No prior games | Newer 2019-2025 | 8 (VERY SMALL) | 7-1-0 | 87.5% | 67.0% | 52.9%-97.8% | 8-0-0 | 100.0% | -1.56 | 7.69 | N/A | N/A |

### Opponent pregame quality

Current-season record using only games completed before the qualifying kickoff; ties count as one-half win Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Winning pregame record | Full 2011-2025 | 55 (LIMITED) | 31-22-2 | 58.5% | 11.7% | 45.1%-70.7% | 25-30-0 | 45.5% | 3.81 | 0.48 | 53.9% | 77.6% |
| Winning pregame record | Recent 2021-2025 | 24 (VERY SMALL) | 15-9-0 | 62.5% | 19.3% | 42.7%-78.8% | 14-10-0 | 58.3% | 2.42 | 0.67 | 60.0% | 75.6% |
| Winning pregame record | Older 2011-2018 | 24 (VERY SMALL) | 12-10-2 | 54.5% | 4.1% | 34.7%-73.1% | 9-15-0 | 37.5% | 5.38 | 0.17 | 45.8% | 80.0% |
| Winning pregame record | Newer 2019-2025 | 31 (VERY SMALL) | 19-12-0 | 61.3% | 17.0% | 43.8%-76.3% | 16-15-0 | 51.6% | 2.60 | 0.73 | 60.1% | 75.7% |
| .500 pregame record | Full 2011-2025 | 23 (VERY SMALL) | 11-12-0 | 47.8% | -8.7% | 29.2%-67.0% | 9-14-0 | 39.1% | 2.09 | -0.65 | 55.5% | 50.0% |
| .500 pregame record | Recent 2021-2025 | 6 (VERY SMALL) | 2-4-0 | 33.3% | -36.4% | 9.7%-70.0% | 2-4-0 | 33.3% | -2.25 | -7.58 | 59.3% | 50.0% |
| .500 pregame record | Older 2011-2018 | 13 (VERY SMALL) | 8-5-0 | 61.5% | 17.5% | 35.5%-82.3% | 6-7-0 | 46.2% | 4.62 | 3.92 | 43.7% | 50.0% |
| .500 pregame record | Newer 2019-2025 | 10 (VERY SMALL) | 3-7-0 | 30.0% | -42.7% | 10.8%-60.3% | 3-7-0 | 30.0% | -1.20 | -6.60 | 70.7% | 50.0% |
| Losing pregame record | Full 2011-2025 | 86 (LIMITED) | 45-39-2 | 53.6% | 2.3% | 43.0%-63.8% | 53-33-0 | 61.6% | -1.51 | 1.82 | 55.5% | 23.3% |
| Losing pregame record | Recent 2021-2025 | 28 (VERY SMALL) | 16-12-0 | 57.1% | 9.1% | 39.1%-73.5% | 20-8-0 | 71.4% | -2.50 | 3 | 58.9% | 23.4% |
| Losing pregame record | Older 2011-2018 | 41 (VERY SMALL) | 19-21-1 | 47.5% | -9.3% | 32.9%-62.5% | 18-23-0 | 43.9% | 0.39 | 0.44 | 47.3% | 25.7% |
| Losing pregame record | Newer 2019-2025 | 45 (VERY SMALL) | 26-18-1 | 59.1% | 12.8% | 44.4%-72.3% | 35-10-0 | 77.8% | -3.23 | 3.08 | 62.9% | 21.0% |
| No prior games | Full 2011-2025 | 11 (VERY SMALL) | 10-1-0 | 90.9% | 73.6% | 62.3%-98.4% | 9-2-0 | 81.8% | 0.18 | 6.55 | N/A | N/A |
| No prior games | Recent 2021-2025 | 5 (VERY SMALL) | 4-1-0 | 80.0% | 52.7% | 37.5%-96.4% | 5-0-0 | 100.0% | -1.80 | 9 | N/A | N/A |
| No prior games | Older 2011-2018 | 3 (VERY SMALL) | 3-0-0 | 100.0% | 90.9% | 43.9%-100.0% | 1-2-0 | 33.3% | 4.83 | 3.50 | N/A | N/A |
| No prior games | Newer 2019-2025 | 8 (VERY SMALL) | 7-1-0 | 87.5% | 67.0% | 52.9%-97.8% | 8-0-0 | 100.0% | -1.56 | 7.69 | N/A | N/A |

### Pacific-origin franchise

Season-aware Phase 1 Pacific-origin teams Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| LAC | Full 2011-2025 | 40 (VERY SMALL) | 23-17-0 | 57.5% | 9.8% | 42.2%-71.5% | 22-18-0 | 55.0% | 0.13 | 1.52 | 52.2% | 43.5% |
| LAC | Recent 2021-2025 | 14 (VERY SMALL) | 9-5-0 | 64.3% | 22.7% | 38.8%-83.7% | 10-4-0 | 71.4% | -1.68 | 1.39 | 68.4% | 41.3% |
| LAC | Older 2011-2018 | 22 (VERY SMALL) | 12-10-0 | 54.5% | 4.1% | 34.7%-73.1% | 11-11-0 | 50.0% | 1.48 | 2.07 | 43.1% | 44.2% |
| LAC | Newer 2019-2025 | 18 (VERY SMALL) | 11-7-0 | 61.1% | 16.7% | 38.6%-79.7% | 11-7-0 | 61.1% | -1.53 | 0.86 | 63.8% | 42.6% |
| LAR | Full 2011-2025 | 22 (VERY SMALL) | 13-9-0 | 59.1% | 12.8% | 38.7%-76.7% | 15-7-0 | 68.2% | -2.34 | 3.93 | 67.9% | 41.6% |
| LAR | Recent 2021-2025 | 11 (VERY SMALL) | 6-5-0 | 54.5% | 4.1% | 28.0%-78.7% | 8-3-0 | 72.7% | -3.50 | 1.23 | 66.7% | 43.4% |
| LAR | Older 2011-2018 | 5 (VERY SMALL) | 3-2-0 | 60.0% | 14.5% | 23.1%-88.2% | 3-2-0 | 60.0% | -0.30 | 6.10 | 59.2% | 41.2% |
| LAR | Newer 2019-2025 | 17 (VERY SMALL) | 10-7-0 | 58.8% | 12.3% | 36.0%-78.4% | 12-5-0 | 70.6% | -2.94 | 3.29 | 70.6% | 41.8% |
| LV | Full 2011-2025 | 44 (VERY SMALL) | 20-24-0 | 45.5% | -13.2% | 31.7%-59.9% | 12-32-0 | 27.3% | 4.72 | -4.44 | 44.0% | 48.9% |
| LV | Recent 2021-2025 | 15 (VERY SMALL) | 6-9-0 | 40.0% | -23.6% | 19.8%-64.3% | 4-11-0 | 26.7% | 6 | -4.60 | 43.2% | 45.5% |
| LV | Older 2011-2018 | 22 (VERY SMALL) | 11-11-0 | 50.0% | -4.5% | 30.7%-69.3% | 4-18-0 | 18.2% | 5.52 | -2.84 | 39.9% | 53.6% |
| LV | Newer 2019-2025 | 22 (VERY SMALL) | 9-13-0 | 40.9% | -21.9% | 23.3%-61.3% | 8-14-0 | 36.4% | 3.91 | -6.05 | 48.1% | 44.3% |
| SEA | Full 2011-2025 | 36 (VERY SMALL) | 22-11-3 | 66.7% | 27.3% | 49.6%-80.3% | 27-9-0 | 75.0% | -0.57 | 4.99 | 61.9% | 50.3% |
| SEA | Recent 2021-2025 | 12 (VERY SMALL) | 9-3-0 | 75.0% | 43.2% | 46.8%-91.1% | 10-2-0 | 83.3% | 0.21 | 6.71 | 54.5% | 64.5% |
| SEA | Older 2011-2018 | 15 (VERY SMALL) | 8-5-2 | 61.5% | 17.5% | 35.5%-82.3% | 9-6-0 | 60.0% | -0.07 | 5.20 | 55.8% | 46.7% |
| SEA | Newer 2019-2025 | 21 (VERY SMALL) | 14-6-1 | 70.0% | 33.6% | 48.1%-85.5% | 18-3-0 | 85.7% | -0.93 | 4.83 | 66.5% | 53.0% |
| SF | Full 2011-2025 | 33 (VERY SMALL) | 19-13-1 | 59.4% | 13.4% | 42.3%-74.5% | 20-13-0 | 60.6% | -0.32 | 3.29 | 56.3% | 39.6% |
| SF | Recent 2021-2025 | 11 (VERY SMALL) | 7-4-0 | 63.6% | 21.5% | 35.4%-84.8% | 9-2-0 | 81.8% | -5.91 | 5 | 68.8% | 45.6% |
| SF | Older 2011-2018 | 17 (VERY SMALL) | 8-8-1 | 50.0% | -4.5% | 28.0%-72.0% | 7-10-0 | 41.2% | 4 | -0.47 | 46.2% | 42.4% |
| SF | Newer 2019-2025 | 16 (VERY SMALL) | 11-5-0 | 68.8% | 31.3% | 44.4%-85.8% | 13-3-0 | 81.3% | -4.91 | 7.28 | 68.6% | 36.4% |

### Coarse travel distance

Great-circle distance between season-aware origin and Eastern opponent home stadium; no route or arrival model Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Under 2,000 miles | Full 2011-2025 | 32 (VERY SMALL) | 17-14-1 | 54.8% | 4.7% | 37.8%-70.8% | 16-16-0 | 50.0% | 1.67 | 0.67 | 55.6% | 51.8% |
| Under 2,000 miles | Recent 2021-2025 | 17 (VERY SMALL) | 10-7-0 | 58.8% | 12.3% | 36.0%-78.4% | 10-7-0 | 58.8% | 2.71 | 0.35 | 50.8% | 50.6% |
| Under 2,000 miles | Older 2011-2018 | 9 (VERY SMALL) | 3-5-1 | 37.5% | -28.4% | 13.7%-69.4% | 2-7-0 | 22.2% | 1.28 | 1.28 | 63.5% | 57.5% |
| Under 2,000 miles | Newer 2019-2025 | 23 (VERY SMALL) | 14-9-0 | 60.9% | 16.2% | 40.8%-77.8% | 14-9-0 | 60.9% | 1.83 | 0.43 | 52.6% | 49.7% |
| 2,000-2,499 miles | Full 2011-2025 | 119 (MODERATE) | 66-51-2 | 56.4% | 7.7% | 47.4%-65.0% | 69-50-0 | 58.0% | 0.33 | 1.60 | 57.2% | 44.1% |
| 2,000-2,499 miles | Recent 2021-2025 | 41 (VERY SMALL) | 22-19-0 | 53.7% | 2.4% | 38.8%-67.9% | 26-15-0 | 63.4% | -1.48 | 1.28 | 63.0% | 47.8% |
| 2,000-2,499 miles | Older 2011-2018 | 57 (LIMITED) | 33-23-1 | 58.9% | 12.5% | 45.9%-70.8% | 29-28-0 | 50.9% | 2.33 | 1.56 | 46.9% | 43.7% |
| 2,000-2,499 miles | Newer 2019-2025 | 62 (LIMITED) | 33-28-1 | 54.1% | 3.3% | 41.7%-66.0% | 40-22-0 | 64.5% | -1.51 | 1.64 | 67.5% | 44.5% |
| 2,500+ miles | Full 2011-2025 | 24 (VERY SMALL) | 14-9-1 | 60.9% | 16.2% | 40.8%-77.8% | 11-13-0 | 45.8% | 1.54 | 1.17 | 42.9% | 42.3% |
| 2,500+ miles | Recent 2021-2025 | 5 (VERY SMALL) | 5-0-0 | 100.0% | 90.9% | 56.5%-100.0% | 5-0-0 | 100.0% | -4 | 8.20 | 60.7% | 38.6% |
| 2,500+ miles | Older 2011-2018 | 15 (VERY SMALL) | 6-8-1 | 42.9% | -18.2% | 21.4%-67.4% | 3-12-0 | 20.0% | 5 | -1.13 | 33.8% | 51.2% |
| 2,500+ miles | Newer 2019-2025 | 9 (VERY SMALL) | 8-1-0 | 88.9% | 69.7% | 56.5%-98.0% | 8-1-0 | 88.9% | -4.22 | 5 | 57.0% | 28.5% |

### Season-by-season

Fixed NFL season Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2011 | Season | 10 (VERY SMALL) | 6-3-1 | 66.7% | 27.3% | 35.4%-87.9% | 5-5-0 | 50.0% | 4.35 | 1.85 | 59.1% | 51.8% |
| 2012 | Season | 12 (VERY SMALL) | 4-8-0 | 33.3% | -36.4% | 13.8%-60.9% | 3-9-0 | 25.0% | 3.71 | -1.21 | 39.5% | 47.2% |
| 2013 | Season | 11 (VERY SMALL) | 8-3-0 | 72.7% | 38.8% | 43.4%-90.3% | 6-5-0 | 54.5% | -0.09 | 5.45 | 57.9% | 40.5% |
| 2014 | Season | 7 (VERY SMALL) | 5-2-0 | 71.4% | 36.4% | 35.9%-91.8% | 4-3-0 | 57.1% | 3.21 | -0.50 | 46.9% | 59.0% |
| 2015 | Season | 11 (VERY SMALL) | 5-5-1 | 50.0% | -4.5% | 23.7%-76.3% | 3-8-0 | 27.3% | 2.73 | -0.09 | 51.8% | 42.0% |
| 2016 | Season | 12 (VERY SMALL) | 5-6-1 | 45.5% | -13.2% | 21.3%-72.0% | 5-7-0 | 41.7% | 3.54 | -0.79 | 51.1% | 44.3% |
| 2017 | Season | 9 (VERY SMALL) | 4-5-0 | 44.4% | -15.2% | 18.9%-73.3% | 3-6-0 | 33.3% | 3.11 | 1.67 | 27.2% | 45.7% |
| 2018 | Season | 9 (VERY SMALL) | 5-4-0 | 55.6% | 6.1% | 26.7%-81.1% | 5-4-0 | 55.6% | 1.06 | 2.06 | 34.9% | 46.1% |
| 2019 | Season | 14 (VERY SMALL) | 9-4-1 | 69.2% | 32.2% | 42.4%-87.3% | 11-3-0 | 78.6% | -2.25 | 3.46 | 75.1% | 31.1% |
| 2020 | Season | 17 (VERY SMALL) | 9-8-0 | 52.9% | 1.1% | 31.0%-73.8% | 10-7-0 | 58.8% | -1.38 | 0.50 | 65.3% | 41.2% |
| 2021 | Season | 13 (VERY SMALL) | 8-5-0 | 61.5% | 17.5% | 35.5%-82.3% | 11-2-0 | 84.6% | -1.65 | 4.27 | 75.7% | 52.4% |
| 2022 | Season | 5 (VERY SMALL) | 3-2-0 | 60.0% | 14.5% | 23.1%-88.2% | 3-2-0 | 60.0% | -1.30 | -3.90 | 45.8% | 39.7% |
| 2023 | Season | 14 (VERY SMALL) | 9-5-0 | 64.3% | 22.7% | 38.8%-83.7% | 7-7-0 | 50.0% | 0.46 | 0.89 | 57.8% | 52.3% |
| 2024 | Season | 15 (VERY SMALL) | 9-6-0 | 60.0% | 14.5% | 35.8%-80.2% | 11-4-0 | 73.3% | 0.53 | 5.20 | 53.4% | 41.2% |
| 2025 | Season | 16 (VERY SMALL) | 8-8-0 | 50.0% | -4.5% | 28.0%-72.0% | 9-7-0 | 56.3% | -1.31 | -1.69 | 60.4% | 50.1% |

## Divisional underdog robustness

**Conclusion: WEAK / NO BROAD EDGE.** The 1,440-game full-history result is below -110 break-even. Recent improvement is concentrated in smaller dogs, road teams, and selected divisions; second meetings do not outperform first meetings.

Article value: The familiar divisional-dog story is worth retaining mainly as a reference angle: second meetings were not better, and the broad historical sample did not beat -110 break-even.

Key findings:

- Full history was 51.3% ATS (-2.0% ROI); recent form improved to 53.1% (+1.3%), while eras moved from 49.4% to 53.6%.
- Road dogs were modestly better than home dogs (52.3% versus 50.2% full history; 54.3% versus 51.3% recent), but the full-history road result was still essentially break-even before vig.
- First meetings outperformed second meetings (52.1% versus 50.6% full history; 54.2% versus 51.9% recent). The data does not support greater second-meeting familiarity value.
- Small dogs were 52.9% full history and 56.6% recent; dogs of +7 or more were 49.2% and 49.3%. Recent improvement is not broad across dog size.
- Division results ranged from 45.1% to 55.6% full history and from 42.4% to 64.4% recent, showing substantial composition heterogeneity rather than one league-wide divisional effect.

### Overall qualifier

Divisional matchup in which the team-relative closing spread is greater than 0; pick'em games are excluded. Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| All qualifiers | Full 2011-2025 | 1440 (LARGER) | 721-683-36 | 51.3% | -2.0% | 48.7%-54.0% | 464-969-7 | 32.4% | 5.49 | -0.08 | 40.5% | 58.8% |
| All qualifiers | Recent 2021-2025 | 480 (LARGER) | 250-221-9 | 53.1% | 1.3% | 48.6%-57.5% | 165-313-2 | 34.5% | 5.54 | 0.15 | 41.3% | 58.6% |
| All qualifiers | Older 2011-2018 | 768 (LARGER) | 368-377-23 | 49.4% | -5.7% | 45.8%-53.0% | 241-522-5 | 31.6% | 5.41 | -0.30 | 40.5% | 58.6% |
| All qualifiers | Newer 2019-2025 | 672 (LARGER) | 353-306-13 | 53.6% | 2.3% | 49.8%-57.3% | 223-447-2 | 33.3% | 5.58 | 0.17 | 40.5% | 59.1% |

### Home / away

Phase 1 venue classification Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Home | Full 2011-2025 | 544 (LARGER) | 266-264-14 | 50.2% | -4.2% | 46.0%-54.4% | 178-362-4 | 33.0% | 4.72 | -0.17 | 37.1% | 62.1% |
| Home | Recent 2021-2025 | 191 (MODERATE) | 96-91-4 | 51.3% | -2.0% | 44.2%-58.4% | 69-120-2 | 36.5% | 4.73 | 0.89 | 38.0% | 61.5% |
| Home | Older 2011-2018 | 272 (LARGER) | 128-134-10 | 48.9% | -6.7% | 42.9%-54.9% | 86-184-2 | 31.9% | 4.50 | -0.70 | 36.3% | 62.4% |
| Home | Newer 2019-2025 | 272 (LARGER) | 138-130-4 | 51.5% | -1.7% | 45.5%-57.4% | 92-178-2 | 34.1% | 4.93 | 0.35 | 37.9% | 61.7% |
| Away | Full 2011-2025 | 886 (LARGER) | 452-412-22 | 52.3% | -0.1% | 49.0%-55.6% | 284-599-3 | 32.2% | 5.98 | 0.05 | 42.6% | 56.9% |
| Away | Recent 2021-2025 | 287 (LARGER) | 153-129-5 | 54.3% | 3.6% | 48.4%-60.0% | 95-192-0 | 33.1% | 6.07 | -0.30 | 43.5% | 56.8% |
| Away | Older 2011-2018 | 492 (LARGER) | 240-239-13 | 50.1% | -4.3% | 45.6%-54.6% | 155-334-3 | 31.7% | 5.93 | 0.07 | 42.8% | 56.6% |
| Away | Newer 2019-2025 | 394 (LARGER) | 212-173-9 | 55.1% | 5.1% | 50.1%-60.0% | 129-265-0 | 32.7% | 6.05 | 0.03 | 42.2% | 57.2% |
| Neutral | Full 2011-2025 | 10 (VERY SMALL) | 3-7-0 | 30.0% | -42.7% | 10.8%-60.3% | 2-8-0 | 20.0% | 3.75 | -6.65 | 39.9% | 53.6% |
| Neutral | Recent 2021-2025 | 2 (VERY SMALL) | 1-1-0 | 50.0% | -4.5% | 9.4%-90.5% | 1-1-0 | 50.0% | 6.50 | -4.50 | 40.0% | 55.6% |
| Neutral | Older 2011-2018 | 4 (VERY SMALL) | 0-4-0 | 0.0% | -100.0% | 0.0%-49.0% | 0-4-0 | 0.0% | 2.25 | -18.75 | 34.2% | 45.8% |
| Neutral | Newer 2019-2025 | 6 (VERY SMALL) | 3-3-0 | 50.0% | -4.5% | 18.8%-81.2% | 2-4-0 | 33.3% | 4.75 | 1.42 | 44.5% | 59.8% |

### Same-season meeting order

Deterministic same-season head-to-head chronology Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| First meeting | Full 2011-2025 | 720 (LARGER) | 365-335-20 | 52.1% | -0.4% | 48.4%-55.8% | 247-467-6 | 34.6% | 5.05 | 0.36 | 40.4% | 58.4% |
| First meeting | Recent 2021-2025 | 240 (LARGER) | 128-108-4 | 54.2% | 3.5% | 47.9%-60.5% | 86-152-2 | 36.1% | 5.09 | 1 | 41.3% | 58.8% |
| First meeting | Older 2011-2018 | 384 (LARGER) | 185-183-16 | 50.3% | -4.0% | 45.2%-55.4% | 132-248-4 | 34.7% | 4.92 | 0.16 | 40.6% | 57.6% |
| First meeting | Newer 2019-2025 | 336 (LARGER) | 180-152-4 | 54.2% | 3.5% | 48.8%-59.5% | 115-219-2 | 34.4% | 5.19 | 0.59 | 40.1% | 59.2% |
| Second meeting | Full 2011-2025 | 720 (LARGER) | 356-348-16 | 50.6% | -3.5% | 46.9%-54.3% | 217-502-1 | 30.2% | 5.93 | -0.52 | 40.6% | 59.2% |
| Second meeting | Recent 2021-2025 | 240 (LARGER) | 122-113-5 | 51.9% | -0.9% | 45.6%-58.2% | 79-161-0 | 32.9% | 5.99 | -0.70 | 41.3% | 58.5% |
| Second meeting | Older 2011-2018 | 384 (LARGER) | 183-194-7 | 48.5% | -7.3% | 43.5%-53.6% | 109-274-1 | 28.5% | 5.89 | -0.76 | 40.3% | 59.5% |
| Second meeting | Newer 2019-2025 | 336 (LARGER) | 173-154-9 | 52.9% | 1.0% | 47.5%-58.3% | 108-228-0 | 32.1% | 5.97 | -0.25 | 40.9% | 58.9% |
| Third or later meeting | Full 2011-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Third or later meeting | Recent 2021-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Third or later meeting | Older 2011-2018 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Third or later meeting | Newer 2019-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |

### Fixed spread buckets

Predefined conventional half-point-aligned spread ranges Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Underdog 0.5 to 3 | Full 2011-2025 | 502 (LARGER) | 257-229-16 | 52.9% | 0.9% | 48.4%-57.3% | 229-270-3 | 45.9% | 2.26 | 1.06 | 47.6% | 52.5% |
| Underdog 0.5 to 3 | Recent 2021-2025 | 170 (MODERATE) | 94-72-4 | 56.6% | 8.1% | 49.0%-63.9% | 81-88-1 | 47.9% | 2.35 | 1.87 | 47.9% | 54.0% |
| Underdog 0.5 to 3 | Older 2011-2018 | 269 (LARGER) | 129-128-12 | 50.2% | -4.2% | 44.1%-56.3% | 118-149-2 | 44.2% | 2.21 | 0.53 | 47.4% | 51.4% |
| Underdog 0.5 to 3 | Newer 2019-2025 | 233 (LARGER) | 128-101-4 | 55.9% | 6.7% | 49.4%-62.2% | 111-121-1 | 47.8% | 2.31 | 1.68 | 47.8% | 53.8% |
| Underdog 3.5 to 6.5 | Full 2011-2025 | 465 (LARGER) | 240-223-2 | 51.8% | -1.0% | 47.3%-56.4% | 148-315-2 | 32.0% | 4.78 | -0.15 | 38.9% | 57.2% |
| Underdog 3.5 to 6.5 | Recent 2021-2025 | 157 (MODERATE) | 83-74-0 | 52.9% | 0.9% | 45.1%-60.5% | 50-107-0 | 31.9% | 4.77 | -0.71 | 41.2% | 56.8% |
| Underdog 3.5 to 6.5 | Older 2011-2018 | 249 (LARGER) | 124-123-2 | 50.2% | -4.2% | 44.0%-56.4% | 79-168-2 | 32.0% | 4.78 | -0.02 | 38.6% | 57.6% |
| Underdog 3.5 to 6.5 | Newer 2019-2025 | 216 (LARGER) | 116-100-0 | 53.7% | 2.5% | 47.0%-60.2% | 69-147-0 | 31.9% | 4.77 | -0.30 | 39.3% | 56.8% |
| Underdog 7+ | Full 2011-2025 | 473 (LARGER) | 224-231-18 | 49.2% | -6.0% | 44.7%-53.8% | 87-384-2 | 18.5% | 9.62 | -1.22 | 34.7% | 66.9% |
| Underdog 7+ | Recent 2021-2025 | 153 (MODERATE) | 73-75-5 | 49.3% | -5.8% | 41.4%-57.3% | 34-118-1 | 22.4% | 9.87 | -0.87 | 34.4% | 65.3% |
| Underdog 7+ | Older 2011-2018 | 250 (LARGER) | 115-126-9 | 47.7% | -8.9% | 41.5%-54.0% | 44-205-1 | 17.7% | 9.47 | -1.46 | 35.0% | 67.1% |
| Underdog 7+ | Newer 2019-2025 | 223 (LARGER) | 109-105-9 | 50.9% | -2.8% | 44.3%-57.6% | 43-179-1 | 19.4% | 9.79 | -0.95 | 34.3% | 66.6% |

### Studied team's division

Canonical NFL division of the underdog Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| AFC East | Full 2011-2025 | 180 (MODERATE) | 81-93-6 | 46.6% | -11.1% | 39.3%-54.0% | 52-128-0 | 28.9% | 6.34 | -0.73 | 41.2% | 62.3% |
| AFC East | Recent 2021-2025 | 60 (LIMITED) | 25-34-1 | 42.4% | -19.1% | 30.6%-55.1% | 16-44-0 | 26.7% | 6.38 | -2.11 | 39.3% | 59.2% |
| AFC East | Older 2011-2018 | 96 (LIMITED) | 43-49-4 | 46.7% | -10.8% | 36.9%-56.9% | 31-65-0 | 32.3% | 5.92 | 0.15 | 45.7% | 63.4% |
| AFC East | Newer 2019-2025 | 84 (LIMITED) | 38-44-2 | 46.3% | -11.5% | 36.0%-57.1% | 21-63-0 | 25.0% | 6.82 | -1.73 | 35.9% | 61.1% |
| AFC North | Full 2011-2025 | 180 (MODERATE) | 96-78-6 | 55.2% | 5.3% | 47.8%-62.4% | 62-117-1 | 34.6% | 5.30 | 0.67 | 42.4% | 57.4% |
| AFC North | Recent 2021-2025 | 60 (LIMITED) | 35-24-1 | 59.3% | 13.3% | 46.6%-70.9% | 27-33-0 | 45.0% | 4.88 | 2.19 | 46.2% | 56.9% |
| AFC North | Older 2011-2018 | 96 (LIMITED) | 49-42-5 | 53.8% | 2.8% | 43.7%-63.7% | 29-66-1 | 30.5% | 5.22 | 0.47 | 41.3% | 56.8% |
| AFC North | Newer 2019-2025 | 84 (LIMITED) | 47-36-1 | 56.6% | 8.1% | 45.9%-66.8% | 33-51-0 | 39.3% | 5.40 | 0.90 | 43.5% | 58.1% |
| AFC South | Full 2011-2025 | 180 (MODERATE) | 85-88-7 | 49.1% | -6.2% | 41.8%-56.5% | 56-123-1 | 31.3% | 5.12 | -0.26 | 31.4% | 51.1% |
| AFC South | Recent 2021-2025 | 60 (LIMITED) | 35-25-0 | 58.3% | 11.4% | 45.7%-69.9% | 23-36-1 | 39.0% | 5.01 | 1.19 | 27.8% | 51.0% |
| AFC South | Older 2011-2018 | 96 (LIMITED) | 36-53-7 | 40.5% | -22.8% | 30.9%-50.8% | 26-70-0 | 27.1% | 5.21 | -1.46 | 31.6% | 49.5% |
| AFC South | Newer 2019-2025 | 84 (LIMITED) | 49-35-0 | 58.3% | 11.4% | 47.6%-68.3% | 30-53-1 | 36.1% | 5.01 | 1.12 | 31.2% | 52.9% |
| AFC West | Full 2011-2025 | 180 (MODERATE) | 94-82-4 | 53.4% | 2.0% | 46.1%-60.6% | 56-124-0 | 31.1% | 6.02 | -0.13 | 42.9% | 65.2% |
| AFC West | Recent 2021-2025 | 60 (LIMITED) | 31-28-1 | 52.5% | 0.3% | 40.0%-64.7% | 15-45-0 | 25.0% | 6.21 | -0.69 | 48.4% | 63.8% |
| AFC West | Older 2011-2018 | 96 (LIMITED) | 50-44-2 | 53.2% | 1.6% | 43.2%-62.9% | 33-63-0 | 34.4% | 5.92 | 0.40 | 38.9% | 66.9% |
| AFC West | Newer 2019-2025 | 84 (LIMITED) | 44-38-2 | 53.7% | 2.4% | 42.9%-64.0% | 23-61-0 | 27.4% | 6.13 | -0.74 | 47.6% | 63.3% |
| NFC East | Full 2011-2025 | 180 (MODERATE) | 90-88-2 | 50.6% | -3.5% | 43.3%-57.8% | 59-120-1 | 33.0% | 5.07 | -0.37 | 39.4% | 54.3% |
| NFC East | Recent 2021-2025 | 60 (LIMITED) | 27-31-2 | 46.6% | -11.1% | 34.3%-59.2% | 15-44-1 | 25.4% | 6.53 | -1.90 | 39.9% | 63.7% |
| NFC East | Older 2011-2018 | 96 (LIMITED) | 49-47-0 | 51.0% | -2.6% | 41.2%-60.8% | 36-60-0 | 37.5% | 4.13 | 0.17 | 43.0% | 51.7% |
| NFC East | Newer 2019-2025 | 84 (LIMITED) | 41-41-2 | 50.0% | -4.5% | 39.4%-60.6% | 23-60-1 | 27.7% | 6.15 | -0.98 | 35.3% | 57.3% |
| NFC North | Full 2011-2025 | 180 (MODERATE) | 79-96-5 | 45.1% | -13.8% | 38.0%-52.5% | 50-128-2 | 28.1% | 4.99 | -0.89 | 45.5% | 60.2% |
| NFC North | Recent 2021-2025 | 60 (LIMITED) | 26-31-3 | 45.6% | -12.9% | 33.4%-58.4% | 20-40-0 | 33.3% | 4.97 | -0.83 | 43.8% | 59.0% |
| NFC North | Older 2011-2018 | 96 (LIMITED) | 39-55-2 | 41.5% | -20.8% | 32.1%-51.6% | 22-72-2 | 23.4% | 5.03 | -1.51 | 46.3% | 60.2% |
| NFC North | Newer 2019-2025 | 84 (LIMITED) | 40-41-3 | 49.4% | -5.7% | 38.8%-60.1% | 28-56-0 | 33.3% | 4.93 | -0.17 | 44.6% | 60.4% |
| NFC South | Full 2011-2025 | 180 (MODERATE) | 99-79-2 | 55.6% | 6.2% | 48.3%-62.7% | 67-113-0 | 37.2% | 5.14 | 1.06 | 36.4% | 57.2% |
| NFC South | Recent 2021-2025 | 60 (LIMITED) | 38-21-1 | 64.4% | 23.0% | 51.7%-75.4% | 27-33-0 | 45.0% | 5.16 | 2.19 | 35.5% | 55.0% |
| NFC South | Older 2011-2018 | 96 (LIMITED) | 50-45-1 | 52.6% | 0.5% | 42.7%-62.4% | 32-64-0 | 33.3% | 5.06 | 0.29 | 37.8% | 58.6% |
| NFC South | Newer 2019-2025 | 84 (LIMITED) | 49-34-1 | 59.0% | 12.7% | 48.3%-69.0% | 35-49-0 | 41.7% | 5.23 | 1.94 | 34.8% | 55.5% |
| NFC West | Full 2011-2025 | 180 (MODERATE) | 97-79-4 | 55.1% | 5.2% | 47.7%-62.3% | 62-116-2 | 34.8% | 5.94 | 0.02 | 44.7% | 62.8% |
| NFC West | Recent 2021-2025 | 60 (LIMITED) | 33-27-0 | 55.0% | 5.0% | 42.5%-66.9% | 22-38-0 | 36.7% | 5.19 | 1.19 | 49.2% | 60.3% |
| NFC West | Older 2011-2018 | 96 (LIMITED) | 52-42-2 | 55.3% | 5.6% | 45.3%-65.0% | 32-62-2 | 34.0% | 6.77 | -0.89 | 39.3% | 61.8% |
| NFC West | Newer 2019-2025 | 84 (LIMITED) | 45-37-2 | 54.9% | 4.8% | 44.1%-65.2% | 30-54-0 | 35.7% | 5 | 1.05 | 50.8% | 64.0% |

### Season-by-season

Fixed NFL season Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2011 | Season | 96 (LIMITED) | 46-46-4 | 50.0% | -4.5% | 40.0%-60.0% | 32-64-0 | 33.3% | 5.46 | -0.26 | 40.6% | 59.8% |
| 2012 | Season | 96 (LIMITED) | 46-46-4 | 50.0% | -4.5% | 40.0%-60.0% | 30-65-1 | 31.6% | 5.22 | -1.68 | 39.1% | 59.7% |
| 2013 | Season | 96 (LIMITED) | 39-55-2 | 41.5% | -20.8% | 32.1%-51.6% | 23-72-1 | 24.2% | 5.60 | -0.92 | 41.3% | 58.8% |
| 2014 | Season | 96 (LIMITED) | 50-43-3 | 53.8% | 2.6% | 43.7%-63.5% | 29-67-0 | 30.2% | 5.80 | 0.20 | 41.2% | 57.4% |
| 2015 | Season | 96 (LIMITED) | 54-38-4 | 58.7% | 12.1% | 48.5%-68.2% | 42-54-0 | 43.8% | 5.04 | 0.71 | 41.6% | 57.0% |
| 2016 | Season | 96 (LIMITED) | 49-46-1 | 51.6% | -1.5% | 41.7%-61.4% | 33-62-1 | 34.7% | 4.71 | 0.82 | 39.8% | 57.6% |
| 2017 | Season | 96 (LIMITED) | 37-55-4 | 40.2% | -23.2% | 30.8%-50.4% | 23-73-0 | 24.0% | 5.46 | -1.24 | 38.8% | 60.3% |
| 2018 | Season | 96 (LIMITED) | 47-48-1 | 49.5% | -5.5% | 39.6%-59.4% | 29-65-2 | 30.9% | 5.97 | -0.02 | 41.3% | 58.4% |
| 2019 | Season | 96 (LIMITED) | 48-44-4 | 52.2% | -0.4% | 42.1%-62.1% | 29-67-0 | 30.2% | 5.97 | -0.07 | 38.3% | 60.5% |
| 2020 | Season | 96 (LIMITED) | 55-41-0 | 57.3% | 9.4% | 47.3%-66.7% | 29-67-0 | 30.2% | 5.42 | 0.52 | 38.6% | 59.8% |
| 2021 | Season | 96 (LIMITED) | 49-44-3 | 52.7% | 0.6% | 42.6%-62.5% | 40-56-0 | 41.7% | 6.25 | 0.78 | 41.1% | 57.5% |
| 2022 | Season | 96 (LIMITED) | 54-41-1 | 56.8% | 8.5% | 46.8%-66.3% | 28-66-2 | 29.8% | 5.14 | 0.93 | 47.0% | 56.8% |
| 2023 | Season | 96 (LIMITED) | 43-50-3 | 46.2% | -11.7% | 36.4%-56.3% | 34-62-0 | 35.4% | 5.13 | -0.46 | 41.4% | 59.7% |
| 2024 | Season | 96 (LIMITED) | 53-41-2 | 56.4% | 7.6% | 46.3%-66.0% | 28-68-0 | 29.2% | 5.26 | -0.49 | 40.8% | 58.8% |
| 2025 | Season | 96 (LIMITED) | 51-45-0 | 53.1% | 1.4% | 43.2%-62.8% | 35-61-0 | 36.5% | 5.93 | 0.02 | 36.2% | 60.5% |

## Rest disadvantage / rest advantage robustness

**Conclusion: WEAK / NO BROAD EDGE.** Neither generic rest advantage nor disadvantage shows a broad edge. Thursday short weeks are usually equal-rest games, Phase 1 short-rest disadvantage is overwhelmingly Monday-to-Sunday, and the only recent positive structure—mini-bye rest edge—remains negative after vig over full history.

Article value: The strongest article point is definitional: Thursday football is usually shared short rest, while true asymmetric rest structures show little broad ATS edge.

Key findings:

- Short-rest disadvantage was 49.5% ATS full history and 52.1% recent; rest advantage was 49.9% and 51.7%. Neither clears -110 break-even in either standard window.
- Only one Phase 1 short-rest-disadvantage row was Thursday-after-Sunday, because ordinary Thursday games give both teams the same short week. Monday-to-Sunday supplied 469 of 510 rows and improved from 45.8% in the older era to 52.7% in the newer era.
- Post-bye rest edges were 48.9% ATS full history and 47.6% recent. Mini-bye rest edges were 51.0% full history and 54.5% recent, an era-dependent movement but not a full-history edge.
- Normal-rest teams facing an opponent with extra rest were 51.6% ATS over 723 games, still below -110 break-even and stable by era.
- Meaningful advantage/disadvantage bands are paired sides of the same games and remain approximately mirror images. Equal-rest team-games are exactly 50% by construction, so those cohorts are context rather than independent betting samples.

### Overall qualifier

Team has at most 6 calendar days since its previous game and at least 1 fewer rest day than its opponent; season openers are excluded. Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| All qualifiers | Full 2011-2025 | 510 (LARGER) | 248-253-9 | 49.5% | -5.5% | 45.1%-53.9% | 267-241-2 | 52.6% | -0.67 | -0.16 | 52.1% | 51.2% |
| All qualifiers | Recent 2021-2025 | 187 (MODERATE) | 97-89-1 | 52.1% | -0.4% | 45.0%-59.2% | 105-81-1 | 56.5% | -0.90 | -0.01 | 51.0% | 50.6% |
| All qualifiers | Older 2011-2018 | 258 (LARGER) | 118-133-7 | 47.0% | -10.3% | 40.9%-53.2% | 128-129-1 | 49.8% | -0.27 | -0.28 | 52.0% | 52.0% |
| All qualifiers | Newer 2019-2025 | 252 (LARGER) | 130-120-2 | 52.0% | -0.7% | 45.8%-58.1% | 139-112-1 | 55.4% | -1.09 | -0.05 | 52.2% | 50.5% |

### Short-rest disadvantage cadence

Mutually exclusive schedule cadence within the Phase 1 short-rest disadvantage cohort Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Thursday after Sunday | Full 2011-2025 | 1 (VERY SMALL) | 0-1-0 | 0.0% | -100.0% | 0.0%-79.3% | 1-0-0 | 100.0% | -8.50 | -1.50 | 43.3% | 26.7% |
| Thursday after Sunday | Recent 2021-2025 | 1 (VERY SMALL) | 0-1-0 | 0.0% | -100.0% | 0.0%-79.3% | 1-0-0 | 100.0% | -8.50 | -1.50 | 43.3% | 26.7% |
| Thursday after Sunday | Older 2011-2018 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Thursday after Sunday | Newer 2019-2025 | 1 (VERY SMALL) | 0-1-0 | 0.0% | -100.0% | 0.0%-79.3% | 1-0-0 | 100.0% | -8.50 | -1.50 | 43.3% | 26.7% |
| Monday-to-Sunday | Full 2011-2025 | 469 (LARGER) | 226-234-9 | 49.1% | -6.2% | 44.6%-53.7% | 240-227-2 | 51.4% | -0.60 | -0.31 | 52.0% | 51.4% |
| Monday-to-Sunday | Recent 2021-2025 | 166 (MODERATE) | 88-77-1 | 53.3% | 1.8% | 45.7%-60.8% | 94-71-1 | 57.0% | -1.03 | 0.27 | 51.3% | 50.1% |
| Monday-to-Sunday | Older 2011-2018 | 245 (LARGER) | 109-129-7 | 45.8% | -12.6% | 39.6%-52.1% | 117-127-1 | 47.9% | -0.09 | -0.68 | 52.0% | 52.5% |
| Monday-to-Sunday | Newer 2019-2025 | 224 (LARGER) | 117-105-2 | 52.7% | 0.6% | 46.2%-59.2% | 123-100-1 | 55.2% | -1.15 | 0.09 | 52.0% | 50.3% |
| Other short turnaround | Full 2011-2025 | 40 (VERY SMALL) | 22-18-0 | 55.0% | 5.0% | 39.8%-69.3% | 26-14-0 | 65.0% | -1.38 | 1.63 | 53.3% | 49.6% |
| Other short turnaround | Recent 2021-2025 | 20 (VERY SMALL) | 9-11-0 | 45.0% | -14.1% | 25.8%-65.8% | 10-10-0 | 50.0% | 0.60 | -2.30 | 48.9% | 56.0% |
| Other short turnaround | Older 2011-2018 | 13 (VERY SMALL) | 9-4-0 | 69.2% | 32.2% | 42.4%-87.3% | 11-2-0 | 84.6% | -3.58 | 7.27 | 51.6% | 42.6% |
| Other short turnaround | Newer 2019-2025 | 27 (VERY SMALL) | 13-14-0 | 48.1% | -8.1% | 30.7%-66.0% | 15-12-0 | 55.6% | -0.31 | -1.09 | 54.0% | 52.9% |

### Overall qualifier

Team has at least 3 more calendar rest days than its opponent; season openers are excluded. Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| All qualifiers | Full 2011-2025 | 862 (LARGER) | 421-422-19 | 49.9% | -4.7% | 46.6%-53.3% | 437-422-3 | 50.9% | -0.62 | -0.13 | 50.3% | 48.7% |
| All qualifiers | Recent 2021-2025 | 293 (LARGER) | 148-138-7 | 51.7% | -1.2% | 46.0%-57.5% | 158-133-2 | 54.3% | -1.27 | 0.63 | 52.1% | 47.1% |
| All qualifiers | Older 2011-2018 | 456 (LARGER) | 220-224-12 | 49.5% | -5.4% | 44.9%-54.2% | 226-230-0 | 49.6% | -0.35 | -0.45 | 49.3% | 48.4% |
| All qualifiers | Newer 2019-2025 | 406 (LARGER) | 201-198-7 | 50.4% | -3.8% | 45.5%-55.3% | 211-192-3 | 52.4% | -0.92 | 0.24 | 51.5% | 49.0% |

### Rest-advantage source

Mutually exclusive priority: post-bye edge, then mini-bye edge, then other Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Post-bye edge | Full 2011-2025 | 409 (LARGER) | 195-204-10 | 48.9% | -6.7% | 44.0%-53.8% | 216-192-1 | 52.9% | -0.79 | -0.35 | 49.7% | 49.1% |
| Post-bye edge | Recent 2021-2025 | 130 (MODERATE) | 60-66-4 | 47.6% | -9.1% | 39.1%-56.3% | 74-55-1 | 57.4% | -1.60 | 0.16 | 51.2% | 49.0% |
| Post-bye edge | Older 2011-2018 | 222 (LARGER) | 110-106-6 | 50.9% | -2.8% | 44.3%-57.5% | 116-106-0 | 52.3% | -0.45 | -0.07 | 48.4% | 47.6% |
| Post-bye edge | Newer 2019-2025 | 187 (MODERATE) | 85-98-4 | 46.5% | -11.3% | 39.4%-53.7% | 100-86-1 | 53.8% | -1.19 | -0.68 | 51.1% | 50.7% |
| Thursday mini-bye edge | Full 2011-2025 | 446 (LARGER) | 223-214-9 | 51.0% | -2.6% | 46.4%-55.7% | 218-226-2 | 49.1% | -0.46 | 0.17 | 50.7% | 48.4% |
| Thursday mini-bye edge | Recent 2021-2025 | 159 (MODERATE) | 85-71-3 | 54.5% | 4.0% | 46.7%-62.1% | 82-76-1 | 51.9% | -1 | 1.10 | 52.4% | 45.9% |
| Thursday mini-bye edge | Older 2011-2018 | 232 (LARGER) | 110-116-6 | 48.7% | -7.1% | 42.2%-55.2% | 109-123-0 | 47.0% | -0.21 | -0.71 | 50.0% | 49.1% |
| Thursday mini-bye edge | Newer 2019-2025 | 214 (LARGER) | 113-98-3 | 53.5% | 2.2% | 46.8%-60.2% | 109-103-2 | 51.4% | -0.73 | 1.13 | 51.5% | 47.7% |
| Other rest edge | Full 2011-2025 | 7 (VERY SMALL) | 3-4-0 | 42.9% | -18.2% | 15.8%-75.0% | 3-4-0 | 42.9% | -1.07 | -6.21 | 58.4% | 42.6% |
| Other rest edge | Recent 2021-2025 | 4 (VERY SMALL) | 3-1-0 | 75.0% | 43.2% | 30.1%-95.4% | 2-2-0 | 50.0% | -1 | -2.50 | 70.3% | 35.9% |
| Other rest edge | Older 2011-2018 | 2 (VERY SMALL) | 0-2-0 | 0.0% | -100.0% | 0.0%-65.8% | 1-1-0 | 50.0% | -6 | -12.50 | 50.0% | 50.0% |
| Other rest edge | Newer 2019-2025 | 5 (VERY SMALL) | 3-2-0 | 60.0% | 14.5% | 23.1%-88.2% | 2-3-0 | 40.0% | 0.90 | -3.70 | 61.7% | 39.7% |

### Rest differential bands

Mutually exclusive fixed rest-differential bands over all team-games with both teams' rest known Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Meaningful disadvantage | Full 2011-2025 | 862 (LARGER) | 422-421-19 | 50.1% | -4.4% | 46.7%-53.4% | 422-437-3 | 49.1% | 0.62 | 0.13 | 48.7% | 50.3% |
| Meaningful disadvantage | Recent 2021-2025 | 293 (LARGER) | 138-148-7 | 48.3% | -7.9% | 42.5%-54.0% | 133-158-2 | 45.7% | 1.27 | -0.63 | 47.1% | 52.1% |
| Meaningful disadvantage | Older 2011-2018 | 456 (LARGER) | 224-220-12 | 50.4% | -3.7% | 45.8%-55.1% | 230-226-0 | 50.4% | 0.35 | 0.45 | 48.4% | 49.3% |
| Meaningful disadvantage | Newer 2019-2025 | 406 (LARGER) | 198-201-7 | 49.6% | -5.3% | 44.8%-54.5% | 192-211-3 | 47.6% | 0.92 | -0.24 | 49.0% | 51.5% |
| Small disadvantage | Full 2011-2025 | 515 (LARGER) | 260-244-11 | 51.6% | -1.5% | 47.2%-55.9% | 266-247-2 | 51.8% | -0.41 | 0.02 | 51.6% | 52.2% |
| Small disadvantage | Recent 2021-2025 | 200 (LARGER) | 110-88-2 | 55.6% | 6.1% | 48.6%-62.3% | 112-88-0 | 56.0% | -0.48 | 1.07 | 51.0% | 51.2% |
| Small disadvantage | Older 2011-2018 | 248 (LARGER) | 118-123-7 | 49.0% | -6.5% | 42.7%-55.2% | 122-124-2 | 49.6% | -0.36 | -0.58 | 51.8% | 52.5% |
| Small disadvantage | Newer 2019-2025 | 267 (LARGER) | 142-121-4 | 54.0% | 3.1% | 47.9%-59.9% | 144-123-0 | 53.9% | -0.45 | 0.58 | 51.3% | 51.8% |
| Equal rest | Full 2011-2025 | 4602 (LARGER) | 2234-2234-134 | 50.0% | -4.5% | 48.5%-51.5% | 2296-2296-10 | 50.0% | 0 | 0 | 49.9% | 49.9% |
| Equal rest | Recent 2021-2025 | 1572 (LARGER) | 762-762-48 | 50.0% | -4.5% | 47.5%-52.5% | 785-785-2 | 50.0% | 0 | 0 | 49.9% | 49.9% |
| Equal rest | Older 2011-2018 | 2430 (LARGER) | 1179-1179-72 | 50.0% | -4.5% | 48.0%-52.0% | 1211-1211-8 | 50.0% | 0 | 0 | 50.1% | 50.1% |
| Equal rest | Newer 2019-2025 | 2172 (LARGER) | 1055-1055-62 | 50.0% | -4.5% | 47.9%-52.1% | 1085-1085-2 | 50.0% | 0 | 0 | 49.6% | 49.6% |
| Small advantage | Full 2011-2025 | 515 (LARGER) | 244-260-11 | 48.4% | -7.6% | 44.1%-52.8% | 247-266-2 | 48.1% | 0.41 | -0.02 | 52.2% | 51.6% |
| Small advantage | Recent 2021-2025 | 200 (LARGER) | 88-110-2 | 44.4% | -15.2% | 37.7%-51.4% | 88-112-0 | 44.0% | 0.48 | -1.07 | 51.2% | 51.0% |
| Small advantage | Older 2011-2018 | 248 (LARGER) | 123-118-7 | 51.0% | -2.6% | 44.8%-57.3% | 124-122-2 | 50.4% | 0.36 | 0.58 | 52.5% | 51.8% |
| Small advantage | Newer 2019-2025 | 267 (LARGER) | 121-142-4 | 46.0% | -12.2% | 40.1%-52.0% | 123-144-0 | 46.1% | 0.45 | -0.58 | 51.8% | 51.3% |
| Meaningful advantage | Full 2011-2025 | 862 (LARGER) | 421-422-19 | 49.9% | -4.7% | 46.6%-53.3% | 437-422-3 | 50.9% | -0.62 | -0.13 | 50.3% | 48.7% |
| Meaningful advantage | Recent 2021-2025 | 293 (LARGER) | 148-138-7 | 51.7% | -1.2% | 46.0%-57.5% | 158-133-2 | 54.3% | -1.27 | 0.63 | 52.1% | 47.1% |
| Meaningful advantage | Older 2011-2018 | 456 (LARGER) | 220-224-12 | 49.5% | -5.4% | 44.9%-54.2% | 226-230-0 | 49.6% | -0.35 | -0.45 | 49.3% | 48.4% |
| Meaningful advantage | Newer 2019-2025 | 406 (LARGER) | 201-198-7 | 50.4% | -3.8% | 45.5%-55.3% | 211-192-3 | 52.4% | -0.92 | 0.24 | 51.5% | 49.0% |

### Recognizable schedule structures

Nested, non-exclusive schedule flags; rows can appear in multiple siblings Overlap policy: **nested/non-exclusive flags**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Thursday after Sunday | Full 2011-2025 | 463 (LARGER) | 225-226-12 | 49.9% | -4.8% | 45.3%-54.5% | 232-231-0 | 50.1% | -0.02 | -0 | 51.0% | 51.0% |
| Thursday after Sunday | Recent 2021-2025 | 169 (MODERATE) | 81-82-6 | 49.7% | -5.1% | 42.1%-57.3% | 85-84-0 | 50.3% | -0.05 | -0.01 | 53.4% | 53.3% |
| Thursday after Sunday | Older 2011-2018 | 238 (LARGER) | 116-116-6 | 50.0% | -4.5% | 43.6%-56.4% | 119-119-0 | 50.0% | 0 | 0 | 50.5% | 50.5% |
| Thursday after Sunday | Newer 2019-2025 | 225 (LARGER) | 109-110-6 | 49.8% | -5.0% | 43.2%-56.3% | 113-112-0 | 50.2% | -0.04 | -0.01 | 51.5% | 51.5% |
| Monday-to-Sunday | Full 2011-2025 | 481 (LARGER) | 232-240-9 | 49.1% | -6.2% | 44.7%-53.6% | 246-233-2 | 51.4% | -0.56 | -0.30 | 52.0% | 51.5% |
| Monday-to-Sunday | Recent 2021-2025 | 168 (MODERATE) | 89-78-1 | 53.3% | 1.7% | 45.7%-60.7% | 95-72-1 | 56.9% | -0.96 | 0.30 | 51.2% | 50.2% |
| Monday-to-Sunday | Older 2011-2018 | 249 (LARGER) | 111-131-7 | 45.9% | -12.4% | 39.7%-52.2% | 119-129-1 | 48.0% | -0.09 | -0.67 | 52.0% | 52.4% |
| Monday-to-Sunday | Newer 2019-2025 | 232 (LARGER) | 121-109-2 | 52.6% | 0.4% | 46.2%-59.0% | 127-104-1 | 55.0% | -1.06 | 0.10 | 52.1% | 50.5% |
| Normal rest vs opponent extra | Full 2011-2025 | 723 (LARGER) | 365-342-16 | 51.6% | -1.4% | 47.9%-55.3% | 350-371-2 | 48.5% | 0.95 | 0.45 | 47.9% | 50.4% |
| Normal rest vs opponent extra | Recent 2021-2025 | 244 (LARGER) | 122-116-6 | 51.3% | -2.1% | 44.9%-57.5% | 110-133-1 | 45.3% | 1.68 | 0.22 | 46.9% | 51.6% |
| Normal rest vs opponent extra | Older 2011-2018 | 381 (LARGER) | 192-180-9 | 51.6% | -1.5% | 46.5%-56.6% | 190-191-0 | 49.9% | 0.53 | 0.41 | 47.4% | 49.6% |
| Normal rest vs opponent extra | Newer 2019-2025 | 342 (LARGER) | 173-162-7 | 51.6% | -1.4% | 46.3%-56.9% | 160-180-2 | 47.1% | 1.41 | 0.49 | 48.4% | 51.3% |
| Post-bye rest edge | Full 2011-2025 | 409 (LARGER) | 195-204-10 | 48.9% | -6.7% | 44.0%-53.8% | 216-192-1 | 52.9% | -0.79 | -0.35 | 49.7% | 49.1% |
| Post-bye rest edge | Recent 2021-2025 | 130 (MODERATE) | 60-66-4 | 47.6% | -9.1% | 39.1%-56.3% | 74-55-1 | 57.4% | -1.60 | 0.16 | 51.2% | 49.0% |
| Post-bye rest edge | Older 2011-2018 | 222 (LARGER) | 110-106-6 | 50.9% | -2.8% | 44.3%-57.5% | 116-106-0 | 52.3% | -0.45 | -0.07 | 48.4% | 47.6% |
| Post-bye rest edge | Newer 2019-2025 | 187 (MODERATE) | 85-98-4 | 46.5% | -11.3% | 39.4%-53.7% | 100-86-1 | 53.8% | -1.19 | -0.68 | 51.1% | 50.7% |
| Thursday mini-bye rest edge | Full 2011-2025 | 446 (LARGER) | 223-214-9 | 51.0% | -2.6% | 46.4%-55.7% | 218-226-2 | 49.1% | -0.46 | 0.17 | 50.7% | 48.4% |
| Thursday mini-bye rest edge | Recent 2021-2025 | 159 (MODERATE) | 85-71-3 | 54.5% | 4.0% | 46.7%-62.1% | 82-76-1 | 51.9% | -1 | 1.10 | 52.4% | 45.9% |
| Thursday mini-bye rest edge | Older 2011-2018 | 232 (LARGER) | 110-116-6 | 48.7% | -7.1% | 42.2%-55.2% | 109-123-0 | 47.0% | -0.21 | -0.71 | 50.0% | 49.1% |
| Thursday mini-bye rest edge | Newer 2019-2025 | 214 (LARGER) | 113-98-3 | 53.5% | 2.2% | 46.8%-60.2% | 109-103-2 | 51.4% | -0.73 | 1.13 | 51.5% | 47.7% |
| Both teams equally rested | Full 2011-2025 | 4602 (LARGER) | 2234-2234-134 | 50.0% | -4.5% | 48.5%-51.5% | 2296-2296-10 | 50.0% | 0 | 0 | 49.9% | 49.9% |
| Both teams equally rested | Recent 2021-2025 | 1572 (LARGER) | 762-762-48 | 50.0% | -4.5% | 47.5%-52.5% | 785-785-2 | 50.0% | 0 | 0 | 49.9% | 49.9% |
| Both teams equally rested | Older 2011-2018 | 2430 (LARGER) | 1179-1179-72 | 50.0% | -4.5% | 48.0%-52.0% | 1211-1211-8 | 50.0% | 0 | 0 | 50.1% | 50.1% |
| Both teams equally rested | Newer 2019-2025 | 2172 (LARGER) | 1055-1055-62 | 50.0% | -4.5% | 47.9%-52.1% | 1085-1085-2 | 50.0% | 0 | 0 | 49.6% | 49.6% |
| Meaningful asymmetric disadvantage | Full 2011-2025 | 862 (LARGER) | 422-421-19 | 50.1% | -4.4% | 46.7%-53.4% | 422-437-3 | 49.1% | 0.62 | 0.13 | 48.7% | 50.3% |
| Meaningful asymmetric disadvantage | Recent 2021-2025 | 293 (LARGER) | 138-148-7 | 48.3% | -7.9% | 42.5%-54.0% | 133-158-2 | 45.7% | 1.27 | -0.63 | 47.1% | 52.1% |
| Meaningful asymmetric disadvantage | Older 2011-2018 | 456 (LARGER) | 224-220-12 | 50.4% | -3.7% | 45.8%-55.1% | 230-226-0 | 50.4% | 0.35 | 0.45 | 48.4% | 49.3% |
| Meaningful asymmetric disadvantage | Newer 2019-2025 | 406 (LARGER) | 198-201-7 | 49.6% | -5.3% | 44.8%-54.5% | 192-211-3 | 47.6% | 0.92 | -0.24 | 49.0% | 51.5% |
| Meaningful asymmetric advantage | Full 2011-2025 | 862 (LARGER) | 421-422-19 | 49.9% | -4.7% | 46.6%-53.3% | 437-422-3 | 50.9% | -0.62 | -0.13 | 50.3% | 48.7% |
| Meaningful asymmetric advantage | Recent 2021-2025 | 293 (LARGER) | 148-138-7 | 51.7% | -1.2% | 46.0%-57.5% | 158-133-2 | 54.3% | -1.27 | 0.63 | 52.1% | 47.1% |
| Meaningful asymmetric advantage | Older 2011-2018 | 456 (LARGER) | 220-224-12 | 49.5% | -5.4% | 44.9%-54.2% | 226-230-0 | 49.6% | -0.35 | -0.45 | 49.3% | 48.4% |
| Meaningful asymmetric advantage | Newer 2019-2025 | 406 (LARGER) | 201-198-7 | 50.4% | -3.8% | 45.5%-55.3% | 211-192-3 | 52.4% | -0.92 | 0.24 | 51.5% | 49.0% |

## Pre-bye versus post-bye direct comparison

**Conclusion: SUBGROUP-DEPENDENT.** Pre-bye and post-bye samples have similar average team/opponent quality, home share, and broad market-role mix. The ATS gap is concentrated among favorites and home teams, so basic composition does not explain it away, but neither does the comparison establish a causal bye effect.

Article value: The comparison is valuable because simple strength and home/favorite frequency do not account for the gap; the divergence lives mainly inside the home/favorite subgroups and remains non-causal.

Key findings:

- The cohorts are equal-sized (480 each). Pregame team win percentage averaged 49.5% pre-bye versus 50.1% post-bye; opponent averages were 49.8% versus 49.6%.
- Pre-bye teams were slight average underdogs (+0.18) and post-bye teams slight favorites (-0.68). They were favored in 240 versus 264 games and home in 220 versus 226, so broad role/location shares are similar.
- Favorite performance diverged sharply: pre-bye favorites were 57.6% ATS full history and 67.9% recent, versus 47.2% and 42.5% for post-bye favorites. Underdogs were much closer (49.4% versus 50.9% full history).
- Home teams also diverged (57.4% pre-bye versus 45.2% post-bye full history), while road records were closer and reversed by era.
- Pre-bye teams coming off wins were 57.1% ATS (65.3% recent); post-bye teams coming off wins were 49.4% (47.7% recent).
- Pre-bye results exceeded 50% in four of five recent seasons; post-bye results varied and fell to 37.5% in 2024. The recent divergence is not caused solely by one pre-bye season.
- Rest composition necessarily differs: 358 pre-bye rows had normal seven-day rest, while every post-bye row was in the locked 10-17-day bye range.

### Direct overall comparison

Locked Phase 1 qualifiers shown side by side Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Pre-bye | Full 2011-2025 | 480 (LARGER) | 251-218-11 | 53.5% | 2.2% | 49.0%-58.0% | 258-218-4 | 54.2% | 0.18 | 0.83 | 49.5% | 49.8% |
| Pre-bye | Recent 2021-2025 | 162 (MODERATE) | 93-67-2 | 58.1% | 11.0% | 50.4%-65.5% | 89-71-2 | 55.6% | 0.32 | 0.42 | 49.5% | 50.5% |
| Pre-bye | Older 2011-2018 | 254 (LARGER) | 122-124-8 | 49.6% | -5.3% | 43.4%-55.8% | 134-118-2 | 53.2% | -0.18 | 0.85 | 49.4% | 49.3% |
| Pre-bye | Newer 2019-2025 | 226 (LARGER) | 129-94-3 | 57.9% | 10.4% | 51.3%-64.1% | 124-100-2 | 55.4% | 0.57 | 0.81 | 49.5% | 50.4% |
| Post-bye | Full 2011-2025 | 480 (LARGER) | 228-238-14 | 48.9% | -6.6% | 44.4%-53.5% | 250-227-3 | 52.4% | -0.68 | -0.33 | 50.1% | 49.6% |
| Post-bye | Recent 2021-2025 | 162 (MODERATE) | 75-81-6 | 48.1% | -8.2% | 40.4%-55.9% | 90-71-1 | 55.9% | -1.29 | 0.13 | 50.6% | 48.8% |
| Post-bye | Older 2011-2018 | 254 (LARGER) | 125-121-8 | 50.8% | -3.0% | 44.6%-57.0% | 131-121-2 | 52.0% | -0.39 | -0.06 | 49.8% | 49.1% |
| Post-bye | Newer 2019-2025 | 226 (LARGER) | 103-117-6 | 46.8% | -10.6% | 40.3%-53.4% | 119-106-1 | 52.9% | -1.01 | -0.62 | 50.5% | 50.1% |

### Qualifier by home / away

Venue within each bye qualifier Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Pre-bye: Home | Full 2011-2025 | 220 (LARGER) | 124-92-4 | 57.4% | 9.6% | 50.7%-63.8% | 130-90-0 | 59.1% | -1.06 | 1.72 | 49.5% | 51.6% |
| Pre-bye: Home | Recent 2021-2025 | 69 (LIMITED) | 45-23-1 | 66.2% | 26.3% | 54.3%-76.3% | 41-28-0 | 59.4% | -0.42 | 1.52 | 51.0% | 53.3% |
| Pre-bye: Home | Older 2011-2018 | 118 (MODERATE) | 59-56-3 | 51.3% | -2.1% | 42.3%-60.3% | 68-50-0 | 57.6% | -1.56 | 1.61 | 48.4% | 52.4% |
| Pre-bye: Home | Newer 2019-2025 | 102 (MODERATE) | 65-36-1 | 64.4% | 22.9% | 54.6%-73.0% | 62-40-0 | 60.8% | -0.48 | 1.85 | 50.7% | 50.7% |
| Pre-bye: Away | Full 2011-2025 | 192 (MODERATE) | 90-95-7 | 48.6% | -7.1% | 41.5%-55.8% | 91-99-2 | 47.9% | 1.68 | -0.18 | 51.8% | 50.5% |
| Pre-bye: Away | Recent 2021-2025 | 71 (LIMITED) | 35-35-1 | 50.0% | -4.5% | 38.6%-61.4% | 34-35-2 | 49.3% | 1.13 | -1.05 | 48.8% | 50.3% |
| Pre-bye: Away | Older 2011-2018 | 100 (MODERATE) | 44-51-5 | 46.3% | -11.6% | 36.6%-56.3% | 48-52-0 | 48.0% | 1.45 | 0.08 | 54.5% | 48.9% |
| Pre-bye: Away | Newer 2019-2025 | 92 (LIMITED) | 46-44-2 | 51.1% | -2.4% | 40.9%-61.2% | 43-47-2 | 47.8% | 1.93 | -0.46 | 48.8% | 52.4% |
| Pre-bye: Neutral | Full 2011-2025 | 68 (LIMITED) | 37-31-0 | 54.4% | 3.9% | 42.7%-65.7% | 37-29-2 | 56.1% | -0.07 | 0.82 | 43.0% | 42.1% |
| Pre-bye: Neutral | Recent 2021-2025 | 22 (VERY SMALL) | 13-9-0 | 59.1% | 12.8% | 38.7%-76.7% | 14-8-0 | 63.6% | 0.02 | 1.70 | 47.2% | 42.0% |
| Pre-bye: Neutral | Older 2011-2018 | 36 (VERY SMALL) | 19-17-0 | 52.8% | 0.8% | 37.0%-68.0% | 18-16-2 | 52.9% | -0.14 | 0.50 | 38.7% | 40.1% |
| Pre-bye: Neutral | Newer 2019-2025 | 32 (VERY SMALL) | 18-14-0 | 56.3% | 7.4% | 39.3%-71.8% | 19-13-0 | 59.4% | 0.02 | 1.17 | 47.9% | 44.3% |
| Post-bye: Home | Full 2011-2025 | 226 (LARGER) | 98-119-9 | 45.2% | -13.8% | 38.7%-51.8% | 126-99-1 | 56.0% | -2.92 | -1.03 | 49.6% | 48.5% |
| Post-bye: Home | Recent 2021-2025 | 87 (LIMITED) | 42-41-4 | 50.6% | -3.4% | 40.1%-61.1% | 53-34-0 | 60.9% | -2.80 | 0.47 | 50.3% | 50.2% |
| Post-bye: Home | Older 2011-2018 | 109 (MODERATE) | 42-62-5 | 40.4% | -22.9% | 31.5%-50.0% | 57-51-1 | 52.8% | -2.95 | -2.15 | 47.7% | 47.4% |
| Post-bye: Home | Newer 2019-2025 | 117 (MODERATE) | 56-57-4 | 49.6% | -5.4% | 40.5%-58.6% | 69-48-0 | 59.0% | -2.89 | 0.01 | 51.4% | 49.4% |
| Post-bye: Away | Full 2011-2025 | 250 (LARGER) | 129-116-5 | 52.6% | 0.5% | 46.4%-58.8% | 123-125-2 | 49.6% | 1.33 | 0.54 | 50.7% | 50.5% |
| Post-bye: Away | Recent 2021-2025 | 75 (LIMITED) | 33-40-2 | 45.2% | -13.7% | 34.3%-56.6% | 37-37-1 | 50.0% | 0.47 | -0.27 | 50.8% | 47.1% |
| Post-bye: Away | Older 2011-2018 | 141 (MODERATE) | 82-56-3 | 59.4% | 13.4% | 51.1%-67.3% | 73-67-1 | 52.1% | 1.59 | 1.96 | 51.6% | 50.3% |
| Post-bye: Away | Newer 2019-2025 | 109 (MODERATE) | 47-60-2 | 43.9% | -16.1% | 34.9%-53.4% | 50-58-1 | 46.3% | 1 | -1.30 | 49.6% | 50.8% |
| Post-bye: Neutral | Full 2011-2025 | 4 (VERY SMALL) | 1-3-0 | 25.0% | -52.3% | 4.6%-69.9% | 1-3-0 | 25.0% | -0.50 | -14.50 | 44.6% | 53.2% |
| Post-bye: Neutral | Recent 2021-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: Neutral | Older 2011-2018 | 4 (VERY SMALL) | 1-3-0 | 25.0% | -52.3% | 4.6%-69.9% | 1-3-0 | 25.0% | -0.50 | -14.50 | 44.6% | 53.2% |
| Post-bye: Neutral | Newer 2019-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |

### Qualifier by market role

Favorite, underdog, and pick'em within each bye qualifier Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Pre-bye: Favorite | Full 2011-2025 | 240 (LARGER) | 136-100-4 | 57.6% | 10.0% | 51.2%-63.8% | 171-66-3 | 72.2% | -4.49 | 1.65 | 58.2% | 41.3% |
| Pre-bye: Favorite | Recent 2021-2025 | 82 (LIMITED) | 55-26-1 | 67.9% | 29.6% | 57.1%-77.1% | 60-20-2 | 75.0% | -3.96 | 1.72 | 59.7% | 44.8% |
| Pre-bye: Favorite | Older 2011-2018 | 130 (MODERATE) | 69-58-3 | 54.3% | 3.7% | 45.7%-62.7% | 91-38-1 | 70.5% | -4.54 | 2.49 | 55.6% | 41.0% |
| Pre-bye: Favorite | Newer 2019-2025 | 110 (MODERATE) | 67-42-1 | 61.5% | 17.3% | 52.1%-70.1% | 80-28-2 | 74.1% | -4.42 | 0.65 | 61.2% | 41.7% |
| Pre-bye: Underdog | Full 2011-2025 | 240 (LARGER) | 115-118-7 | 49.4% | -5.8% | 43.0%-55.7% | 87-152-1 | 36.4% | 4.84 | 0.02 | 40.8% | 58.3% |
| Pre-bye: Underdog | Recent 2021-2025 | 80 (LIMITED) | 38-41-1 | 48.1% | -8.2% | 37.4%-59.0% | 29-51-0 | 36.3% | 4.71 | -0.91 | 39.1% | 56.3% |
| Pre-bye: Underdog | Older 2011-2018 | 124 (MODERATE) | 53-66-5 | 44.5% | -15.0% | 35.9%-53.5% | 43-80-1 | 35.0% | 4.40 | -0.86 | 43.0% | 57.9% |
| Pre-bye: Underdog | Newer 2019-2025 | 116 (MODERATE) | 62-52-2 | 54.4% | 3.8% | 45.3%-63.2% | 44-72-0 | 37.9% | 5.31 | 0.96 | 38.5% | 58.8% |
| Pre-bye: Pick'em | Full 2011-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pre-bye: Pick'em | Recent 2021-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pre-bye: Pick'em | Older 2011-2018 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pre-bye: Pick'em | Newer 2019-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: Favorite | Full 2011-2025 | 264 (LARGER) | 120-134-10 | 47.2% | -9.8% | 41.2%-53.4% | 176-87-1 | 66.9% | -5.36 | -0.52 | 57.3% | 41.6% |
| Post-bye: Favorite | Recent 2021-2025 | 92 (LIMITED) | 37-50-5 | 42.5% | -18.8% | 32.7%-53.0% | 63-29-0 | 68.5% | -5.67 | -0.15 | 57.1% | 41.2% |
| Post-bye: Favorite | Older 2011-2018 | 138 (MODERATE) | 69-64-5 | 51.9% | -1.0% | 43.5%-60.2% | 92-45-1 | 67.2% | -5.05 | -0.42 | 56.7% | 42.1% |
| Post-bye: Favorite | Newer 2019-2025 | 126 (MODERATE) | 51-70-5 | 42.1% | -19.5% | 33.7%-51.1% | 84-42-0 | 66.7% | -5.70 | -0.64 | 57.9% | 41.0% |
| Post-bye: Underdog | Full 2011-2025 | 216 (LARGER) | 108-104-4 | 50.9% | -2.7% | 44.3%-57.6% | 74-140-2 | 34.6% | 5.03 | -0.09 | 41.5% | 59.3% |
| Post-bye: Underdog | Recent 2021-2025 | 70 (LIMITED) | 38-31-1 | 55.1% | 5.1% | 43.4%-66.2% | 27-42-1 | 39.1% | 4.47 | 0.49 | 42.0% | 58.7% |
| Post-bye: Underdog | Older 2011-2018 | 116 (MODERATE) | 56-57-3 | 49.6% | -5.4% | 40.5%-58.6% | 39-76-1 | 33.9% | 5.15 | 0.36 | 41.6% | 57.4% |
| Post-bye: Underdog | Newer 2019-2025 | 100 (MODERATE) | 52-47-1 | 52.5% | 0.3% | 42.8%-62.1% | 35-64-1 | 35.4% | 4.89 | -0.60 | 41.3% | 61.6% |
| Post-bye: Pick'em | Full 2011-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: Pick'em | Recent 2021-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: Pick'em | Older 2011-2018 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: Pick'em | Newer 2019-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |

### Qualifier by studied-team quality

Leakage-safe current-season pregame record within each qualifier Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Pre-bye: Winning pregame record | Full 2011-2025 | 206 (LARGER) | 117-85-4 | 57.9% | 10.6% | 51.0%-64.5% | 131-72-3 | 64.5% | -2.09 | 1.43 | 72.6% | 52.0% |
| Pre-bye: Winning pregame record | Recent 2021-2025 | 74 (LIMITED) | 43-31-0 | 58.1% | 10.9% | 46.7%-68.7% | 44-28-2 | 61.1% | -1.78 | -0.49 | 70.4% | 54.6% |
| Pre-bye: Winning pregame record | Older 2011-2018 | 104 (MODERATE) | 59-41-4 | 59.0% | 12.6% | 49.2%-68.1% | 68-35-1 | 66.0% | -2.19 | 3.11 | 73.1% | 51.2% |
| Pre-bye: Winning pregame record | Newer 2019-2025 | 102 (MODERATE) | 58-44-0 | 56.9% | 8.6% | 47.2%-66.0% | 63-37-2 | 63.0% | -1.99 | -0.28 | 72.2% | 52.8% |
| Pre-bye: .500 pregame record | Full 2011-2025 | 64 (LIMITED) | 30-32-2 | 48.4% | -7.6% | 36.4%-60.6% | 31-33-0 | 48.4% | 0.66 | 1.33 | 50.0% | 54.7% |
| Pre-bye: .500 pregame record | Recent 2021-2025 | 11 (VERY SMALL) | 8-3-0 | 72.7% | 38.8% | 43.4%-90.3% | 8-3-0 | 72.7% | -0.55 | 7.36 | 50.0% | 46.5% |
| Pre-bye: .500 pregame record | Older 2011-2018 | 46 (VERY SMALL) | 17-27-2 | 38.6% | -26.2% | 25.7%-53.4% | 17-29-0 | 37.0% | 0.78 | -0.87 | 50.0% | 55.1% |
| Pre-bye: .500 pregame record | Newer 2019-2025 | 18 (VERY SMALL) | 13-5-0 | 72.2% | 37.9% | 49.1%-87.5% | 14-4-0 | 77.8% | 0.33 | 6.94 | 50.0% | 53.7% |
| Pre-bye: Losing pregame record | Full 2011-2025 | 210 (LARGER) | 104-101-5 | 50.7% | -3.1% | 43.9%-57.5% | 96-113-1 | 45.9% | 2.26 | 0.10 | 26.6% | 46.2% |
| Pre-bye: Losing pregame record | Recent 2021-2025 | 77 (LIMITED) | 42-33-2 | 56.0% | 6.9% | 44.8%-66.7% | 37-40-0 | 48.0% | 2.46 | 0.31 | 29.4% | 47.0% |
| Pre-bye: Losing pregame record | Older 2011-2018 | 104 (MODERATE) | 46-56-2 | 45.1% | -13.9% | 35.8%-54.8% | 49-54-1 | 47.6% | 1.42 | -0.64 | 25.5% | 44.7% |
| Pre-bye: Losing pregame record | Newer 2019-2025 | 106 (MODERATE) | 58-45-3 | 56.3% | 7.5% | 46.7%-65.5% | 47-59-0 | 44.3% | 3.08 | 0.83 | 27.7% | 47.6% |
| Pre-bye: No prior games | Full 2011-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pre-bye: No prior games | Recent 2021-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pre-bye: No prior games | Older 2011-2018 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pre-bye: No prior games | Newer 2019-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: Winning pregame record | Full 2011-2025 | 213 (LARGER) | 104-104-5 | 50.0% | -4.5% | 43.3%-56.7% | 134-78-1 | 63.2% | -3.72 | -0.12 | 71.6% | 50.5% |
| Post-bye: Winning pregame record | Recent 2021-2025 | 73 (LIMITED) | 36-35-2 | 50.7% | -3.2% | 39.3%-62.0% | 49-24-0 | 67.1% | -4.62 | 1.11 | 70.1% | 47.4% |
| Post-bye: Winning pregame record | Older 2011-2018 | 108 (MODERATE) | 54-51-3 | 51.4% | -1.8% | 42.0%-60.8% | 68-39-1 | 63.5% | -3.35 | -0.04 | 72.0% | 49.1% |
| Post-bye: Winning pregame record | Newer 2019-2025 | 105 (MODERATE) | 50-53-2 | 48.5% | -7.3% | 39.1%-58.1% | 66-39-0 | 62.9% | -4.10 | -0.20 | 71.2% | 51.9% |
| Post-bye: .500 pregame record | Full 2011-2025 | 49 (VERY SMALL) | 23-24-2 | 48.9% | -6.6% | 35.3%-62.8% | 27-22-0 | 55.1% | -0.34 | 1.40 | 50.0% | 51.8% |
| Post-bye: .500 pregame record | Recent 2021-2025 | 22 (VERY SMALL) | 9-11-2 | 45.0% | -14.1% | 25.8%-65.8% | 15-7-0 | 68.2% | -0.43 | 1.30 | 50.0% | 52.6% |
| Post-bye: .500 pregame record | Older 2011-2018 | 23 (VERY SMALL) | 12-11-0 | 52.2% | -0.4% | 33.0%-70.8% | 10-13-0 | 43.5% | -0.28 | 1.28 | 50.0% | 51.0% |
| Post-bye: .500 pregame record | Newer 2019-2025 | 26 (VERY SMALL) | 11-13-2 | 45.8% | -12.5% | 27.9%-64.9% | 17-9-0 | 65.4% | -0.38 | 1.50 | 50.0% | 52.5% |
| Post-bye: Losing pregame record | Full 2011-2025 | 218 (LARGER) | 101-110-7 | 47.9% | -8.6% | 41.2%-54.6% | 89-127-2 | 41.2% | 2.20 | -0.92 | 29.2% | 48.2% |
| Post-bye: Losing pregame record | Recent 2021-2025 | 67 (LIMITED) | 30-35-2 | 46.2% | -11.9% | 34.6%-58.1% | 26-40-1 | 39.4% | 2.06 | -1.33 | 29.5% | 48.9% |
| Post-bye: Losing pregame record | Older 2011-2018 | 123 (MODERATE) | 59-59-5 | 50.0% | -4.5% | 41.1%-58.9% | 53-69-1 | 43.4% | 2.19 | -0.33 | 30.3% | 48.8% |
| Post-bye: Losing pregame record | Newer 2019-2025 | 95 (LIMITED) | 42-51-2 | 45.2% | -13.8% | 35.4%-55.3% | 36-58-1 | 38.3% | 2.22 | -1.67 | 27.8% | 47.5% |
| Post-bye: No prior games | Full 2011-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: No prior games | Recent 2021-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: No prior games | Older 2011-2018 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: No prior games | Newer 2019-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |

### Qualifier by opponent quality

Leakage-safe opponent current-season pregame record within each qualifier Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Pre-bye: Winning pregame record | Full 2011-2025 | 204 (LARGER) | 100-95-9 | 51.3% | -2.1% | 44.3%-58.2% | 88-114-2 | 43.6% | 2.97 | -0.50 | 50.3% | 74.0% |
| Pre-bye: Winning pregame record | Recent 2021-2025 | 70 (LIMITED) | 36-33-1 | 52.2% | -0.4% | 40.6%-63.5% | 31-38-1 | 44.9% | 2.63 | -1.80 | 52.5% | 72.0% |
| Pre-bye: Winning pregame record | Older 2011-2018 | 108 (MODERATE) | 49-52-7 | 48.5% | -7.4% | 39.0%-58.1% | 48-59-1 | 44.9% | 2.43 | -0.11 | 49.7% | 73.6% |
| Pre-bye: Winning pregame record | Newer 2019-2025 | 96 (LIMITED) | 51-43-2 | 54.3% | 3.6% | 44.2%-64.0% | 40-55-1 | 42.1% | 3.57 | -0.95 | 50.9% | 74.4% |
| Pre-bye: .500 pregame record | Full 2011-2025 | 61 (LIMITED) | 32-28-1 | 53.3% | 1.8% | 40.9%-65.4% | 32-29-0 | 52.5% | -1.20 | 1.15 | 59.4% | 50.0% |
| Pre-bye: .500 pregame record | Recent 2021-2025 | 18 (VERY SMALL) | 11-7-0 | 61.1% | 16.7% | 38.6%-79.7% | 9-9-0 | 50.0% | -0.19 | -2.81 | 57.0% | 50.0% |
| Pre-bye: .500 pregame record | Older 2011-2018 | 35 (VERY SMALL) | 16-18-1 | 47.1% | -10.2% | 31.4%-63.3% | 19-16-0 | 54.3% | -1.56 | 2.39 | 59.4% | 50.0% |
| Pre-bye: .500 pregame record | Newer 2019-2025 | 26 (VERY SMALL) | 16-10-0 | 61.5% | 17.5% | 42.5%-77.6% | 13-13-0 | 50.0% | -0.71 | -0.52 | 59.3% | 50.0% |
| Pre-bye: Losing pregame record | Full 2011-2025 | 215 (LARGER) | 119-95-1 | 55.6% | 6.2% | 48.9%-62.1% | 138-75-2 | 64.8% | -2.08 | 2.01 | 45.9% | 26.8% |
| Pre-bye: Losing pregame record | Recent 2021-2025 | 74 (LIMITED) | 46-27-1 | 63.0% | 20.3% | 51.5%-73.2% | 49-24-1 | 67.1% | -1.74 | 3.30 | 44.9% | 30.2% |
| Pre-bye: Losing pregame record | Older 2011-2018 | 111 (MODERATE) | 57-54-0 | 51.3% | -2.0% | 42.2%-60.5% | 67-43-1 | 60.9% | -2.27 | 1.30 | 46.0% | 25.3% |
| Pre-bye: Losing pregame record | Newer 2019-2025 | 104 (MODERATE) | 62-41-1 | 60.2% | 14.9% | 50.5%-69.1% | 71-32-1 | 68.9% | -1.87 | 2.77 | 45.8% | 28.5% |
| Pre-bye: No prior games | Full 2011-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pre-bye: No prior games | Recent 2021-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pre-bye: No prior games | Older 2011-2018 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pre-bye: No prior games | Newer 2019-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: Winning pregame record | Full 2011-2025 | 205 (LARGER) | 101-103-1 | 49.5% | -5.5% | 42.7%-56.3% | 89-114-2 | 43.8% | 2.03 | 0.10 | 51.8% | 71.1% |
| Post-bye: Winning pregame record | Recent 2021-2025 | 68 (LIMITED) | 36-31-1 | 53.7% | 2.6% | 41.9%-65.1% | 33-34-1 | 49.3% | 1.57 | 1.82 | 49.0% | 68.2% |
| Post-bye: Winning pregame record | Older 2011-2018 | 105 (MODERATE) | 53-52-0 | 50.5% | -3.6% | 41.1%-59.9% | 45-59-1 | 43.3% | 2.28 | 0.55 | 51.8% | 71.1% |
| Post-bye: Winning pregame record | Newer 2019-2025 | 100 (MODERATE) | 48-51-1 | 48.5% | -7.4% | 38.9%-58.2% | 44-55-1 | 44.4% | 1.76 | -0.37 | 51.8% | 71.1% |
| Post-bye: .500 pregame record | Full 2011-2025 | 54 (LIMITED) | 30-21-3 | 58.8% | 12.3% | 45.2%-71.3% | 33-21-0 | 61.1% | -0.61 | 0.33 | 54.7% | 50.0% |
| Post-bye: .500 pregame record | Recent 2021-2025 | 16 (VERY SMALL) | 10-5-1 | 66.7% | 27.3% | 41.7%-84.8% | 11-5-0 | 68.8% | -0.16 | 1.66 | 57.8% | 50.0% |
| Post-bye: .500 pregame record | Older 2011-2018 | 30 (VERY SMALL) | 15-13-2 | 53.6% | 2.3% | 35.8%-70.5% | 16-14-0 | 53.3% | -0.80 | -1.63 | 52.6% | 50.0% |
| Post-bye: .500 pregame record | Newer 2019-2025 | 24 (VERY SMALL) | 15-8-1 | 65.2% | 24.5% | 44.9%-81.2% | 17-7-0 | 70.8% | -0.38 | 2.79 | 57.4% | 50.0% |
| Post-bye: Losing pregame record | Full 2011-2025 | 221 (LARGER) | 97-114-10 | 46.0% | -12.2% | 39.4%-52.7% | 128-92-1 | 58.2% | -3.22 | -0.88 | 47.5% | 29.5% |
| Post-bye: Losing pregame record | Recent 2021-2025 | 78 (LIMITED) | 29-45-4 | 39.2% | -25.2% | 28.9%-50.6% | 46-32-0 | 59.0% | -4.01 | -1.67 | 50.5% | 31.6% |
| Post-bye: Losing pregame record | Older 2011-2018 | 119 (MODERATE) | 57-56-6 | 50.4% | -3.7% | 41.4%-59.5% | 70-48-1 | 59.3% | -2.65 | -0.20 | 47.3% | 29.5% |
| Post-bye: Losing pregame record | Newer 2019-2025 | 102 (MODERATE) | 40-58-4 | 40.8% | -22.1% | 31.6%-50.7% | 58-44-0 | 56.9% | -3.88 | -1.68 | 47.7% | 29.6% |
| Post-bye: No prior games | Full 2011-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: No prior games | Recent 2021-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: No prior games | Older 2011-2018 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: No prior games | Newer 2019-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |

### Qualifier by current rest structure

Fixed current-team rest-day buckets within each qualifier Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Pre-bye: Short rest (6 or fewer) | Full 2011-2025 | 50 (LIMITED) | 28-21-1 | 57.1% | 9.1% | 43.3%-70.0% | 25-25-0 | 50.0% | 0.69 | 1.45 | 49.9% | 53.9% |
| Pre-bye: Short rest (6 or fewer) | Recent 2021-2025 | 16 (VERY SMALL) | 11-5-0 | 68.8% | 31.3% | 44.4%-85.8% | 9-7-0 | 56.3% | -0.25 | 2.25 | 52.5% | 50.3% |
| Pre-bye: Short rest (6 or fewer) | Older 2011-2018 | 27 (VERY SMALL) | 13-13-1 | 50.0% | -4.5% | 32.1%-67.9% | 14-13-0 | 51.8% | 0.65 | 1.65 | 51.4% | 53.9% |
| Pre-bye: Short rest (6 or fewer) | Newer 2019-2025 | 23 (VERY SMALL) | 15-8-0 | 65.2% | 24.5% | 44.9%-81.2% | 11-12-0 | 47.8% | 0.74 | 1.22 | 48.0% | 53.8% |
| Pre-bye: Normal rest (7) | Full 2011-2025 | 358 (LARGER) | 185-166-7 | 52.7% | 0.6% | 47.5%-57.9% | 194-160-4 | 54.8% | 0.21 | 0.75 | 48.9% | 49.4% |
| Pre-bye: Normal rest (7) | Recent 2021-2025 | 116 (MODERATE) | 61-53-2 | 53.5% | 2.1% | 44.4%-62.4% | 62-52-2 | 54.4% | 0.69 | -0.31 | 47.3% | 50.5% |
| Pre-bye: Normal rest (7) | Older 2011-2018 | 198 (MODERATE) | 99-95-4 | 51.0% | -2.6% | 44.0%-58.0% | 105-91-2 | 53.6% | -0.17 | 0.97 | 49.0% | 48.9% |
| Pre-bye: Normal rest (7) | Newer 2019-2025 | 160 (MODERATE) | 86-71-3 | 54.8% | 4.6% | 47.0%-62.4% | 89-69-2 | 56.3% | 0.68 | 0.48 | 48.8% | 50.0% |
| Pre-bye: Extended rest (8-9) | Full 2011-2025 | 47 (VERY SMALL) | 27-18-2 | 60.0% | 14.5% | 45.5%-73.0% | 27-20-0 | 57.5% | -1.09 | 1.79 | 55.4% | 50.2% |
| Pre-bye: Extended rest (8-9) | Recent 2021-2025 | 23 (VERY SMALL) | 17-6-0 | 73.9% | 41.1% | 53.5%-87.5% | 14-9-0 | 60.9% | -1.37 | 2.80 | 55.8% | 49.8% |
| Pre-bye: Extended rest (8-9) | Older 2011-2018 | 16 (VERY SMALL) | 5-9-2 | 35.7% | -31.8% | 16.3%-61.2% | 9-7-0 | 56.3% | -2.22 | 0.28 | 55.4% | 52.1% |
| Pre-bye: Extended rest (8-9) | Newer 2019-2025 | 31 (VERY SMALL) | 22-9-0 | 71.0% | 35.5% | 53.4%-83.9% | 18-13-0 | 58.1% | -0.50 | 2.56 | 55.4% | 49.2% |
| Pre-bye: Bye-range rest (10-17) | Full 2011-2025 | 25 (VERY SMALL) | 11-13-1 | 45.8% | -12.5% | 27.9%-64.9% | 12-13-0 | 48.0% | 1.02 | -1.02 | 46.0% | 47.1% |
| Pre-bye: Bye-range rest (10-17) | Recent 2021-2025 | 7 (VERY SMALL) | 4-3-0 | 57.1% | 9.1% | 25.1%-84.2% | 4-3-0 | 57.1% | 1.07 | 0.50 | 58.6% | 52.0% |
| Pre-bye: Bye-range rest (10-17) | Older 2011-2018 | 13 (VERY SMALL) | 5-7-1 | 41.7% | -20.4% | 19.3%-68.0% | 6-7-0 | 46.2% | 0.54 | -1.92 | 44.8% | 41.3% |
| Pre-bye: Bye-range rest (10-17) | Newer 2019-2025 | 12 (VERY SMALL) | 6-6-0 | 50.0% | -4.5% | 25.4%-74.6% | 6-6-0 | 50.0% | 1.54 | -0.04 | 47.3% | 53.5% |
| Pre-bye: Very extended rest (18+) | Full 2011-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pre-bye: Very extended rest (18+) | Recent 2021-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pre-bye: Very extended rest (18+) | Older 2011-2018 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pre-bye: Very extended rest (18+) | Newer 2019-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pre-bye: No prior game | Full 2011-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pre-bye: No prior game | Recent 2021-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pre-bye: No prior game | Older 2011-2018 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pre-bye: No prior game | Newer 2019-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: Short rest (6 or fewer) | Full 2011-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: Short rest (6 or fewer) | Recent 2021-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: Short rest (6 or fewer) | Older 2011-2018 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: Short rest (6 or fewer) | Newer 2019-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: Normal rest (7) | Full 2011-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: Normal rest (7) | Recent 2021-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: Normal rest (7) | Older 2011-2018 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: Normal rest (7) | Newer 2019-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: Extended rest (8-9) | Full 2011-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: Extended rest (8-9) | Recent 2021-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: Extended rest (8-9) | Older 2011-2018 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: Extended rest (8-9) | Newer 2019-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: Bye-range rest (10-17) | Full 2011-2025 | 480 (LARGER) | 228-238-14 | 48.9% | -6.6% | 44.4%-53.5% | 250-227-3 | 52.4% | -0.68 | -0.33 | 50.1% | 49.6% |
| Post-bye: Bye-range rest (10-17) | Recent 2021-2025 | 162 (MODERATE) | 75-81-6 | 48.1% | -8.2% | 40.4%-55.9% | 90-71-1 | 55.9% | -1.29 | 0.13 | 50.6% | 48.8% |
| Post-bye: Bye-range rest (10-17) | Older 2011-2018 | 254 (LARGER) | 125-121-8 | 50.8% | -3.0% | 44.6%-57.0% | 131-121-2 | 52.0% | -0.39 | -0.06 | 49.8% | 49.1% |
| Post-bye: Bye-range rest (10-17) | Newer 2019-2025 | 226 (LARGER) | 103-117-6 | 46.8% | -10.6% | 40.3%-53.4% | 119-106-1 | 52.9% | -1.01 | -0.62 | 50.5% | 50.1% |
| Post-bye: Very extended rest (18+) | Full 2011-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: Very extended rest (18+) | Recent 2021-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: Very extended rest (18+) | Older 2011-2018 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: Very extended rest (18+) | Newer 2019-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: No prior game | Full 2011-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: No prior game | Recent 2021-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: No prior game | Older 2011-2018 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: No prior game | Newer 2019-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |

### Qualifier by previous result

Immediately prior same-season straight-up result Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Pre-bye: Coming off win | Full 2011-2025 | 227 (LARGER) | 125-94-8 | 57.1% | 9.0% | 50.5%-63.5% | 138-87-2 | 61.3% | -1.33 | 1.65 | 62.3% | 50.7% |
| Pre-bye: Coming off win | Recent 2021-2025 | 74 (LIMITED) | 47-25-2 | 65.3% | 24.6% | 53.8%-75.3% | 48-25-1 | 65.8% | -1.07 | 1.32 | 59.9% | 53.5% |
| Pre-bye: Coming off win | Older 2011-2018 | 121 (MODERATE) | 60-55-6 | 52.2% | -0.4% | 43.1%-61.1% | 68-52-1 | 56.7% | -1.15 | 2.14 | 62.5% | 50.6% |
| Pre-bye: Coming off win | Newer 2019-2025 | 106 (MODERATE) | 65-39-2 | 62.5% | 19.3% | 52.9%-71.2% | 70-35-1 | 66.7% | -1.54 | 1.08 | 62.2% | 50.8% |
| Pre-bye: Coming off loss | Full 2011-2025 | 252 (LARGER) | 126-123-3 | 50.6% | -3.4% | 44.4%-56.8% | 120-130-2 | 48.0% | 1.53 | 0.13 | 37.9% | 49.1% |
| Pre-bye: Coming off loss | Recent 2021-2025 | 88 (LIMITED) | 46-42-0 | 52.3% | -0.2% | 42.0%-62.4% | 41-46-1 | 47.1% | 1.49 | -0.34 | 40.8% | 47.9% |
| Pre-bye: Coming off loss | Older 2011-2018 | 132 (MODERATE) | 62-68-2 | 47.7% | -8.9% | 39.3%-56.2% | 66-65-1 | 50.4% | 0.70 | -0.27 | 37.5% | 48.2% |
| Pre-bye: Coming off loss | Newer 2019-2025 | 120 (MODERATE) | 64-55-1 | 53.8% | 2.7% | 44.9%-62.5% | 54-65-1 | 45.4% | 2.44 | 0.57 | 38.4% | 50.2% |
| Pre-bye: Coming off tie | Full 2011-2025 | 1 (VERY SMALL) | 0-1-0 | 0.0% | -100.0% | 0.0%-79.3% | 0-1-0 | 0.0% | 2.50 | -7.50 | 50.0% | 16.7% |
| Pre-bye: Coming off tie | Recent 2021-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pre-bye: Coming off tie | Older 2011-2018 | 1 (VERY SMALL) | 0-1-0 | 0.0% | -100.0% | 0.0%-79.3% | 0-1-0 | 0.0% | 2.50 | -7.50 | 50.0% | 16.7% |
| Pre-bye: Coming off tie | Newer 2019-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pre-bye: No prior game | Full 2011-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pre-bye: No prior game | Recent 2021-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pre-bye: No prior game | Older 2011-2018 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Pre-bye: No prior game | Newer 2019-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: Coming off win | Full 2011-2025 | 258 (LARGER) | 124-127-7 | 49.4% | -5.7% | 43.3%-55.5% | 149-108-1 | 58.0% | -1.55 | -0.25 | 60.6% | 51.5% |
| Post-bye: Coming off win | Recent 2021-2025 | 89 (LIMITED) | 41-45-3 | 47.7% | -9.0% | 37.5%-58.1% | 53-36-0 | 59.6% | -1.78 | 0.19 | 58.9% | 49.5% |
| Post-bye: Coming off win | Older 2011-2018 | 134 (MODERATE) | 70-60-4 | 53.8% | 2.8% | 45.3%-62.2% | 79-54-1 | 59.4% | -1.28 | 0.22 | 60.7% | 50.9% |
| Post-bye: Coming off win | Newer 2019-2025 | 124 (MODERATE) | 54-67-3 | 44.6% | -14.8% | 36.1%-53.5% | 70-54-0 | 56.5% | -1.85 | -0.76 | 60.4% | 52.1% |
| Post-bye: Coming off loss | Full 2011-2025 | 218 (LARGER) | 103-108-7 | 48.8% | -6.8% | 42.1%-55.5% | 99-117-2 | 45.8% | 0.43 | -0.35 | 37.7% | 47.2% |
| Post-bye: Coming off loss | Recent 2021-2025 | 71 (LIMITED) | 34-34-3 | 50.0% | -4.5% | 38.4%-61.6% | 36-34-1 | 51.4% | -0.45 | 0.30 | 39.9% | 47.8% |
| Post-bye: Coming off loss | Older 2011-2018 | 118 (MODERATE) | 54-60-4 | 47.4% | -9.6% | 38.4%-56.5% | 51-66-1 | 43.6% | 0.64 | -0.39 | 37.4% | 46.8% |
| Post-bye: Coming off loss | Newer 2019-2025 | 100 (MODERATE) | 49-48-3 | 50.5% | -3.6% | 40.7%-60.3% | 48-51-1 | 48.5% | 0.18 | -0.29 | 38.1% | 47.6% |
| Post-bye: Coming off tie | Full 2011-2025 | 4 (VERY SMALL) | 1-3-0 | 25.0% | -52.3% | 4.6%-69.9% | 2-2-0 | 50.0% | -5.50 | -4 | 55.0% | 55.7% |
| Post-bye: Coming off tie | Recent 2021-2025 | 2 (VERY SMALL) | 0-2-0 | 0.0% | -100.0% | 0.0%-65.8% | 1-1-0 | 50.0% | -9.25 | -8.75 | 60.1% | 48.9% |
| Post-bye: Coming off tie | Older 2011-2018 | 2 (VERY SMALL) | 1-1-0 | 50.0% | -4.5% | 9.4%-90.5% | 1-1-0 | 50.0% | -1.75 | 0.75 | 50.0% | 62.5% |
| Post-bye: Coming off tie | Newer 2019-2025 | 2 (VERY SMALL) | 0-2-0 | 0.0% | -100.0% | 0.0%-65.8% | 1-1-0 | 50.0% | -9.25 | -8.75 | 60.1% | 48.9% |
| Post-bye: No prior game | Full 2011-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: No prior game | Recent 2021-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: No prior game | Older 2011-2018 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |
| Post-bye: No prior game | Newer 2019-2025 | 0 (VERY SMALL) | 0-0-0 | N/A | N/A | N/A-N/A | 0-0-0 | N/A | N/A | N/A | N/A | N/A |

### Qualifier by season

Each fixed season within each qualifier Overlap policy: **mutually exclusive siblings**.

| Split | Period | n (label) | ATS W-L-P | ATS % | ROI | 95% CI | SU W-L-T | SU % | Avg spread | Avg cover | Avg team pregame win % | Avg opponent pregame win % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Pre-bye: 2011 | Season | 32 (VERY SMALL) | 16-13-3 | 55.2% | 5.3% | 37.5%-71.6% | 19-13-0 | 59.4% | 0.08 | 0.77 | 50.7% | 51.2% |
| Pre-bye: 2012 | Season | 32 (VERY SMALL) | 10-22-0 | 31.3% | -40.3% | 17.9%-48.6% | 12-20-0 | 37.5% | -1.13 | -3.16 | 49.3% | 46.3% |
| Pre-bye: 2013 | Season | 32 (VERY SMALL) | 19-13-0 | 59.4% | 13.4% | 42.3%-74.5% | 19-13-0 | 59.4% | -0.67 | 5.02 | 45.6% | 45.1% |
| Pre-bye: 2014 | Season | 32 (VERY SMALL) | 14-17-1 | 45.2% | -13.8% | 29.2%-62.2% | 15-17-0 | 46.9% | 0.48 | -0.70 | 51.2% | 48.8% |
| Pre-bye: 2015 | Season | 32 (VERY SMALL) | 16-16-0 | 50.0% | -4.5% | 33.6%-66.4% | 17-15-0 | 53.1% | -0.44 | 0 | 50.7% | 48.4% |
| Pre-bye: 2016 | Season | 32 (VERY SMALL) | 18-14-0 | 56.3% | 7.4% | 39.3%-71.8% | 18-12-2 | 60.0% | 1.11 | 2.20 | 48.5% | 52.6% |
| Pre-bye: 2017 | Season | 30 (VERY SMALL) | 14-14-2 | 50.0% | -4.5% | 32.6%-67.4% | 15-15-0 | 50.0% | -0.20 | 1.77 | 52.0% | 51.1% |
| Pre-bye: 2018 | Season | 32 (VERY SMALL) | 15-15-2 | 50.0% | -4.5% | 33.1%-66.8% | 19-13-0 | 59.4% | -0.64 | 0.98 | 47.4% | 50.7% |
| Pre-bye: 2019 | Season | 32 (VERY SMALL) | 19-12-1 | 61.3% | 17.0% | 43.8%-76.3% | 18-14-0 | 56.3% | 1.91 | 2.47 | 49.8% | 57.2% |
| Pre-bye: 2020 | Season | 32 (VERY SMALL) | 17-15-0 | 53.1% | 1.4% | 36.4%-69.1% | 17-15-0 | 53.1% | 0.52 | 1.14 | 49.4% | 43.6% |
| Pre-bye: 2021 | Season | 32 (VERY SMALL) | 16-16-0 | 50.0% | -4.5% | 33.6%-66.4% | 16-16-0 | 50.0% | -0.53 | -3.06 | 50.6% | 47.3% |
| Pre-bye: 2022 | Season | 34 (VERY SMALL) | 24-9-1 | 72.7% | 38.8% | 55.8%-84.9% | 21-12-1 | 63.6% | 0.15 | 3.65 | 50.3% | 49.8% |
| Pre-bye: 2023 | Season | 32 (VERY SMALL) | 17-14-1 | 54.8% | 4.7% | 37.8%-70.8% | 18-14-0 | 56.3% | 1.30 | 1.14 | 49.0% | 56.0% |
| Pre-bye: 2024 | Season | 32 (VERY SMALL) | 17-15-0 | 53.1% | 1.4% | 36.4%-69.1% | 16-16-0 | 50.0% | 0.22 | -0.78 | 49.1% | 49.6% |
| Pre-bye: 2025 | Season | 32 (VERY SMALL) | 19-13-0 | 59.4% | 13.4% | 42.3%-74.5% | 18-13-1 | 58.1% | 0.48 | 0.95 | 48.5% | 49.6% |
| Post-bye: 2011 | Season | 32 (VERY SMALL) | 15-16-1 | 48.4% | -7.6% | 32.0%-65.2% | 16-16-0 | 50.0% | -0.13 | -0.38 | 51.7% | 47.3% |
| Post-bye: 2012 | Season | 32 (VERY SMALL) | 18-14-0 | 56.3% | 7.4% | 39.3%-71.8% | 15-15-2 | 50.0% | 0.27 | 2.67 | 46.6% | 50.5% |
| Post-bye: 2013 | Season | 32 (VERY SMALL) | 15-17-0 | 46.9% | -10.5% | 30.9%-63.5% | 18-14-0 | 56.3% | -1.23 | -1.05 | 47.7% | 47.4% |
| Post-bye: 2014 | Season | 32 (VERY SMALL) | 11-20-1 | 35.5% | -32.3% | 21.1%-53.0% | 12-20-0 | 37.5% | 0.11 | -3.92 | 49.9% | 51.1% |
| Post-bye: 2015 | Season | 32 (VERY SMALL) | 18-14-0 | 56.3% | 7.4% | 39.3%-71.8% | 16-16-0 | 50.0% | 1.42 | 2.39 | 50.2% | 53.4% |
| Post-bye: 2016 | Season | 32 (VERY SMALL) | 19-11-2 | 63.3% | 20.9% | 45.5%-78.1% | 21-11-0 | 65.6% | -1.77 | -0.20 | 50.9% | 48.1% |
| Post-bye: 2017 | Season | 30 (VERY SMALL) | 13-15-2 | 46.4% | -11.4% | 29.5%-64.2% | 15-15-0 | 50.0% | -2.15 | -0.05 | 51.5% | 43.5% |
| Post-bye: 2018 | Season | 32 (VERY SMALL) | 16-14-2 | 53.3% | 1.8% | 36.1%-69.8% | 18-14-0 | 56.3% | 0.23 | 0.05 | 50.0% | 51.1% |
| Post-bye: 2019 | Season | 32 (VERY SMALL) | 13-19-0 | 40.6% | -22.4% | 25.5%-57.7% | 11-21-0 | 34.4% | 0.45 | -4.05 | 50.5% | 56.7% |
| Post-bye: 2020 | Season | 32 (VERY SMALL) | 15-17-0 | 46.9% | -10.5% | 30.9%-63.5% | 18-14-0 | 56.3% | -1.09 | -1 | 50.3% | 50.2% |
| Post-bye: 2021 | Season | 32 (VERY SMALL) | 14-16-2 | 46.7% | -10.9% | 30.2%-63.9% | 18-13-1 | 58.1% | -1.47 | -1.28 | 50.7% | 48.3% |
| Post-bye: 2022 | Season | 34 (VERY SMALL) | 17-16-1 | 51.5% | -1.7% | 35.2%-67.5% | 20-14-0 | 58.8% | -2.87 | -1.57 | 52.1% | 47.3% |
| Post-bye: 2023 | Season | 32 (VERY SMALL) | 15-14-3 | 51.7% | -1.3% | 34.4%-68.6% | 20-12-0 | 62.5% | 0.72 | 2.28 | 50.4% | 54.3% |
| Post-bye: 2024 | Season | 32 (VERY SMALL) | 12-20-0 | 37.5% | -28.4% | 22.9%-54.8% | 15-17-0 | 46.9% | -0.77 | -0.14 | 49.3% | 49.6% |
| Post-bye: 2025 | Season | 32 (VERY SMALL) | 17-15-0 | 53.1% | 1.4% | 36.4%-69.1% | 17-15-0 | 53.1% | -1.95 | 1.45 | 50.2% | 44.4% |

## Cross-area synthesis

### Strongest broad patterns

- West-to-East early performance is the broadest positive descriptive pattern: both eras and both market roles point above 50%, four of five franchises are positive, and no coarse distance bucket creates the result. The total sample remains moderate.
- Pre-bye performance is materially stronger in the newer era and in four of five recent seasons, but the magnitude is concentrated among home teams and favorites.

### Subgroup-dependent findings

- Pre-bye: home/favorite cohorts account for most of the favorable result; away/underdog cohorts remain near 50%.
- Divisional underdogs: recent improvement is concentrated among road teams, smaller dogs, and selected divisions.
- Pre-bye versus post-bye: the divergence is greatest among favorites, home teams, and teams coming off wins.

### Era-dependent findings

- Pre-bye improved from 49.6% ATS in 2011-2018 to 57.9% in 2019-2025.
- Divisional underdogs improved from 49.4% to 53.6%, but the gain is not uniform by dog size or division.
- Monday-to-Sunday short-rest disadvantage and mini-bye rest edge improved in the newer era without establishing a full-history edge.

### Composition assessment

- West-to-East early is not explained by one or two franchises or by favorite/underdog mix, though Las Vegas/Oakland and large underdogs are exceptions.
- Pre-bye and post-bye cohorts have very similar average pregame quality and home/favorite shares; basic composition does not explain their ATS divergence, which is conditional on market role and venue.
- Division membership materially changes divisional-underdog results, weakening any league-wide interpretation.

### Phase 3 candidates (not started)

- Prospective or untouched-future confirmation of the unchanged overall pre-bye and West-to-East early qualifiers, with the Phase 2 strata monitored rather than optimized.
- Paired or cluster-aware uncertainty and a predeclared descriptive adjustment for pregame strength, venue, spread, and season; no recursive filter search.
- A timestamped, source-identified market-line study to determine whether the settled historical line result persists at observable pregame prices.

## Interpretation guardrails and Phase 3 candidates

Phase 2 does not select a profitable combination, optimize a threshold, or promote any result into production. Differences across teams, seasons, market roles, and quality cohorts are composition checks, not causal controls. The simple Wilson intervals are uncertainty context and do not adjust for within-game dependence or the number of displayed predefined splits.

Potential Phase 3 work, only if separately approved, is limited to prospective or held-out confirmation of the most stable predefined observations, stronger point-in-time strength controls, and clustered/paired uncertainty analysis. No Phase 3 work is started here.

## Reproduction

1. Rebuild and verify Phase 1: `npm run nfl:situational-trends -- --input=data/external/nflverse/games.csv --start-season=2011 --end-season=2025`.
2. Build Phase 2 from the locked Phase 1 artifacts: `npm run nfl:situational-trends:phase2`.
3. Run both pure-logic suites: `npm run nfl:situational-trends:test` and `npm run nfl:situational-trends:phase2:test`.

Phase 2 input hashes: Phase 1 report `fa601ac5a10524641f6f5cf25fc5bda4229c86d72c9145bf49a311cf9bc74e1a`; Phase 1 team-games `2939a98474c01cb6392eda1b122b61cbe604b7dd5db8a94c08584a4e62659cd5`; canonical teams `33946aeedf488000813397f2a5942ba7cb8a6d901feeda07c056db320bc03a73`.

No production NFL model, projection, grading, UI, prediction archive, outcome resolver, or market integration is read as a model input or modified by this study.
