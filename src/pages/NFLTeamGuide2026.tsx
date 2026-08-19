import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import NflTeamDashboardExtras from "@/components/nfl/NflTeamDashboardExtras";
import NflCoachOfYearCase from "@/components/nfl/NflCoachOfYearCase";
import NflTeamModelTrendPanel from "@/components/nfl/team-dashboard/NflTeamModelTrendPanel";
import type { ScheduleOpponentOvr } from "@/components/nfl/team-dashboard/NflScheduleGameCard";
import {
  NflTeamHeaderOdds,
  NflTeamStatsSidebar,
} from "@/components/nfl/NflTeamVsinPanels";
import NflSection from "@/components/nfl/ui/NflSection";
import NflMetricStrip from "@/components/nfl/ui/NflMetricStrip";
import { NFL_TABLE_HEAD_ROW, NFL_TABLE_ROW, NflTableScroller } from "@/components/nfl/ui/NflTable";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useNflCurrentRating2026 } from "@/hooks/useNflCurrentRating2026";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import {
  formatSigned,
  getNflSeasonGuide,
  getScheduleDescription,
  type NflGuideTeamNormalized,
} from "@/lib/nfl/guideData";

const GUIDE = getNflSeasonGuide(2026)!;

export default function NFLTeamGuide2026() {
  const { teamSlug = "" } = useParams();
  const team = GUIDE.teamBySlug.get(teamSlug);
  // Universal current 2026 OVR/rank -- the only source for any opponent
  // "power" figure shown on this page (schedule cards). Never the guide's
  // frozen 2025-preseason powerRank/overallPct.
  const currentRating = useNflCurrentRating2026();
  const ovrByAbbr = useMemo(() => {
    const map = new Map<string, ScheduleOpponentOvr>();
    for (const row of currentRating.data?.teams ?? []) map.set(row.abbr, { rating: row.rating, rank: row.rank });
    return map;
  }, [currentRating.data]);

  usePageSeo({
    title: team ? `${team.teamName} 2026 Schedule, Stats, Odds & Roster Changes | Joe Knows Ball` : "2026 NFL Team Dashboard | Joe Knows Ball",
    description: team ? `${team.teamName} 2026 schedule, power rating, 2025 statistics, futures odds, value, coaching changes and notable player movement.` : "2026 NFL team schedule, ratings, odds and roster changes.",
    path: `/nfl/guide/team/${teamSlug}`,
    noindex: !team,
  });

  if (!team) return <Navigate to="/nfl/guide" replace />;
  const divisionTeams = GUIDE.divisions.find((entry) => entry.division === team.division)?.teams ?? [];

  return (
    <>
      {/*
        Team identity block. It keeps a dark surface because that is what makes a
        team page feel like a team page — but the old version bled a 125deg
        gradient from #020617 all the way into the team colour across the whole
        banner, which read as decoration rather than identity. The colour is now
        a deliberate accent: a rule on the leading edge plus a soft wash behind
        the logo.
      */}
      <section
        id="top"
        className="relative overflow-hidden rounded-lg border-l-4 bg-slate-950 text-white"
        style={{ borderLeftColor: team.color }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-1/2 opacity-25"
          style={{ background: `radial-gradient(circle at left center, ${team.color} 0%, transparent 70%)` }}
        />
        <div className="relative px-3 py-4 sm:px-5 sm:py-5">
          <Link
            to="/nfl/guide"
            className="text-[11px] font-semibold text-sky-300 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            ← Back to 2026 guide
          </Link>

          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <img
                src={nflLogoUrl(team.abbr)}
                alt={`${team.teamName} logo`}
                className="h-14 w-14 shrink-0 object-contain sm:h-16 sm:w-16"
              />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-300">
                  {team.division} · 2026 Team Dashboard
                </div>
                <h1 className="mt-0.5 text-2xl font-bold tracking-tight sm:text-3xl">{team.teamName}</h1>
                <p className="mt-1 max-w-2xl text-[13px] leading-5 text-slate-300">{team.headline}</p>
              </div>
            </div>

            <NflTeamHeaderOdds team={team} />
          </div>
        </div>
      </section>

      {/*
        The headline figures. Previously eight individually bordered, shadowed
        cards in a four-across grid at 390px, which forced 7px labels. One strip,
        two columns on mobile, readable labels.
      */}
      <NflMetricStrip
        ariaLabel="Guide outlook metrics"
        columns={8}
        metrics={[
          { label: "2025 record", value: team.record2025 },
          { label: "Guide wins", value: team.projectedWins.toFixed(1), tone: "model", primary: true },
          { label: "Win total", value: team.marketWinTotal?.toFixed(1) ?? "—" },
          {
            label: "Guide edge",
            value: team.modelVsMarketGap == null ? "—" : formatSigned(team.modelVsMarketGap),
            tone: team.modelVsMarketGap == null ? "neutral" : team.modelVsMarketGap > 0 ? "good" : team.modelVsMarketGap < 0 ? "bad" : "neutral",
          },
          { label: "Guide rank", value: `#${team.powerRank}` },
          { label: "Offense", value: `#${team.offenseRank}`, tone: team.offenseRank <= 10 ? "good" : team.offenseRank >= 24 ? "bad" : "neutral" },
          { label: "Defense", value: `#${team.defenseRank}`, tone: team.defenseRank <= 10 ? "good" : team.defenseRank >= 24 ? "bad" : "neutral" },
          { label: "Schedule", value: team.scheduleRank == null ? "—" : `#${team.scheduleRank}` },
        ]}
      />

      <NflTeamModelTrendPanel teamSlug={team.slug} teamAbbr={team.abbr} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        <div className="min-w-0 space-y-5">
          <NflTeamDashboardExtras team={team} ovrByAbbr={ovrByAbbr} />
          <NflCoachOfYearCase team={team} />

          <NflSection
            eyebrow="Team outlook"
            title="Model analysis"
            subtitle="The model overview and key questions sit below the schedule so the week-by-week matchup view stays the primary team-page content."
            collapse="mobile"
            bodyClassName="space-y-4"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge label={team.regressionSignal} tone={team.regressionSignal === "Bounce Back" ? "green" : team.regressionSignal === "Regression" ? "red" : "gray"} />
              <Badge label={`${team.recommendationLabel} lean`} tone={team.recommendationLabel === "Over" ? "green" : team.recommendationLabel === "Under" ? "red" : "gray"} />
              <Badge label={`${team.confidenceLabel} confidence`} tone="blue" />
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Model overview</h3>
                  <p className="mt-1.5 text-[13px] leading-6 text-slate-600">{team.editorialSummary}</p>
                  <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Projection formula</div>
                    <p className="mt-1 text-xs leading-5 text-slate-600">8.5 league-average wins + composite strength adjustment + schedule adjustment. Schedule rank uses #1 as hardest and #32 as easiest. The model is a baseline for comparison, not a replacement for injury, quarterback or price analysis.</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Three burning questions</h3>
                  <div className="mt-2 divide-y divide-slate-100">
                    {team.keyQuestions.map((question, index) => (
                      <div key={question.title} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-semibold text-white">{index + 1}</span>
                        <div>
                          <h4 className="text-[13px] font-semibold text-slate-900">{question.title}</h4>
                          <p className="mt-1 text-[13px] leading-6 text-slate-600">{question.answer}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <ListCard title="Why the case can work" items={team.strengths} tone="green" />
                <ListCard title="What can break the case" items={team.concerns} tone="red" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Schedule context</h3>
                  <p className="mt-1 text-[13px] leading-6 text-slate-600">{getScheduleDescription(team.scheduleRank)}</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-sky-600" style={{ width: `${team.scheduleRank == null ? 50 : (team.scheduleRank / 32) * 100}%` }} />
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-slate-500"><span>Hardest</span><span>Easiest</span></div>
                </div>
              </div>
            </div>
          </NflSection>

          <NflSection
            title={`${team.division} model board`}
            subtitle="Compare the team directly with its three division rivals."
            collapse="mobile"
            bodyClassName="!px-0"
          >
            <NflTableScroller label={`${team.division} model comparison`}>
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className={NFL_TABLE_HEAD_ROW}>
                    <th scope="col" className="sticky left-0 z-10 bg-slate-100 px-3 py-2 text-left">Team</th>
                    <th scope="col" className="px-2 py-2">Model W</th>
                    <th scope="col" className="px-2 py-2">Market</th>
                    <th scope="col" className="px-2 py-2">Edge</th>
                    <th scope="col" className="px-2 py-2">Pwr</th>
                    <th scope="col" className="px-2 py-2">Off</th>
                    <th scope="col" className="px-2 py-2">Def</th>
                    <th scope="col" className="px-2 py-2">Sch</th>
                  </tr>
                </thead>
                <tbody>{divisionTeams.map((rival) => <DivisionRow key={rival.abbr} team={rival} active={rival.abbr === team.abbr} />)}</tbody>
              </table>
            </NflTableScroller>
          </NflSection>

          <p className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[13px] leading-6 text-slate-600">
            <span className="font-semibold text-slate-900">Preseason status. </span>
            Ratings use the site's 2025 performance model and June preseason totals as the baseline. The VSiN statistics and listed futures odds are displayed as source material and do not overwrite the Joe Knows Ball model.
          </p>
        </div>

        <NflTeamStatsSidebar team={team} />
      </div>
    </>
  );
}

function Badge({ label, tone }: { label: string; tone: "green" | "red" | "blue" | "gray" }) {
  // Each badge states its own word, so colour reinforces rather than encodes.
  const cls = tone === "green"
    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
    : tone === "red"
      ? "border-red-300 bg-red-50 text-red-800"
      : tone === "blue"
        ? "border-sky-300 bg-sky-50 text-sky-800"
        : "border-slate-300 bg-slate-50 text-slate-600";
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>{label}</span>;
}

function ListCard({ title, items, tone }: { title: string; items: string[]; tone: "green" | "red" }) {
  return (
    <div>
      <h3 className={`text-sm font-semibold ${tone === "green" ? "text-emerald-800" : "text-red-800"}`}>{title}</h3>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-[13px] leading-6 text-slate-600">
            <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${tone === "green" ? "bg-emerald-500" : "bg-red-500"}`} aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DivisionRow({ team, active }: { team: NflGuideTeamNormalized; active: boolean }) {
  const surface = active ? "bg-sky-50" : "bg-white";
  return (
    <tr className={`${NFL_TABLE_ROW} ${surface}`}>
      <td className={`sticky left-0 z-10 px-3 py-2 ${surface}`}>
        <Link to={`/nfl/guide/team/${team.slug}`} className="flex items-center gap-2 font-semibold text-slate-900 hover:text-sky-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500">
          <img src={nflLogoUrl(team.abbr)} alt="" className="h-6 w-6 shrink-0 object-contain" />
          <span className="text-xs sm:text-sm">{team.teamName}</span>
          {active && <span className="rounded bg-sky-600 px-1 py-0.5 text-[9px] font-semibold text-white">You</span>}
        </Link>
      </td>
      <td className="px-2 py-2 text-center font-semibold tabular-nums">{team.projectedWins.toFixed(1)}</td>
      <td className="px-2 py-2 text-center tabular-nums text-slate-700">{team.marketWinTotal?.toFixed(1) ?? "—"}</td>
      <td className="px-2 py-2 text-center font-semibold tabular-nums">{team.modelVsMarketGap == null ? "—" : formatSigned(team.modelVsMarketGap)}</td>
      <td className="px-2 py-2 text-center tabular-nums text-slate-700">#{team.powerRank}</td>
      <td className="px-2 py-2 text-center tabular-nums text-slate-700">#{team.offenseRank}</td>
      <td className="px-2 py-2 text-center tabular-nums text-slate-700">#{team.defenseRank}</td>
      <td className="px-2 py-2 text-center tabular-nums text-slate-700">#{team.scheduleRank ?? "—"}</td>
    </tr>
  );
}
