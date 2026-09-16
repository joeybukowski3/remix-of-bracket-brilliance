/**
 * WU7.9 -- presentation-formatting helpers shared between the compact AI
 * Handicap Comparison cards and the full long-form article view
 * (MatchupAiPicksPanel.tsx / AiHandicapArticle.tsx). Pure formatting only --
 * no data fetching, no business logic.
 */

export const NA = "N/A";

export function formatTimestamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  });
}

export function formatSpreadLine(team: string | null, line: number | null): string {
  if (team == null || line == null) return NA;
  const signed = line > 0 ? `+${line}` : `${line}`;
  return `${team.toUpperCase()} ${signed}`;
}

export function formatTotalLine(lean: "over" | "under" | "pass" | "undecided", line: number | null): string {
  if (lean !== "over" && lean !== "under") return NA;
  if (line == null) return NA;
  return `${lean === "over" ? "Over" : "Under"} ${line}`;
}

export function confidenceLabel(confidence: number | null): string {
  return confidence == null ? "—" : `${confidence}/10`;
}

export function isPlayLean(lean: string): boolean {
  return lean === "home" || lean === "away" || lean === "over" || lean === "under";
}

export function formatFairSpread(fairSpread: { team: string; line: number } | null): string {
  if (!fairSpread) return NA;
  const signed = fairSpread.line > 0 ? `+${fairSpread.line}` : `${fairSpread.line}`;
  return `${fairSpread.team.toUpperCase()} ${signed}`;
}

/** The FROZEN baseline spread (the sportsbook line in effect when this handicapper's opinion was formed, never today's live line), shown for the SAME team as the handicapper's fair line -- home line negated when the fair-line team is the away team. */
export function formatBaselineSpreadForTeam(fairSpread: { team: string; line: number } | null, homeTeam: string, market: { homeLine: number | null; awayLine: number | null }): string {
  if (!fairSpread) return NA;
  const line = fairSpread.team === homeTeam ? market.homeLine : market.awayLine;
  if (line == null) return NA;
  const signed = line > 0 ? `+${line}` : `${line}`;
  return `${fairSpread.team.toUpperCase()} ${signed}`;
}

/** The FROZEN baseline total (never today's live total). */
export function formatBaselineTotal(total: number | null): string {
  return total == null ? NA : `${total}`;
}

/** "5.0 pts IND" style label. `sidePoints` is home-oriented (positive = value on home); this resolves it to the actual favored-toward team using the fair-spread pairing, so the label always names a real team, never a raw sign. */
export function formatSideEdge(sidePoints: number | null, homeTeam: string, awayTeam: string | null): string {
  if (sidePoints == null) return NA;
  if (sidePoints === 0) return "No edge";
  const team = sidePoints > 0 ? homeTeam : awayTeam;
  if (!team) return NA;
  return `${Math.abs(sidePoints).toFixed(1)} pts ${team.toUpperCase()}`;
}

/** "1.5 pts Over"/"1.5 pts Under" style label, mirroring formatSideEdge for the total. `totalPoints` is over-oriented (positive = value on the over). */
export function formatTotalEdge(totalPoints: number | null): string {
  if (totalPoints == null) return NA;
  if (totalPoints === 0) return "No edge";
  const direction = totalPoints > 0 ? "Over" : "Under";
  return `${Math.abs(totalPoints).toFixed(1)} pts ${direction}`;
}
