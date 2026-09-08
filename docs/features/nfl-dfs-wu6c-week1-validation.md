# WU6C Week 1 Validation

Audit as-of: 2026-09-07T23:55:00Z. Input: C:/Users/jbloo/Downloads/DKSalaries (7).csv.
CSV SHA-256: 839840f96f951fa5117c4b38834989ba8a86f9951982277ad9567189132d76d7.
Rows: 813; all baseline fields and rows preserved: true.

## Resolved Offense

| Position | Resolved | Eligible | Ineligible | Unknown | Points floor | Usage / role rule |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| QB | 73 | 32 | 39 | 2 | 8 | Unique current sourced starter |
| RB | 114 | 58 | 50 | 6 | 3 | 4 carries OR 2 targets OR sourced depth <= 2 |
| WR | 180 | 83 | 79 | 18 | 3 | 2 targets OR sourced depth <= 1 |
| TE | 106 | 52 | 49 | 5 | 2 | 1.5 targets OR sourced depth <= 2 |

## Projection Distribution

Linear interpolated quantiles; uploaded resolved players only.

| Position | Min | P10 | P25 | Median | P75 | P90 | Max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| QB | 2.01 | 7.65 | 9.47 | 13.47 | 17.76 | 20.07 | 22.78 |
| RB | -0.96 | 0.86 | 1.79 | 5.01 | 11.74 | 16.40 | 23.71 |
| WR | -1.08 | 0.81 | 1.97 | 4.30 | 10.10 | 14.22 | 22.86 |
| TE | -0.33 | 0.39 | 1.19 | 2.31 | 7.13 | 10.44 | 17.89 |

## Near-Cutoff Examples

Nearest points floors; values are raw JKB points and usable weekly opportunity.

| Position | Player | Points | Carries | Targets | Role | Eligibility |
| --- | --- | ---: | ---: | ---: | --- | --- |
| QB | Drew Lock | 7.98 | N/A | N/A | backup | ineligible |
| QB | Spencer Rattler | 8.08 | 1.80 | N/A | backup | ineligible |
| QB | Kenny Pickett | 7.77 | N/A | N/A | backup | ineligible |
| QB | Tommy DeVito | 7.62 | N/A | N/A | backup | ineligible |
| RB | Sione Vaki | 2.93 | 0.00 | N/A | committee | ineligible |
| RB | DJ Giddens | 3.08 | 1.75 | N/A | secondary | unknown |
| RB | Kaytron Allen | 2.89 | N/A | N/A | secondary | ineligible |
| RB | Hunter Luepke | 2.85 | N/A | N/A | unknown | ineligible |
| WR | Colbie Young | 3.03 | N/A | N/A | backup | unknown |
| WR | Troy Franklin | 3.12 | N/A | 4.19 | backup | eligible |
| WR | KeAndre Lambert-Smith | 2.87 | N/A | N/A | backup | ineligible |
| WR | Kevin Coleman Jr. | 2.81 | N/A | N/A | backup | ineligible |
| TE | Daniel Bellinger | 2.01 | N/A | 1.43 | committee | eligible |
| TE | Tanner Hudson | 1.96 | N/A | N/A | unknown | ineligible |
| TE | Brevyn Spann-Ford | 2.06 | N/A | 1.60 | committee | eligible |
| TE | Max Klare | 2.08 | N/A | N/A | backup | unknown |

## Backup QB Regression

| Player | JKB Points | Depth | Starter Evidence | Eligibility | Reasons |
| --- | ---: | ---: | --- | --- | --- |
| Stetson Bennett IV | 16.51 | 2 | backup | ineligible | STALE_AVAILABILITY_DATA, QB_BACKUP_CONFIRMED |
| Sam Howell | 15.07 | 2 | backup | ineligible | STALE_AVAILABILITY_DATA, QB_BACKUP_CONFIRMED |
| Carson Wentz | 14.29 | 3 | backup | ineligible | STALE_AVAILABILITY_DATA, QB_BACKUP_CONFIRMED |
| Joe Flacco | 13.85 | 2 | backup | ineligible | STALE_AVAILABILITY_DATA, QB_BACKUP_CONFIRMED |

## Uploaded DST Rankings

Composite, not projected fantasy points. No predictive calibration claimed.

| DST | Opponent | Score | Percentile | Rank | Coverage | Opp points | OFF | Trench edge | DK Avg PPG |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| JAX | cle | 92.34 | 100.00 | 1 | 80.00% | 16.00 | 1.00 | 6.00 | 8.20 |
| TEN | nyj | 90.52 | 96.77 | 2 | 80.00% | 19.00 | 16.44 | 11.00 | 4.80 |
| LV | mia | 86.49 | 93.55 | 3 | 80.00% | 18.50 | 39.45 | 7.00 | 4.40 |
| PIT | atl | 81.25 | 90.32 | 4 | 80.00% | 19.50 | 44.24 | 10.00 | 7.80 |
| LAC | ari | 77.82 | 87.10 | 5 | 80.00% | 18.75 | 45.99 | 5.00 | 6.70 |
| DET | no | 70.26 | 83.87 | 6 | 80.00% | 21.75 | 24.21 | 3.00 | 5.70 |
| MIA | lv | 67.14 | 80.65 | 7 | 80.00% | 22.00 | 5.94 | -1.00 | 5.60 |
| GB | min | 64.21 | 77.42 | 8 | 80.00% | 24.00 | 21.74 | 13.00 | 4.60 |
| NYJ | ten | 63.41 | 74.19 | 9 | 80.00% | 20.50 | 24.22 | -9.00 | 2.80 |
| KC | den | 60.08 | 70.97 | 10 | 80.00% | 20.25 | 51.75 | -2.00 | 5.40 |
| PHI | wsh | 59.48 | 67.74 | 11 | 80.00% | 20.00 | 54.47 | -2.00 | 7.80 |
| CHI | car | 57.96 | 64.52 | 12 | 80.00% | 21.75 | 41.05 | -8.00 | 6.40 |
| BUF | hou | 53.33 | 61.29 | 13 | 80.00% | 23.00 | 48.49 | 3.00 | 6.10 |
| SEA | ne | 52.52 | 58.06 | 14 | 80.00% | 20.50 | 75.51 | 6.00 | 11.30 |
| ARI | lac | 48.89 | 54.84 | 15 | 80.00% | 28.75 | 43.01 | 19.00 | 4.30 |
| DAL | nyg | 47.78 | 51.61 | 16 | 80.00% | 22.75 | 54.81 | 2.00 | 3.60 |
| TB | cin | 43.15 | 48.39 | 17 | 80.00% | 27.00 | 52.02 | 17.00 | 5.80 |
| MIN | gb | 43.04 | 45.16 | 18 | 80.00% | 22.50 | 72.77 | 5.00 | 8.00 |
| CLE | jax | 40.63 | 41.94 | 19 | 80.00% | 24.50 | 56.37 | 7.00 | 7.80 |
| BAL | ind | 40.52 | 38.71 | 20 | 80.00% | 22.25 | 72.39 | -1.00 | 5.70 |
| WAS | phi | 39.82 | 35.48 | 21 | 80.00% | 24.50 | 49.28 | -1.00 | 4.50 |
| LAR | sf | 38.81 | 32.26 | 22 | 80.00% | 22.50 | 74.10 | 2.00 | 7.60 |
| ATL | pit | 38.61 | 29.03 | 23 | 80.00% | 23.00 | 54.81 | -3.00 | 7.10 |
| CIN | tb | 36.49 | 25.81 | 24 | 80.00% | 23.50 | 50.83 | -17.00 | 4.60 |
| DEN | kc | 36.09 | 22.58 | 25 | 80.00% | 23.25 | 58.63 | -1.00 | 8.60 |
| NYG | dal | 35.08 | 19.35 | 26 | 80.00% | 25.75 | 67.86 | 14.00 | 4.50 |
| HOU | buf | 34.88 | 16.13 | 27 | 80.00% | 21.50 | 79.79 | -17.00 | 10.60 |
| NE | sea | 31.15 | 12.90 | 28 | 80.00% | 24.00 | 55.51 | -7.00 | 8.40 |
| NO | det | 28.93 | 9.68 | 29 | 80.00% | 28.75 | 61.94 | 9.00 | 6.90 |
| IND | bal | 18.35 | 6.45 | 30 | 80.00% | 25.25 | 57.12 | -23.00 | 5.80 |
| CAR | chi | 16.73 | 3.23 | 31 | 80.00% | 24.75 | 62.14 | -23.00 | 5.90 |
| SF | lar | 4.23 | 0.00 | 32 | 80.00% | 26.00 | 84.86 | -24.00 | 4.10 |

Top five: JAX, TEN, LV, PIT, LAC. Bottom five: NE, NO, IND, CAR, SF.

## Limitations

- 2025 Week 12 injury feed is disregarded. Weekly roster capture is date-only; depth snapshot is September 6 11:29:30 UTC; yardage generated September 6 16:21:14 UTC.
- WR depth is a formation-slot ordinal. Only depth 1 supplies the WR role-only allowance; other WRs need numeric targets.
- Rushing is published per-player carries, not a finite pool. Receiving uses production targets; missing/equal-split allocation is not zero.
- OFF is canonical preseason context. Trenches use ESPN 2025 full season. Market freshness has an upstream commit timestamp, not individual line observation times.
- No canonical DST fantasy PPG history or point-in-time historical feature reconstruction supports calibration. The historical PPG factor is unavailable; scores use 80% weight coverage.
- Unknown availability alone is disclosed but does not exclude otherwise qualifying players. Clear backup evidence overrides positive QB baseline projections.
- All projections, rank populations, Rank Diff, Pts/$1K and 813 uploaded rows are preserved; DK Avg PPG is a benchmark, not consensus.
