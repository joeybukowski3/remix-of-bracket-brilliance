import { GuideSectionHeading, SourceTag, TeamLogo, type GuideSourceKind } from "@/components/nfl/guide/GuideAtoms";
import {
  NFL_GUIDE_EASIEST_SCHEDULES,
  NFL_GUIDE_HARDEST_SCHEDULES,
  NFL_GUIDE_MARKET_DISAGREEMENTS,
  NFL_GUIDE_TOP_DEFENSES,
  NFL_GUIDE_TOP_OFFENSES,
  NFL_GUIDE_TOP_OVERALL,
  type NflGuideLeader,
} from "@/lib/nfl/guideOverview";

function LeaderList({
  title,
  note,
  kind,
  leaders,
}: {
  title: string;
  note: string;
  kind: GuideSourceKind;
  leaders: NflGuideLeader[];
}) {
  if (leaders.length === 0) return null;
  return (
    // min-w-0: grid children default to min-width:auto, which would let inner
    // content push the grid past the viewport.
    <div className="min-w-0 break-inside-avoid border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">{title}</h3>
        <SourceTag kind={kind} />
      </div>
      <p className="mt-0.5 text-[10px] text-slate-500">{note}</p>
      <ol className="mt-2.5 space-y-1.5">
        {leaders.map((leader, index) => (
          <li key={leader.team.abbr} className="flex items-center gap-2">
            <span className="w-3 text-[10px] font-bold tabular-nums text-slate-400">{index + 1}</span>
            <TeamLogo team={leader.team} size={20} />
            <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-800">
              {leader.team.name}
            </span>
            <span className="text-xs font-black tabular-nums text-slate-900">{leader.value}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function MarketDisagreements() {
  const rows = NFL_GUIDE_MARKET_DISAGREEMENTS.slice(0, 6);
  if (rows.length === 0) return null;

  return (
    <div className="min-w-0 break-inside-avoid border border-slate-200 bg-white p-3 sm:col-span-2">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
          Largest model vs market disagreements
        </h3>
        <div className="flex gap-1">
          <SourceTag kind="model" />
          <SourceTag kind="market" />
        </div>
      </div>
      <p className="mt-0.5 text-[10px] text-slate-500">
        Model rank compared with rank by market win total. The model publishes a rating, not a projected win
        total, so the two are compared by rank.
      </p>
      <div className="mt-2.5 overflow-x-auto">
        <table className="w-full min-w-[380px] text-xs">
          <thead>
            <tr className="border-b border-slate-300 text-[9px] uppercase tracking-wider text-slate-500">
              <th className="py-1 text-left font-bold">Team</th>
              <th className="py-1 text-right font-bold">Model</th>
              <th className="py-1 text-right font-bold">Market</th>
              <th className="py-1 text-right font-bold">Gap</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ team, modelRank, marketRank, rankGap }) => (
              <tr key={team.abbr} className="border-b border-slate-100 last:border-0">
                <td className="py-1.5">
                  <div className="flex items-center gap-2">
                    <TeamLogo team={team} size={18} />
                    <span className="truncate font-bold text-slate-800">{team.name}</span>
                  </div>
                </td>
                <td className="py-1.5 text-right tabular-nums text-slate-700">#{modelRank}</td>
                <td className="py-1.5 text-right tabular-nums text-slate-700">#{marketRank}</td>
                <td
                  className={`py-1.5 text-right font-black tabular-nums ${
                    rankGap > 0 ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {rankGap > 0 ? `+${rankGap}` : rankGap}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] leading-4 text-slate-500">
        A positive gap means the model rates the team higher than its market win total implies.
      </p>
    </div>
  );
}

export function GuideLeagueOverview() {
  return (
    <section className="break-inside-avoid space-y-4">
      <GuideSectionHeading
        id="league-overview"
        eyebrow="League overview"
        title="Where the league stands"
        description="Model leaders, schedule extremes, and the widest gaps between the model and the market."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <LeaderList
          title="Top overall"
          note="Public rating, 1-99 scale"
          kind="model"
          leaders={NFL_GUIDE_TOP_OVERALL}
        />
        <LeaderList
          title="Strongest offenses"
          note="Offense subrating"
          kind="model"
          leaders={NFL_GUIDE_TOP_OFFENSES}
        />
        <LeaderList
          title="Strongest defenses"
          note="Defense subrating"
          kind="model"
          leaders={NFL_GUIDE_TOP_DEFENSES}
        />
        <LeaderList
          title="Hardest schedules"
          note="Warren Sharp strength of schedule, #1 hardest"
          kind="schedule"
          leaders={NFL_GUIDE_HARDEST_SCHEDULES}
        />
        <LeaderList
          title="Easiest schedules"
          note="Warren Sharp strength of schedule, #32 easiest"
          kind="schedule"
          leaders={NFL_GUIDE_EASIEST_SCHEDULES}
        />
        <MarketDisagreements />
      </div>
    </section>
  );
}
