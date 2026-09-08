import { useState } from "react";
import MatchupMarketContext from "@/components/nfl/matchups/MatchupMarketContext";
import MatchupMarketProfile, { type MarketProfileState } from "@/components/nfl/matchups/MatchupMarketProfile";
import MatchupTabStrip, { type MatchupTabDef } from "@/components/nfl/matchups/MatchupTabStrip";
import { MATCHUP_SECTION_SCROLL_MT } from "@/lib/nfl/matchupSections";
import type { NflMatchup } from "@/lib/nfl/matchups";
import type { GameProjection } from "@/lib/nfl/projectionData";

type BookSaysTabId = "profile" | "context";

const BOOK_SAYS_TABS: readonly MatchupTabDef[] = [
  { id: "profile", label: "Market Profile", triggerId: "book-says-profile-tab" },
  { id: "context", label: "Betting Market Context", triggerId: "book-says-context-tab" },
];

/**
 * What the Book Says: the two existing, previously-standalone market sections
 * — the nflverse-derived Market Profile and the Odds-API Betting Market
 * Context — as one tabbed container instead of two stacked cards.
 *
 * Both children keep their own existing data plumbing and card chrome
 * verbatim (each already carries its own heading), so this wrapper is
 * deliberately unheaded — a second "What the Book Says" title above two
 * already-labelled cards would just repeat itself. The tab labels alone
 * carry the distinction.
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
        id="book-says-profile-panel"
        role="tabpanel"
        aria-labelledby="book-says-profile-tab"
        hidden={activeTab !== "profile"}
      >
        <MatchupMarketProfile matchup={matchup} market={market} />
      </div>

      <div
        id="book-says-context-panel"
        role="tabpanel"
        aria-labelledby="book-says-context-tab"
        hidden={activeTab !== "context"}
      >
        <MatchupMarketContext matchup={matchup} projection={projection} />
      </div>
    </div>
  );
}
