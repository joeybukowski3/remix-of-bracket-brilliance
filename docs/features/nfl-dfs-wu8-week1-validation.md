# WU8 Week 1 Generated-Lineup Validation

Audit as-of: 2026-09-07T23:55:00Z. Input: C:/Users/jbloo/Downloads/DKSalaries (7).csv.
CSV SHA-256: 839840f96f951fa5117c4b38834989ba8a86f9951982277ad9567189132d76d7.
Uploaded rows: 813; all baseline fields and rows preserved: true.
Salary cap: $50,000 (nfl-classic-rules-v2). Objective: nfl-dfs-lineup-objective-v1.
Status: ready. Deterministic across two runs: true. Total generation time: 105 ms.

## Candidate Pool

Offense eligible 225; ineligible 271; unknown 285.
DST with usable WU6C context 32; without 0.
Scorable candidates by position: QB 32; RB 58; WR 83; TE 52; DST 32.

## Highest Ceiling Lineup

Weights: jkbProjection 40%; matchup 20%; scoringEnvironment 15%; upsideProxy 15%; salaryEfficiency 10%.
Salary used $49,900; remaining $100.
JKB offense projected subtotal 127.62 over 8 offensive slots (DST has no JKB projection).
DK Avg PPG benchmark subtotal 125.90 over 9 slots (DraftKings benchmark, not consensus).
Objective score 788.216. Distinct games 6. FLEX: TE.
Constraints: slotsFilled=9; salaryWithinCap=true; uniqueDkIds=true; uniqueCanonicalIdentities=true; flexPositionLegal=true; distinctGames=6; minimumGamesSatisfied=true; allOffenseOptimizerEligible=true; dstContextUsable=true; allFromUploadedSlate=true.

| Slot | Player | Team | Opp | Salary | JKB Proj | DK Avg PPG | Rank Diff | Role | Matchup pct | Strategy score | Coverage |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| QB | Jalen Hurts | PHI | wsh | 6600 | 22.36 | 19.10 | 1 | primary/sourced | 90.3 | 91.65 | 85% |
| RB1 | Kyren Williams | LAR | sf | 6200 | 16.47 | 16.30 | 4 | primary/sourced | 97.4 | 84.90 | 100% |
| RB2 | Javonte Williams | DAL | nyg | 6300 | 16.24 | 15.70 | 1 | primary/sourced | 91.2 | 81.45 | 100% |
| WR1 | Puka Nacua | LAR | sf | 7700 | 21.09 | 25.10 | 0 | primary/sourced | 98.8 | 95.70 | 100% |
| WR2 | DeVonta Smith | PHI | wsh | 6600 | 16.49 | 12.40 | 5 | primary/sourced | 89.6 | 88.57 | 100% |
| WR3 | Rome Odunze | CHI | car | 5400 | 12.51 | 11.80 | 3 | primary/sourced | 95.1 | 76.03 | 100% |
| TE | Mark Andrews | BAL | ind | 3900 | 11.70 | 7.70 | 10 | primary/sourced | 91.2 | 88.51 | 100% |
| FLEX | Dallas Goedert | PHI | wsh | 4100 | 10.75 | 13.00 | 1 | primary/sourced | 88.2 | 84.63 | 100% |
| DST | Titans | TEN | nyj | 3100 | N/A | 4.80 | N/A | DST rank 2 | N/A | 96.77 | 100% |

Top reasons:
- **JKB projected fantasy points** -- Lineup offense averages the 85th percentile on this component (policy weight 40%), covering 8 of 8 offensive slots
- **Matchup context (EPA / success / trenches)** -- Lineup offense averages the 93th percentile on this component (policy weight 20%), covering 8 of 8 offensive slots
- **Team scoring environment (market implied team total)** -- Lineup offense averages the 85th percentile on this component (policy weight 15%), covering 8 of 8 offensive slots

## Highest Floor Lineup

Weights: jkbProjection 40%; usageRole 30%; workloadEvidence 15%; matchup 10%; salaryEfficiency 5%.
Salary used $50,000; remaining $0.
JKB offense projected subtotal 129.20 over 8 offensive slots (DST has no JKB projection).
DK Avg PPG benchmark subtotal 131.00 over 9 slots (DraftKings benchmark, not consensus).
Objective score 748.773. Distinct games 6. FLEX: TE.
Constraints: slotsFilled=9; salaryWithinCap=true; uniqueDkIds=true; uniqueCanonicalIdentities=true; flexPositionLegal=true; distinctGames=6; minimumGamesSatisfied=true; allOffenseOptimizerEligible=true; dstContextUsable=true; allFromUploadedSlate=true.

| Slot | Player | Team | Opp | Salary | JKB Proj | DK Avg PPG | Rank Diff | Role | Matchup pct | Strategy score | Coverage |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| QB | Jaxson Dart | NYG | dal | 5600 | 20.18 | 17.80 | 9 | primary/sourced | 83.9 | 69.83 | 85% |
| RB1 | Javonte Williams | DAL | nyg | 6300 | 16.24 | 15.70 | 1 | primary/sourced | 91.2 | 79.83 | 100% |
| RB2 | Kyren Williams | LAR | sf | 6200 | 16.47 | 16.30 | 4 | primary/sourced | 97.4 | 79.70 | 100% |
| WR1 | Puka Nacua | LAR | sf | 7700 | 21.09 | 25.10 | 0 | primary/sourced | 98.8 | 96.37 | 100% |
| WR2 | DeVonta Smith | PHI | wsh | 6600 | 16.49 | 12.40 | 5 | primary/sourced | 89.6 | 85.71 | 100% |
| WR3 | Drake London | ATL | pit | 6500 | 16.27 | 18.20 | 4 | primary/sourced | 32.3 | 84.49 | 100% |
| TE | Dallas Goedert | PHI | wsh | 4100 | 10.75 | 13.00 | 1 | primary/sourced | 88.2 | 80.24 | 100% |
| FLEX | Mark Andrews | BAL | ind | 3900 | 11.70 | 7.70 | 10 | primary/sourced | 91.2 | 75.83 | 100% |
| DST | Titans | TEN | nyj | 3100 | N/A | 4.80 | N/A | DST rank 2 | N/A | 96.77 | 100% |

Top reasons:
- **JKB projected fantasy points** -- Lineup offense averages the 87th percentile on this component (policy weight 40%), covering 8 of 8 offensive slots
- **Usage and role** -- Lineup offense averages the 74th percentile on this component (policy weight 30%), covering 8 of 8 offensive slots
- **Prior workload evidence (per game)** -- Lineup offense averages the 77th percentile on this component (policy weight 15%), covering 7 of 8 offensive slots

## Balanced JKB Lineup

Weights: jkbProjection 40%; dkBenchmark 20%; usageRole 15%; matchup 10%; scoringEnvironment 10%; salaryEfficiency 5%.
Salary used $50,000; remaining $0.
JKB offense projected subtotal 128.60 over 8 offensive slots (DST has no JKB projection).
DK Avg PPG benchmark subtotal 128.50 over 9 slots (DraftKings benchmark, not consensus).
Objective score 763.086. Distinct games 6. FLEX: TE.
Constraints: slotsFilled=9; salaryWithinCap=true; uniqueDkIds=true; uniqueCanonicalIdentities=true; flexPositionLegal=true; distinctGames=6; minimumGamesSatisfied=true; allOffenseOptimizerEligible=true; dstContextUsable=true; allFromUploadedSlate=true.

| Slot | Player | Team | Opp | Salary | JKB Proj | DK Avg PPG | Rank Diff | Role | Matchup pct | Strategy score | Coverage |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| QB | Matthew Stafford | LAR | sf | 6200 | 19.64 | 22.10 | -1 | primary/sourced | 100.0 | 78.15 | 100% |
| RB1 | Kyren Williams | LAR | sf | 6200 | 16.47 | 16.30 | 4 | primary/sourced | 97.4 | 83.56 | 100% |
| RB2 | Javonte Williams | DAL | nyg | 6300 | 16.24 | 15.70 | 1 | primary/sourced | 91.2 | 80.84 | 100% |
| WR1 | Puka Nacua | LAR | sf | 7700 | 21.09 | 25.10 | 0 | primary/sourced | 98.8 | 96.62 | 100% |
| WR2 | DeVonta Smith | PHI | wsh | 6600 | 16.49 | 12.40 | 5 | primary/sourced | 89.6 | 85.55 | 100% |
| WR3 | Ladd McConkey | LAC | ari | 5900 | 16.21 | 11.40 | 15 | primary/sourced | 24.4 | 77.16 | 100% |
| TE | Dallas Goedert | PHI | wsh | 4100 | 10.75 | 13.00 | 1 | primary/sourced | 88.2 | 84.30 | 100% |
| FLEX | Mark Andrews | BAL | ind | 3900 | 11.70 | 7.70 | 10 | primary/sourced | 91.2 | 80.13 | 100% |
| DST | Titans | TEN | nyj | 3100 | N/A | 4.80 | N/A | DST rank 2 | N/A | 96.77 | 100% |

Top reasons:
- **JKB projected fantasy points** -- Lineup offense averages the 86th percentile on this component (policy weight 40%), covering 8 of 8 offensive slots
- **DK Avg PPG benchmark** -- Lineup offense averages the 80th percentile on this component (policy weight 20%), covering 8 of 8 offensive slots
- **Usage and role** -- Lineup offense averages the 73th percentile on this component (policy weight 15%), covering 8 of 8 offensive slots

## Lineup Comparison

| Pair | Overlap | Differing players |
| --- | ---: | --- |
| ceiling vs floor | 7/9 | ceiling: Jalen Hurts; ceiling: Rome Odunze; floor: Jaxson Dart; floor: Drake London |
| ceiling vs balanced | 7/9 | ceiling: Jalen Hurts; ceiling: Rome Odunze; balanced: Matthew Stafford; balanced: Ladd McConkey |
| floor vs balanced | 7/9 | floor: Jaxson Dart; floor: Drake London; balanced: Matthew Stafford; balanced: Ladd McConkey |

| Strategy | Avg role ordinal | Avg matchup pct | Avg usage pct | Avg salary efficiency pct | Avg salary |
| --- | ---: | ---: | ---: | ---: | ---: |
| ceiling | 100.0 | 92.7 | N/A | 90.8 | 5544 |
| floor | 100.0 | 84.1 | 74.3 | 93.7 | 5556 |
| balanced | 100.0 | 85.1 | 73.2 | 89.4 | 5556 |

## Automated Nonsense Checks

- Highest Ceiling Lineup: no issues found
- Highest Floor Lineup: no issues found
- Balanced JKB Lineup: no issues found
