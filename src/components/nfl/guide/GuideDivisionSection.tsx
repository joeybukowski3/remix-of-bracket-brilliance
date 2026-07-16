import { SourceTag, TeamLogo } from "@/components/nfl/guide/GuideAtoms";
import { GuideTeamSection } from "@/components/nfl/guide/GuideTeamSection";
import { formatNflRecord, type NflGuideDivision } from "@/lib/nfl/guideRecord";

/**
 * Compact division comparison. Columns are only rendered when at least one team
 * in the division has the underlying data, so no empty columns are shown.
 */
function DivisionTable({ division }: { division: NflGuideDivision }) {
  const { teams } = division;
  const hasModel = teams.some((team) => team.model);
  const hasRecord = teams.some((team) => team.previousSeason);
  const hasMarket = teams.some((team) => team.market);
  const hasSchedule = teams.some((team) => team.schedule);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-xs">
        <caption className="sr-only">
          {division.division} model, market and schedule comparison
        </caption>
        <thead>
          <tr className="border-b border-slate-300 text-[9px] uppercase tracking-wider text-slate-500">
            <th scope="col" className="py-1.5 text-left font-bold">
              Team
            </th>
            {hasModel ? (
              <>
                <th scope="col" className="py-1.5 text-right font-bold">
                  Rank
                </th>
                <th scope="col" className="py-1.5 text-right font-bold">
                  Rating
                </th>
                <th scope="col" className="py-1.5 text-right font-bold">
                  Off / Def
                </th>
              </>
            ) : null}
            {hasRecord ? (
              <th scope="col" className="py-1.5 text-right font-bold">
                Prev
              </th>
            ) : null}
            {hasMarket ? (
              <th scope="col" className="py-1.5 text-right font-bold">
                Win total
              </th>
            ) : null}
            {hasSchedule ? (
              <th scope="col" className="py-1.5 text-right font-bold">
                Sched
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => (
            <tr key={team.abbr} className="border-b border-slate-100 last:border-0">
              <th scope="row" className="py-1.5 text-left font-normal">
                <div className="flex items-center gap-2">
                  <TeamLogo team={team} size={20} />
                  <span className="truncate font-bold text-slate-800">{team.name}</span>
                </div>
              </th>
              {hasModel ? (
                <>
                  <td className="py-1.5 text-right font-black tabular-nums text-slate-900">
                    {team.model ? `#${team.model.rank}` : "—"}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-700">
                    {team.model ? team.model.publicRating.toFixed(1) : "—"}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-600">
                    {team.model
                      ? `${team.model.offenseRating.toFixed(0)} / ${team.model.defenseRating.toFixed(0)}`
                      : "—"}
                  </td>
                </>
              ) : null}
              {hasRecord ? (
                <td className="py-1.5 text-right tabular-nums text-slate-700">
                  {team.previousSeason ? formatNflRecord(team.previousSeason) : "—"}
                </td>
              ) : null}
              {hasMarket ? (
                <td className="py-1.5 text-right tabular-nums text-slate-700">
                  {team.market ? team.market.winTotal.toFixed(1) : "—"}
                </td>
              ) : null}
              {hasSchedule ? (
                <td className="py-1.5 text-right tabular-nums text-slate-700">
                  {team.schedule ? `#${team.schedule.strengthOfSchedule.hardestFirstRank}` : "—"}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GuideDivisionSection({ division }: { division: NflGuideDivision }) {
  const anchorId = `division-${division.division.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <section
      id={anchorId}
      data-testid={`guide-division-${anchorId}`}
      className="guide-division scroll-mt-24 space-y-3"
    >
      <div className="break-inside-avoid space-y-3">
        <div className="flex items-baseline justify-between gap-3 border-b-2 border-slate-900 pb-1.5">
          <h2 className="text-lg font-black tracking-tight text-slate-900">{division.division}</h2>
          <div className="flex gap-1">
            <SourceTag kind="model" />
            <SourceTag kind="market" />
            <SourceTag kind="schedule" />
          </div>
        </div>
        <div className="min-w-0 border border-slate-200 bg-white p-3">
          <DivisionTable division={division} />
          <p className="mt-2 text-[9px] text-slate-500">
            Ordered by model rank. Rating is the 1-99 public scale; schedule rank is #1 hardest.
          </p>
        </div>
      </div>

      <div className="grid min-w-0 gap-3 lg:grid-cols-2 print:grid-cols-1">
        {division.teams.map((team) => (
          <GuideTeamSection key={team.abbr} team={team} />
        ))}
      </div>
    </section>
  );
}
