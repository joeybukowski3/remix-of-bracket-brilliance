import MatchupSection from "@/components/nfl/matchups/MatchupSection";
import type { NflMatchupSectionId } from "@/lib/nfl/matchupSections";

/**
 * Structural section that intentionally carries no metrics yet (Game Trends).
 *
 * The anchor and heading exist so navigation and page order stay final, but the
 * section is deliberately the smallest on the page: one sentence, no dashed
 * placeholder box, no scope list, and no collapse control — a Hide toggle for a
 * single line of text is noise, and a large empty container would claim
 * attention the section has not earned.
 *
 * It carries no example data, no trend definitions and no "coming soon"
 * treatment. When the data arrives this becomes a real section; until then it
 * says only that.
 *
 * `futureScope` was dropped once Model Analysis became a real section in Phase
 * 9 and stopped sharing this component; Game Trends is now the only caller.
 */
export default function MatchupFutureSection({
  id,
  message,
}: {
  id: NflMatchupSectionId;
  message: string;
}) {
  return (
    <MatchupSection id={id} collapsible={false}>
      <p className="text-[11px] leading-4 text-slate-400">{message}</p>
    </MatchupSection>
  );
}
