import type { FantasyAllowedArtifact } from "./types";

/** Matches the longest normal gap between refreshes (Tue -> Fri) plus slack. */
export const STALE_ARTIFACT_HOURS = 96;
const HOUR_MS = 3_600_000;
/** getUTCMonth() values (0 = January) for September-February, matching the workflows' cron months. */
const IN_SEASON_MONTHS: ReadonlySet<number> = new Set([8, 9, 10, 11, 0, 1]);

export type FantasyAllowedFreshnessView = {
  tone: "ok" | "warn";
  headline: string;
  warnings: string[];
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * What the Fantasy Points Allowed page tells the reader about how current the
 * data is. Pure so it is unit-tested; the component only renders it.
 *
 * Two independent signals, so a stalled pipeline cannot look healthy:
 *  - coverage written by the generator (partial = a completed game is missing
 *    from the stats, or results lag the stats);
 *  - the artifact's own age against the clock, which needs no workflow at all.
 */
export function describeFantasyAllowedFreshness(artifact: FantasyAllowedArtifact, now: Date): FantasyAllowedFreshnessView {
  const warnings: string[] = [];
  const parts = [artifact.week == null ? "Opponents shown for the upcoming week" : `Opponents shown for Week ${artifact.week}`];

  const coverage = artifact.coverage;
  if (coverage) {
    if (coverage.dataThroughWeek != null) {
      parts.push(`Ranks include games through Week ${coverage.dataThroughWeek} (${coverage.incorporatedGames} of ${coverage.finalGames})`);
    }
    if (coverage.missingFinalGameIds.length > 0) {
      warnings.push(
        `${plural(coverage.missingFinalGameIds.length, "completed game is", "completed games are")} not yet in the data: the stats source has not published ${coverage.missingFinalGameIds.length === 1 ? "it" : "them"}. Ranks update automatically once available.`,
      );
    }
    if (coverage.notYetFinalGameIds.length > 0) {
      warnings.push(`${plural(coverage.notYetFinalGameIds.length, "game is", "games are")} in the stats but not yet marked final in the schedule.`);
    }
  }

  const generatedMs = Date.parse(artifact.generatedAt);
  if (!Number.isFinite(generatedMs)) {
    warnings.push("The refresh time of this data could not be read, so its freshness cannot be confirmed.");
  } else {
    const ageHours = (now.getTime() - generatedMs) / HOUR_MS;
    // The refresh workflows only run September-February; the data sits unchanged by design the rest of the year.
    if (ageHours > STALE_ARTIFACT_HOURS && IN_SEASON_MONTHS.has(now.getUTCMonth())) {
      const days = Math.floor(ageHours / 24);
      warnings.push(`This data was last refreshed ${plural(days, "day", "days")} ago and may be out of date.`);
    }
  }

  return { tone: warnings.length > 0 ? "warn" : "ok", headline: parts.join(" · "), warnings };
}
