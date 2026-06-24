# VSiN NFL Dataset Validation

Validated against the uploaded `2026 VSiN NFL Betting Guide` team-stat pages.

## Coverage

- 32 of 32 NFL teams present
- 96 of 96 futures odds matched
- 480 of 480 offensive rows matched
- 384 of 384 defensive rows matched
- 1,728 of 1,728 statistic values and ranks matched
- 0 ranks outside the 1–32 range
- 0 duplicate or missing team abbreviations
- 0 source-page mismatches

## Data shape

Each team record contains:

- the PDF team-stat page number
- Super Bowl odds
- conference odds
- division odds
- 15 offensive statistics with ranks
- 12 defensive statistics with ranks

## Extraction note

The PDF text layer does not preserve visual row order reliably on every page. Fourteen rows place the value and rank before the label in plain-text extraction. The stored dataset was checked against the visual table coordinates and is correct. Future extraction from this guide should use table coordinates or visual layout rather than line order alone.

## Source-label normalization

- `sourcePage` identifies the second team-preview page containing odds and statistics.
- `Turnovers per game` is a normalized display label for the PDF's `TURNOVERS` row.
- Defensive labels add `allowed` for clarity while preserving the PDF values and ranks.
- Odds strings retain the guide's original formats, including `10-1`, `+500`, and `-125`.
