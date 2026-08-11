import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  CFB_PROVENANCE,
  getAllTeams,
  isPreseasonPhase,
} from "@/data/cfb";
import { getTop25 } from "@/lib/cfb/rankings";
import { CFB_RANKINGS_PATH } from "@/lib/cfb/routes";
import CollegeFootballPageHeader from "@/components/cfb/CollegeFootballPageHeader";
import CollegeFootballViewToggle, {
  type CfbLandingView,
} from "@/components/cfb/CollegeFootballViewToggle";
import CollegeFootballRankingsTable from "@/components/cfb/CollegeFootballRankingsTable";
import ConferenceStandingsGrid from "@/components/cfb/ConferenceStandingsGrid";
import CollegeFootballDataNotice from "@/components/cfb/CollegeFootballDataNotice";
import CollegeFootballRatingLegend from "@/components/cfb/CollegeFootballRatingLegend";

export default function CollegeFootballLanding() {
  const [view, setView] = useState<CfbLandingView>("top25");
  const teams = useMemo(() => getAllTeams(), []);
  const top25 = useMemo(() => getTop25(teams), [teams]);
  const preseason = isPreseasonPhase();

  usePageSeo({
    title: "College Football Rankings & Conference Standings | Joe Knows Ball",
    description:
      "JoeKnowsBall Top 25 power rankings and conference standings for College Football — ratings, SOS, and FBS architecture.",
    path: "/college-football",
    noindex: false,
  });

  return (
    <>
      <CollegeFootballPageHeader
        eyebrow="College Football"
        title={
          preseason
            ? `${CFB_PROVENANCE.label} Dashboard`
            : "College Football Dashboard"
        }
        description="JKB Preseason Power, conference standings, and strength of schedule. SOS Played populates after games are completed."
        actions={<CollegeFootballViewToggle value={view} onChange={setView} />}
      />

      <CollegeFootballDataNotice kind="ratings" />

      {view === "top25" && (
        <section className="space-y-3" aria-labelledby="jkb-top-25-heading">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="jkb-top-25-heading" className="text-lg font-bold text-slate-900">
                JoeKnowsBall Top 25
              </h2>
              <p className="text-[13px] text-slate-600">
                JoeKnowsBall power rankings · {preseason ? CFB_PROVENANCE.label : "Current season"}
              </p>
            </div>
          </div>

          <CollegeFootballRatingLegend />

          <CollegeFootballRankingsTable
            teams={top25}
            showConferenceColumn={false}
            emptyMessage="Top 25 rankings are not available yet."
          />

          <div className="flex justify-end">
            <Link
              to={CFB_RANKINGS_PATH}
              className="text-sm font-semibold text-sky-800 hover:underline"
            >
              View All FBS Rankings →
            </Link>
          </div>
        </section>
      )}

      {view === "conferences" && (
        <section className="space-y-3" aria-labelledby="cfb-conferences-heading">
          <div>
            <h2 id="cfb-conferences-heading" className="text-lg font-bold text-slate-900">
              Conference Standings
            </h2>
            <p className="text-[13px] text-slate-600">
              {preseason
                ? "Preseason: teams sorted by JKB Power Rating within each conference."
                : "Sorted by conference record, with JKB Power as analytical context."}
            </p>
          </div>
          <ConferenceStandingsGrid teams={teams} />
          <p className="text-[11px] leading-5 text-slate-500">
            Standings prioritize conference record once games are played. Official championship
            tiebreakers are not applied in Phase 1. SOS = strength of schedule played; Rem = remaining.
          </p>
        </section>
      )}
    </>
  );
}
