import type { CfbTeam } from "@/data/cfb/types";
import { cn } from "@/lib/utils";
import CollegeFootballTeamMatchupStrip from "./CollegeFootballTeamMatchupStrip";

type Props = {
  away: Pick<CfbTeam, "name" | "shortName" | "logo" | "abbreviation" | "primaryColor" | "record">;
  home: Pick<CfbTeam, "name" | "shortName" | "logo" | "abbreviation" | "primaryColor" | "record">;
  visible: boolean;
};

/**
 * Frozen copy of the mobile hero's top matchup strip, shown only while
 * scrolling through Power Comparison / Season Stats / Model panel, so it
 * stays clear which side is away vs. home without re-scrolling to the hero.
 * Desktop keeps the existing non-sticky hero-only behavior (never renders there).
 */
export default function CollegeFootballMobileStickyHeader({ away, home, visible }: Props) {
  return (
    <div
      aria-hidden={!visible}
      className={cn(
        "fixed inset-x-0 top-[72px] z-40 border-b border-slate-200 shadow-sm transition-transform duration-200 ease-out sm:hidden",
        visible ? "translate-y-0" : "-translate-y-full",
      )}
    >
      <CollegeFootballTeamMatchupStrip away={away} home={home} />
    </div>
  );
}
