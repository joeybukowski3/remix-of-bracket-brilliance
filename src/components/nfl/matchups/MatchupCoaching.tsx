import MatchupSectionCard from "@/components/nfl/matchups/MatchupSectionCard";
import NflCoachingComparison from "@/components/nfl/coaching/NflCoachingComparison";
import { buildMatchupCoachingContext, type CoachingRatingsArtifact } from "@/lib/nfl/coachingRatingsView";
import type { NflMatchup } from "@/lib/nfl/matchups";

/**
 * Coaching Rating v1 for one upcoming matchup, rendered beside the other
 * comparison-tab context sections (trenches, EPA/YPP, market profile).
 *
 * The rating is analysis context only — it is never an input to the JKB spread
 * or total, and this card deliberately states that, exactly as the trenches
 * section does for line-of-scrimmage win rates.
 */
export default function MatchupCoaching({
  matchup,
  artifact,
  loading = false,
}: {
  matchup: NflMatchup;
  /** Null while loading, or when the published artifact is missing/malformed. */
  artifact: CoachingRatingsArtifact | null;
  loading?: boolean;
}) {
  const { home, away } = matchup;
  const coaching = buildMatchupCoachingContext(artifact, home.abbr, away.abbr);

  return (
    <MatchupSectionCard
      id="coaching"
      titleId="matchup-coaching-title"
      eyebrow="Sideline"
      title="Coaching"
      subtitle="JKB Coaching Rating v1. Context only — not an input to the JKB spread or total."
    >
      {loading ? (
        <p className="text-[12px] text-slate-500">Loading coaching context…</p>
      ) : (
        <NflCoachingComparison coaching={coaching} homeTeam={home.abbr} awayTeam={away.abbr} />
      )}
    </MatchupSectionCard>
  );
}
