import { Link } from "react-router-dom";
import { Metric, SourceTag, TeamLogo } from "@/components/nfl/guide/GuideAtoms";
import { formatNflRecord, formatSignedNumber, type NflGuideRecord } from "@/lib/nfl/guideRecord";

function RatingBar({ label, rating }: { label: string; rating: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[9px] font-bold uppercase tracking-[0.09em] text-slate-500">{label}</span>
        <span className="text-xs font-black tabular-nums text-slate-900">{rating.toFixed(1)}</span>
      </div>
      <div className="mt-1 h-1.5 w-full bg-slate-200">
        <div
          className="h-full bg-indigo-600 print:bg-slate-700"
          style={{ width: `${Math.max(1, Math.min(100, rating))}%` }}
        />
      </div>
    </div>
  );
}

/** Warren Sharp rest/timing summary. Only rendered when the profile exists. */
function ScheduleSummary({ team }: { team: NflGuideRecord }) {
  const schedule = team.schedule;
  if (!schedule) return null;
  const { hardestFirstRank } = schedule.strengthOfSchedule;

  return (
    <div className="border border-teal-200 bg-teal-50/40 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[10px] font-black uppercase tracking-wider text-teal-900">Schedule &amp; rest</h4>
        <SourceTag kind="schedule" />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Sched. strength" value={`#${hardestFirstRank}`} sub="1 = hardest" />
        <Metric label="Net rest" value={formatSignedNumber(schedule.netRestDays, 0)} sub={`#${schedule.netRestEdgeRank} rest edge`} />
        <Metric label="Short-week road" value={schedule.shortWeekRoadGames} sub={`#${schedule.shortWeekRoadGamesRank}`} />
        <Metric label="Negated byes" value={schedule.negatedByeWeeks} sub={`#${schedule.negatedByeRank}`} />
      </div>
      <p className="mt-1.5 text-[9px] text-slate-500">
        Warren Sharp&apos;s 2026 Football Preview · ranks as published
      </p>
    </div>
  );
}

/** VSiN-derived reference statistics from the completed prior season. */
function VsinReference({ team }: { team: NflGuideRecord }) {
  const vsin = team.vsin;
  if (!vsin) return null;
  const offense = vsin.statistics.offense.slice(0, 4);
  const defense = vsin.statistics.defense.slice(0, 4);
  if (offense.length === 0 && defense.length === 0) return null;

  return (
    <div className="border border-violet-200 bg-violet-50/40 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[10px] font-black uppercase tracking-wider text-violet-900">
          Reference statistics
        </h4>
        <SourceTag kind="external" />
      </div>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {[
          { title: "Offense", stats: offense },
          { title: "Defense", stats: defense },
        ].map(({ title, stats }) =>
          stats.length === 0 ? null : (
            <div key={title}>
              <div className="text-[9px] font-bold uppercase tracking-[0.09em] text-slate-500">{title}</div>
              <dl className="mt-1 space-y-0.5">
                {stats.map((stat) => (
                  <div key={stat.key} className="flex items-baseline justify-between gap-2 text-[11px]">
                    <dt className="truncate text-slate-600">{stat.label}</dt>
                    <dd className="shrink-0 font-bold tabular-nums text-slate-900">
                      {stat.displayValue}
                      <span className="ml-1 font-normal text-slate-400">#{stat.rank}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ),
        )}
      </div>
      <p className="mt-1.5 text-[9px] text-slate-500">2026 VSiN NFL Betting Guide · 2025 statistics</p>
    </div>
  );
}

/** Division, conference and Super Bowl futures as published by the source guide. */
function FuturesSummary({ team }: { team: NflGuideRecord }) {
  const odds = team.vsin?.odds;
  if (!odds) return null;
  const entries = [odds.division, odds.conference, odds.superBowl].filter(
    (entry) => entry && entry.displayValue,
  );
  if (entries.length === 0) return null;

  return (
    <div className="border border-amber-200 bg-amber-50/40 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[10px] font-black uppercase tracking-wider text-amber-900">Futures</h4>
        <SourceTag kind="market" />
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2">
        {entries.map((entry) => (
          <div key={entry.label}>
            <dt className="truncate text-[9px] font-bold uppercase tracking-[0.09em] text-slate-500">
              {entry.label}
            </dt>
            <dd className="text-sm font-black tabular-nums text-slate-900">{entry.displayValue}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1.5 text-[9px] text-slate-500">
        Prices as published in the 2026 VSiN NFL Betting Guide · not live odds
      </p>
    </div>
  );
}

/** Verified coaching status and player movement. */
function OffseasonSummary({ team }: { team: NflGuideRecord }) {
  const offseason = team.offseason;
  if (!offseason) return null;
  const additions = offseason.additions ?? [];
  const departures = offseason.departures ?? [];

  return (
    <div className="border border-stone-200 bg-stone-50 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[10px] font-black uppercase tracking-wider text-stone-800">
          Coaching &amp; movement
        </h4>
        <SourceTag kind="editorial" />
      </div>
      <div className="mt-2 text-[11px] leading-5 text-slate-700">
        <span className="font-bold text-slate-900">{offseason.headCoach2026}</span>
        <span
          className={`ml-1.5 rounded-sm px-1 py-0.5 text-[8px] font-black uppercase tracking-wider ${
            offseason.status === "Changed" ? "bg-red-100 text-red-800" : "bg-slate-200 text-slate-700"
          }`}
        >
          {offseason.status === "Changed" ? "New head coach" : "Returning"}
        </span>
        {offseason.note ? <p className="mt-1 text-slate-600">{offseason.note}</p> : null}
      </div>
      {additions.length > 0 || departures.length > 0 ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {[
            { title: "Additions", moves: additions, tone: "text-emerald-800" },
            { title: "Departures", moves: departures, tone: "text-red-800" },
          ].map(({ title, moves, tone }) =>
            moves.length === 0 ? null : (
              <div key={title}>
                <div className={`text-[9px] font-bold uppercase tracking-[0.09em] ${tone}`}>{title}</div>
                <ul className="mt-0.5 space-y-0.5">
                  {moves.map((move) => (
                    <li key={`${move.player}-${move.position}`} className="text-[11px] text-slate-700">
                      <span className="font-bold text-slate-900">{move.player}</span>{" "}
                      <span className="text-slate-500">
                        {move.position} · {move.method}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ),
          )}
        </div>
      ) : null}
      <p className="mt-1.5 text-[9px] text-slate-500">
        Verified through {offseason.verifiedAt} · not a complete transaction log
      </p>
    </div>
  );
}

export function GuideTeamSection({ team }: { team: NflGuideRecord }) {
  const { model, previousSeason, finalEight, market } = team;
  const trend =
    model && Math.abs(model.finalEightComposite - model.fullSeasonComposite) >= 0.001
      ? model.finalEightComposite - model.fullSeasonComposite
      : null;

  return (
    <article
      data-testid={`guide-team-${team.abbr}`}
      className="min-w-0 break-inside-avoid border border-slate-300 bg-white"
      style={{ borderTop: `3px solid ${team.primaryColor}` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <TeamLogo team={team} size={36} />
          <div className="min-w-0">
            <h3 className="truncate text-base font-black leading-tight text-slate-900">{team.fullName}</h3>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {team.division}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {model ? (
            <div className="text-right">
              <div className="text-[9px] font-bold uppercase tracking-[0.09em] text-slate-500">Model rank</div>
              <div className="text-2xl font-black leading-none tabular-nums text-slate-900">
                #{model.rank}
              </div>
            </div>
          ) : (
            <SourceTag kind="unavailable" />
          )}
        </div>
      </div>

      <div className="space-y-2.5 p-3">
        <div className="grid gap-3 sm:grid-cols-[1.1fr_1fr]">
          {model ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-700">
                  Power model
                </span>
                <SourceTag kind="model" />
              </div>
              <RatingBar label="Overall" rating={model.publicRating} />
              <RatingBar label="Offense" rating={model.offenseRating} />
              <RatingBar label="Defense" rating={model.defenseRating} />
              {trend !== null ? (
                <p className="text-[10px] leading-4 text-slate-600">
                  Final eight games rated{" "}
                  <span className="font-black text-slate-900">{formatSignedNumber(trend, 2)}</span> versus the
                  full season. Trajectory is published for review and does not affect the rating.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid grid-cols-2 content-start gap-2.5">
            {previousSeason ? (
              <>
                <Metric
                  label="Prev. season"
                  value={formatNflRecord(previousSeason)}
                  sub={
                    previousSeason.expectedWinsDelta != null
                      ? `${formatSignedNumber(previousSeason.expectedWinsDelta)} vs expected`
                      : null
                  }
                />
                <Metric
                  label="Prev. off / def"
                  value={
                    previousSeason.offEpaRank != null && previousSeason.defEpaRank != null
                      ? `#${previousSeason.offEpaRank} / #${previousSeason.defEpaRank}`
                      : null
                  }
                  sub="EPA per play rank"
                />
              </>
            ) : null}
            {market ? (
              <Metric label="Win total" value={market.winTotal.toFixed(1)} sub="Market line" />
            ) : (
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[0.09em] text-slate-500">
                  Win total
                </div>
                <SourceTag kind="unavailable" />
              </div>
            )}
            {finalEight?.netEpaRank != null ? (
              <Metric label="Final 8 net EPA" value={`#${finalEight.netEpaRank}`} sub="Last 8 games" />
            ) : null}
          </div>
        </div>

        <ScheduleSummary team={team} />
        <FuturesSummary team={team} />
        <VsinReference team={team} />
        <OffseasonSummary team={team} />

        <div data-print-hidden className="flex flex-wrap gap-3 border-t border-slate-200 pt-2">
          <Link
            to={`/nfl/guide/team/${team.slug}`}
            className="text-[11px] font-black text-indigo-700 underline-offset-2 hover:underline"
          >
            {team.name} full dashboard →
          </Link>
        </div>
      </div>
    </article>
  );
}
