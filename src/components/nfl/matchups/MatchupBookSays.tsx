import { useState } from "react";
import MatchupMarketContext from "@/components/nfl/matchups/MatchupMarketContext";
import MatchupBettingSplits from "@/components/nfl/matchups/MatchupBettingSplits";
import MatchupMarketProfile, { type MarketProfileState } from "@/components/nfl/matchups/MatchupMarketProfile";
import MatchupTabStrip, { type MatchupTabDef } from "@/components/nfl/matchups/MatchupTabStrip";
import { MATCHUP_SECTION_SCROLL_MT } from "@/lib/nfl/matchupSections";
import type { NflMatchup } from "@/lib/nfl/matchups";
import type { GameProjection } from "@/lib/nfl/projectionData";

type BookSaysTabId = "profile" | "context" | "splits";

const BOOK_SAYS_TABS: readonly MatchupTabDef[] = [
  { id: "profile", label: "Market Profile", triggerId: "book-says-profile-tab" },
  { id: "context", label: "Betting Market Context", triggerId: "book-says-context-tab" },
  { id: "splits", label: "Betting Splits", triggerId: "book-says-splits-tab" },
];

/**
 * What the Book Says: three separate market sources in one tabbed container:
 * nflverse Market Profile, Odds API Betting Market Context, and DraftKings
 * Network Betting Splits.
 *
 * Each child owns its data plumbing and card heading. The tab labels carry
 * the source distinction without adding another wrapper heading.
 */
export default function MatchupBookSays({
  matchup,
  market,
  projection,
}: {
  matchup: NflMatchup;
  market?: MarketProfileState;
  projection: GameProjection | null;
}) {
  const [activeTab, setActiveTab] = useState<BookSaysTabId>("profile");

  return (
    <div id="book-says" className={MATCHUP_SECTION_SCROLL_MT}>
      <MatchupTabStrip
        tabs={BOOK_SAYS_TABS}
        activeId={activeTab}
        onSelect={(id) => setActiveTab(id as BookSaysTabId)}
        ariaLabel="What the book says views"
        className="mb-2"
      />

      <div
        id="profile-panel"
        role="tabpanel"
        aria-labelledby="book-says-profile-tab"
        hidden={activeTab !== "profile"}
      >
        <MatchupMarketProfile matchup={matchup} market={market} />
      </div>

      <div
        id="context-panel"
        role="tabpanel"
        aria-labelledby="book-says-context-tab"
        hidden={activeTab !== "context"}
      >
        <MatchupMarketContext matchup={matchup} projection={projection} />
      </div>
      <div id="splits-panel" role="tabpanel" aria-labelledby="book-says-splits-tab" hidden={activeTab !== "splits"}>
        <MatchupBettingSplits matchup={matchup} />
      </div>
    </div>
  );
}
