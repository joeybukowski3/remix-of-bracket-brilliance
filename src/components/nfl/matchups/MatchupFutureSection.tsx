import MatchupSection from "@/components/nfl/matchups/MatchupSection";
import type { NflMatchupSectionId } from "@/lib/nfl/matchupSections";

/**
 * Structural section that intentionally carries no metrics yet (Game Trends,
 * Model Analysis). The anchor and heading exist now so navigation and page
 * order are final; the body states plainly that nothing is calculated.
 */
export default function MatchupFutureSection({
  id,
  message,
  futureScope,
}: {
  id: NflMatchupSectionId;
  message: string;
  /** Optional list of what a later phase will add here. */
  futureScope?: readonly string[];
}) {
  return (
    <MatchupSection id={id}>
      <p className="text-xs font-semibold text-slate-500">{message}</p>
      {futureScope && futureScope.length > 0 && (
        <div className="mt-2 border-t border-dashed border-slate-200 pt-2">
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
            Planned for a later phase
          </p>
          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {futureScope.map((item) => (
              <li key={item} className="text-[11px] leading-4 text-slate-400">
                • {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </MatchupSection>
  );
}
