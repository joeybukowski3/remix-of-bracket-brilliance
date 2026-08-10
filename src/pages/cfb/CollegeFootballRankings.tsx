import { useMemo, useState } from "react";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  CFB_CONFERENCE_ORDER,
  CFB_CONFERENCES,
  CFB_PROVENANCE,
  getAllTeams,
} from "@/data/cfb";
import type { CfbConferenceId } from "@/data/cfb/types";
import {
  filterByConference,
  sortRankings,
  type RankingsSortKey,
} from "@/lib/cfb/rankings";
import CollegeFootballPageHeader from "@/components/cfb/CollegeFootballPageHeader";
import CollegeFootballRankingsTable from "@/components/cfb/CollegeFootballRankingsTable";
import CollegeFootballDataNotice from "@/components/cfb/CollegeFootballDataNotice";
import { cn } from "@/lib/utils";

type ConfFilter = CfbConferenceId | "all";

export default function CollegeFootballRankings() {
  const [conference, setConference] = useState<ConfFilter>("all");
  const [sortKey, setSortKey] = useState<RankingsSortKey>("jkbRank");
  const teams = useMemo(() => getAllTeams(), []);

  const filtered = useMemo(() => {
    const base = filterByConference(teams, conference);
    return sortRankings(base, sortKey);
  }, [teams, conference, sortKey]);

  usePageSeo({
    title: "Full FBS Rankings | College Football | Joe Knows Ball",
    description:
      "Complete FBS power rankings with JKB ratings, offense, defense, and strength of schedule.",
    path: "/college-football/rankings",
  });

  const filters: { id: ConfFilter; label: string }[] = [
    { id: "all", label: "All" },
    ...CFB_CONFERENCE_ORDER.map((id) => ({
      id,
      label: CFB_CONFERENCES[id].shortName,
    })),
  ];

  return (
    <>
      <CollegeFootballPageHeader
        eyebrow="College Football · Rankings"
        title={`${CFB_PROVENANCE.label} FBS Rankings`}
        description="All 138 FBS teams, ordered by JKB Power Rating v1. Click column headers to re-sort."
      />

      <CollegeFootballDataNotice kind="ratings" />

      <div role="group" aria-label="Filter by conference" className="flex flex-wrap gap-1.5">
        {filters.map((f) => {
          const selected = conference === f.id;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setConference(f.id)}
              className={cn(
                "rounded border px-2.5 py-1 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
                selected
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-400",
              )}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-slate-500">
        Showing {filtered.length} team{filtered.length === 1 ? "" : "s"}
        {conference !== "all" ? ` · ${CFB_CONFERENCES[conference].name}` : ""}
      </p>

      <CollegeFootballRankingsTable
        teams={filtered}
        sortKey={sortKey}
        onSort={setSortKey}
        emptyMessage="No teams match this filter."
      />
    </>
  );
}
