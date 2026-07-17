import { GuideSectionHeading, SourceTag, TeamLogo } from "@/components/nfl/guide/GuideAtoms";
import { formatGeneratedAt } from "@/components/nfl/guide/GuideHeader";
import {
  NFL_SEATTLE_BYE_WEEK_2026,
  NFL_SEATTLE_SCHEDULE_2026,
  SEATTLE_SCHEDULE_SOURCE,
  type NflRestLabel,
  type NflSeattleScheduleGame,
} from "@/lib/nfl/seattleSchedule";
import type { NflGuideRecord } from "@/lib/nfl/guideRecord";

const ADVANTAGE_CLASSES = "border-emerald-200 bg-emerald-50 text-emerald-800";
const DISADVANTAGE_CLASSES = "border-red-200 bg-red-50 text-red-700";
const NEUTRAL_CLASSES = "border-slate-200 bg-slate-50 text-slate-600";

function toneClasses(label: NflRestLabel): string {
  if (label === "advantage") return ADVANTAGE_CLASSES;
  if (label === "disadvantage") return DISADVANTAGE_CLASSES;
  return NEUTRAL_CLASSES;
}

function edgeLabel(value: number | null): { text: string; tone: NflRestLabel } {
  if (value == null) return { text: "—", tone: "neutral" };
  if (value >= 1) return { text: "Edge", tone: "advantage" };
  if (value <= -1) return { text: "Gap", tone: "disadvantage" };
  return { text: "Even", tone: "neutral" };
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function EdgeBadge({ value, digits = 1 }: { value: number | null; digits?: number }) {
  const { text, tone } = edgeLabel(value);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] font-black tabular-nums ${toneClasses(tone)}`}
    >
      {value != null ? `${value > 0 ? "+" : ""}${value.toFixed(digits)}` : "—"}
      <span className="font-bold uppercase tracking-wide">{text}</span>
    </span>
  );
}

function RestBadge({ game }: { game: NflSeattleScheduleGame }) {
  const { edgeDays, label, isShortWeek } = game.rest;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span
        className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-black tabular-nums ${toneClasses(label)}`}
      >
        {edgeDays > 0 ? "+" : ""}
        {edgeDays}d
      </span>
      {isShortWeek ? (
        <span className="rounded-sm border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-900">
          Short week
        </span>
      ) : null}
    </span>
  );
}

function LocationBadge({ game }: { game: NflSeattleScheduleGame }) {
  const label = game.homeAway === "home" ? "Home" : game.homeAway === "away" ? "Away" : "Neutral";
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="rounded-sm border border-slate-300 bg-white px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-600">
        {label}
      </span>
      {game.isDivisionalGame ? (
        <span className="rounded-sm border border-indigo-300 bg-indigo-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-indigo-800">
          Division
        </span>
      ) : null}
    </span>
  );
}

function OpponentCell({ game }: { game: NflSeattleScheduleGame }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <TeamLogo
        team={{
          abbr: game.opponentAbbr,
          name: game.opponentName,
          logoUrl: game.opponentLogoUrl ?? "",
          primaryColor: game.opponentPrimaryColor ?? "#334155",
        }}
        size={24}
      />
      <div className="min-w-0">
        <div className="truncate text-xs font-black text-slate-900">{game.opponentName}</div>
        <div className="text-[10px] text-slate-500">
          {formatDate(game.date)}
          {game.venue ? ` · ${game.venue}` : ""}
        </div>
      </div>
    </div>
  );
}

function DesktopScheduleTable({ games }: { games: NflSeattleScheduleGame[] }) {
  return (
    <table className="hidden w-full min-w-[720px] text-xs md:table print:!table">
      <thead>
        <tr className="border-b-2 border-slate-300 text-left text-[9px] uppercase tracking-wider text-slate-500">
          <th scope="col" className="py-1.5 pr-2 font-bold">
            Wk
          </th>
          <th scope="col" className="py-1.5 pr-2 font-bold">
            Opponent
          </th>
          <th scope="col" className="py-1.5 pr-2 font-bold">
            Location
          </th>
          <th scope="col" className="py-1.5 pr-2 font-bold">
            Opp. v0.3
          </th>
          <th scope="col" className="py-1.5 pr-2 font-bold">
            Matchup edge
          </th>
          <th scope="col" className="py-1.5 pr-2 font-bold">
            Rest
          </th>
          <th scope="col" className="py-1.5 font-bold">
            Note
          </th>
        </tr>
      </thead>
      <tbody>
        {games.map((game) => (
          <tr key={game.week} className="break-inside-avoid border-b border-slate-100 align-top last:border-0">
            <td className="py-2 pr-2 font-black tabular-nums text-slate-900">{game.week}</td>
            <td className="py-2 pr-2">
              <OpponentCell game={game} />
            </td>
            <td className="py-2 pr-2">
              <LocationBadge game={game} />
            </td>
            <td className="py-2 pr-2 tabular-nums text-slate-700">
              {game.opponent.v03Rank != null ? (
                <>
                  #{game.opponent.v03Rank}
                  <span className="ml-1 text-slate-400">{game.opponent.v03PublicRating?.toFixed(1)}</span>
                </>
              ) : (
                "—"
              )}
            </td>
            <td className="py-2 pr-2">
              <EdgeBadge value={game.matchupEdge.overallRatingGap} />
            </td>
            <td className="py-2 pr-2">
              <RestBadge game={game} />
            </td>
            <td className="max-w-[240px] py-2 text-[11px] leading-4 text-slate-600">{game.rationale}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MobileScheduleList({ games }: { games: NflSeattleScheduleGame[] }) {
  return (
    <ul className="space-y-2 md:hidden print:hidden">
      {games.map((game) => (
        <li key={game.week} className="break-inside-avoid border border-slate-200 bg-white p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              Week {game.week}
            </span>
            <LocationBadge game={game} />
          </div>
          <div className="mt-1.5">
            <OpponentCell game={game} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {game.opponent.v03Rank != null ? (
              <span className="rounded-sm border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-700">
                Opp #{game.opponent.v03Rank}
              </span>
            ) : null}
            <EdgeBadge value={game.matchupEdge.overallRatingGap} />
            <RestBadge game={game} />
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-slate-600">{game.rationale}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Game-by-game breakdown (Phase 5). No probability or probability tier is
 * shown here: see docs/nfl-guide/seattle-probability-proposal.md. Matchup
 * edge is a rating-point gap, not a win chance.
 */
export function ChapterScheduleBreakdown({ team }: { team: NflGuideRecord }) {
  if (team.abbr !== "sea" || NFL_SEATTLE_SCHEDULE_2026.length === 0) return null;

  return (
    // No break-inside-avoid here: with 17 rows this section is allowed to span
    // print pages. Each row/card individually carries break-inside-avoid instead.
    <section className="min-w-0 border border-slate-200 border-l-4 border-l-teal-400 bg-teal-50/30 p-3">
      <GuideSectionHeading as="h3" eyebrow="Schedule & rest" title="2026 game-by-game breakdown" />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <SourceTag kind="schedule" />
        <SourceTag kind="external" />
        <span className="text-[10px] text-slate-500">
          {SEATTLE_SCHEDULE_SOURCE.title} snapshot {formatGeneratedAt(SEATTLE_SCHEDULE_SOURCE.snapshotAt)} · rest
          data from Warren Sharp&apos;s 2026 Football Preview
        </span>
      </div>
      <p className="mt-2 text-[10px] leading-4 text-slate-500">
        Matchup edge is a rating-point gap (NFL v0.3 public rating), not a win probability. No per-game win
        probability model exists yet for this guide.
      </p>

      {/* min-w-0: without it, flex/grid ancestors default to min-width:auto and let the
          table's forced min-w-[720px] push the whole page wider at in-between viewports.
          overflow-x-auto (not hidden): the table can still be reached by scrolling here
          rather than silently clipping columns at narrower desktop/tablet widths. */}
      <div className="mt-3 min-w-0 overflow-x-auto">
        <DesktopScheduleTable games={NFL_SEATTLE_SCHEDULE_2026} />
        <MobileScheduleList games={NFL_SEATTLE_SCHEDULE_2026} />
      </div>

      {NFL_SEATTLE_BYE_WEEK_2026 ? (
        <p className="mt-2 text-[10px] text-slate-500">Bye: Week {NFL_SEATTLE_BYE_WEEK_2026.week}.</p>
      ) : null}

      <p className="mt-2 flex flex-wrap items-center gap-3 text-[9px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span className={`inline-block h-2.5 w-2.5 rounded-sm border ${ADVANTAGE_CLASSES}`} /> Seattle advantage
        </span>
        <span className="inline-flex items-center gap-1">
          <span className={`inline-block h-2.5 w-2.5 rounded-sm border ${DISADVANTAGE_CLASSES}`} /> Seattle
          disadvantage
        </span>
        <span className="inline-flex items-center gap-1">
          <span className={`inline-block h-2.5 w-2.5 rounded-sm border ${NEUTRAL_CLASSES}`} /> Neutral / even
        </span>
      </p>
    </section>
  );
}
