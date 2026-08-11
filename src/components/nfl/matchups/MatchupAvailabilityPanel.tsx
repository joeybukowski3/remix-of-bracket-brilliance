import { useState } from "react";
import MatchupSegmentedControl from "@/components/nfl/matchups/MatchupSegmentedControl";
import {
  PRACTICE_STATUS_LABELS,
  displayStatusLabel,
  formatSnapPct,
  statusTone,
} from "@/lib/nfl/injuryData";
import type {
  NflInjuryEntry,
  NflInjuryResolver,
  NflTeamInjuryProfile,
} from "@/lib/nfl/matchupMetrics";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";

const TONE_CLASS: Record<string, string> = {
  out: "border-red-200 bg-red-50 text-red-800",
  doubtful: "border-orange-200 bg-orange-50 text-orange-800",
  questionable: "border-amber-200 bg-amber-50 text-amber-800",
  reserve: "border-slate-300 bg-slate-100 text-slate-600",
};

function StatusBadge({ entry }: { entry: NflInjuryEntry }) {
  const label = displayStatusLabel(entry);
  const tone = statusTone(entry);
  if (!label || !tone) return null;
  return (
    <span
      className={`inline-block shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none tracking-wide ${TONE_CLASS[tone]}`}
    >
      {label}
    </span>
  );
}

/** Designation counts only — never an impact score, points lost or spread effect. */
function StatusCounts({ summary }: { summary: NflTeamInjuryProfile["summary"] }) {
  const parts = [
    { label: "Out", value: summary.out },
    { label: "Dbt", value: summary.doubtful },
    { label: "Qst", value: summary.questionable },
    { label: "Res", value: summary.reserve },
  ].filter((part) => part.value > 0);

  if (parts.length === 0) return null;

  return (
    <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-slate-200 pb-2">
      {parts.map((part) => (
        <div key={part.label} className="flex items-baseline gap-1.5">
          <dt className="text-[14px] font-bold tabular-nums text-slate-900">{part.value}</dt>
          <dd className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-600">
            {part.label}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Desktop and tablet keep a real table — the width is there and it reads well. */
function AvailabilityTable({
  team,
  entries,
}: {
  team: NflMatchupTeam;
  entries: readonly NflInjuryEntry[];
}) {
  return (
    <table className="w-full table-fixed border-collapse text-left">
      <caption className="sr-only">
        {team.teamName} availability report with unit snap shares
      </caption>
      <colgroup>
        <col />
        <col className="w-[52px]" />
        <col className="w-[104px]" />
        <col className="w-[64px]" />
        <col className="w-[64px]" />
      </colgroup>
      <thead>
        <tr className="border-b border-slate-200 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-600">
          <th scope="col" className="py-1.5 pr-2">
            Player
          </th>
          <th scope="col" className="py-1.5 pr-2">
            Pos
          </th>
          <th scope="col" className="py-1.5 pr-2">
            Status
          </th>
          <th scope="col" className="py-1.5 pr-2 text-right">
            Last Game
          </th>
          <th scope="col" className="py-1.5 text-right">
            Season
          </th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.playerId} className="border-b border-slate-100 align-top last:border-0">
            <td className="py-1.5 pr-2">
              {/* Names wrap rather than truncate — an ellipsis turns a real
                  player into "Jahlani T…" at the narrower table widths. */}
              <span className="block break-words text-[12px] font-semibold leading-tight text-slate-900">
                {entry.playerName}
              </span>
              {entry.injuryDescription && (
                <span className="block text-[10px] font-medium text-slate-600">
                  {entry.injuryDescription}
                </span>
              )}
            </td>
            <td className="py-1.5 pr-2 text-[11px] font-semibold text-slate-600">
              {entry.depthChartPosition ?? entry.position}
            </td>
            <td className="py-1.5 pr-2">
              <StatusBadge entry={entry} />
              {entry.practiceStatus && (
                <span className="mt-1 block text-[10px] font-medium text-slate-600">
                  {PRACTICE_STATUS_LABELS[entry.practiceStatus]} practice
                </span>
              )}
            </td>
            <td className="py-1.5 pr-2 text-right text-[12px] font-semibold tabular-nums text-slate-700">
              {formatSnapPct(entry.lastGameSnapPct)}
            </td>
            <td className="py-1.5 text-right text-[12px] font-semibold tabular-nums text-slate-700">
              {formatSnapPct(entry.seasonSnapPct)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * One compact surface per player below `sm` — a header line plus an internal
 * 2x2 grid, not four separate cards per player and not a table pushed sideways.
 */
function AvailabilityCards({ entries }: { entries: readonly NflInjuryEntry[] }) {
  return (
    <ul className="space-y-2">
      {entries.map((entry) => (
        <li
          key={entry.playerId}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 text-[13px] font-semibold leading-tight text-slate-900">
              {entry.playerName}
              <span className="ml-1.5 text-[11px] font-semibold text-slate-600">
                {entry.depthChartPosition ?? entry.position}
              </span>
            </span>
            <StatusBadge entry={entry} />
          </div>
          {entry.injuryDescription && (
            <p className="mt-0.5 text-[11px] text-slate-600">{entry.injuryDescription}</p>
          )}
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-slate-100 pt-2">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-[9px] font-bold uppercase tracking-[0.06em] text-slate-600">
                Practice
              </dt>
              <dd className="text-[12px] font-semibold text-slate-700">
                {entry.practiceStatus ? PRACTICE_STATUS_LABELS[entry.practiceStatus] : "—"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-[9px] font-bold uppercase tracking-[0.06em] text-slate-600">
                Reserve
              </dt>
              <dd className="text-[12px] font-semibold text-slate-700">
                {entry.reserveStatus === "RESERVE" ? "Yes" : "—"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-[9px] font-bold uppercase tracking-[0.06em] text-slate-600">
                Last Game
              </dt>
              <dd className="text-[12px] font-semibold tabular-nums text-slate-700">
                {formatSnapPct(entry.lastGameSnapPct)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-[9px] font-bold uppercase tracking-[0.06em] text-slate-600">
                Season
              </dt>
              <dd className="text-[12px] font-semibold tabular-nums text-slate-700">
                {formatSnapPct(entry.seasonSnapPct)}
              </dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

/**
 * Availability & Snaps.
 *
 * Driven entirely by the injury artifact. Game status, practice status and
 * reserve status stay strictly separate and are never merged: practice
 * participation is secondary context and never stands in for a game
 * designation, and Reserve is deliberately generic because the source publishes
 * no authoritative breakdown of IR, PUP and NFI.
 *
 * Snap shares are the player's own unit — offensive share for offensive
 * players, defensive for defensive — never combined and never special teams.
 * "N/A" means the player did not dress; "0%" means he dressed and took no snaps
 * on that side of the ball. The two are never conflated.
 *
 * The three distinct empty states from `describeUnavailable()` are preserved:
 * report not connected, current-season data not yet published, and no reported
 * injuries. No injury impact score, points-lost estimate or spread adjustment
 * is derived here or anywhere downstream.
 */
export default function MatchupAvailabilityPanel({
  matchup,
  resolver,
  unavailableMessage,
}: {
  matchup: NflMatchup;
  resolver: NflInjuryResolver;
  unavailableMessage: string;
}) {
  const { away, home } = matchup;
  const [side, setSide] = useState<"away" | "home">("away");

  const profiles = {
    away: resolver(away.slug),
    home: resolver(home.slug),
  };

  // When neither side has a report the reason belongs to the section, not to
  // each team; stating it twice inside two headed panels says nothing extra.
  const sectionUnavailable =
    (profiles.away?.entries.length ?? 0) === 0 && (profiles.home?.entries.length ?? 0) === 0;

  const teams: { key: "away" | "home"; team: NflMatchupTeam }[] = [
    { key: "away", team: away },
    { key: "home", team: home },
  ];

  return (
    <div className="space-y-3">
      <section
        aria-labelledby="availability-heading"
        className="rounded-lg border border-slate-200 bg-white"
      >
        <div className="border-b border-slate-100 px-3 py-2.5 sm:px-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 id="availability-heading" className="text-sm font-semibold text-slate-900">
                Availability &amp; Snaps
              </h2>
              <p className="mt-0.5 text-[11px] leading-4 text-slate-600">
                Offensive and defensive contributors only — specialists are excluded.
              </p>
            </div>
            {!sectionUnavailable && (
              <MatchupSegmentedControl
                options={teams.map(({ key, team }) => ({
                  value: key,
                  label: team.abbr.toUpperCase(),
                }))}
                value={side}
                onChange={setSide}
                ariaLabel="Availability report team"
                size="sm"
                className="lg:hidden"
              />
            )}
          </div>
        </div>

        <div className="px-3 py-3 sm:px-4">
          {sectionUnavailable ? (
            <p className="rounded border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[12px] font-semibold text-slate-600">
              {unavailableMessage}
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {teams.map(({ key, team }) => {
                const profile = profiles[key];
                const entries = profile?.entries ?? [];
                return (
                  <div key={key} className={side === key ? "" : "hidden lg:block"}>
                    <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-600">
                      {team.teamName}
                    </h3>
                    {profile && <StatusCounts summary={profile.summary} />}
                    {entries.length === 0 ? (
                      <p className="mt-2 rounded border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-center text-[11px] font-semibold text-slate-600">
                        {unavailableMessage}
                      </p>
                    ) : (
                      <>
                        <div className="mt-2 hidden sm:block">
                          <AvailabilityTable team={team} entries={entries} />
                        </div>
                        <div className="mt-2 sm:hidden">
                          <AvailabilityCards entries={entries} />
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section
        aria-labelledby="availability-guide-heading"
        className="rounded-lg border border-slate-200 bg-white"
      >
        <div className="border-b border-slate-100 px-3 py-2.5 sm:px-4">
          <h2 id="availability-guide-heading" className="text-sm font-semibold text-slate-900">
            How to read this
          </h2>
        </div>
        <div className="space-y-2 px-3 py-3 text-[12px] leading-5 text-slate-600 sm:px-4">
          <p>
            <span className="font-semibold text-slate-900">Game status</span> (Out / Doubtful /
            Questionable) is the official weekly designation.{" "}
            <span className="font-semibold text-slate-900">Practice</span> participation is shown
            separately as secondary context and never replaces the game designation.{" "}
            <span className="font-semibold text-slate-900">Reserve</span> is a long-term roster
            status and is deliberately generic — the underlying source publishes no authoritative
            breakdown of IR, PUP and NFI.
          </p>
          <p>
            Snap shares are the player&apos;s own unit only — offensive share for offensive
            players, defensive share for defensive players. Never combined, never inclusive of
            special teams. <span className="font-semibold text-slate-900">N/A</span> means the
            player did not dress; <span className="font-semibold text-slate-900">0%</span> means he
            dressed and took no snaps on that side of the ball.
          </p>
          <p className="rounded border border-slate-200 bg-slate-50 px-2.5 py-2 text-slate-600">
            No injury impact score, points-lost estimate or spread adjustment is derived from this
            data.
          </p>
        </div>
      </section>
    </div>
  );
}
