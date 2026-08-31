import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
import { MATCHUP_TABS, type MatchupTabId } from "@/components/nfl/matchups/matchupNavigation";
import type { NflMatchup } from "@/lib/nfl/matchups";

/** Compact phone-only side reminder beneath the primary site and matchup tabs. */
export default function MatchupMobileStickyHeader({
  matchup,
  activeTab,
}: {
  matchup: NflMatchup;
  activeTab: MatchupTabId;
}) {
  const context = MATCHUP_TABS.find((tab) => tab.id === activeTab)?.label ?? "Matchup";

  return (
    <div className="matchup-mobile-context sm:hidden" aria-label="Matchup team orientation">
      <div className="matchup-mobile-context__team matchup-mobile-context__team--away">
        <NflTeamCrest team={matchup.away} side="away" size={22} />
        <strong>{matchup.away.abbr.toUpperCase()}</strong>
        <span>AWAY</span>
      </div>
      <span className="matchup-mobile-context__label">{context}</span>
      <div className="matchup-mobile-context__team matchup-mobile-context__team--home">
        <NflTeamCrest team={matchup.home} side="home" size={22} />
        <strong>{matchup.home.abbr.toUpperCase()}</strong>
        <span>HOME</span>
      </div>
    </div>
  );
}
