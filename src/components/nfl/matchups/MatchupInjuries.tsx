import { useState } from "react";
import MatchupSection from "@/components/nfl/matchups/MatchupSection";
import MatchupSegmentedControl from "@/components/nfl/matchups/MatchupSegmentedControl";
import MatchupPendingNote from "@/components/nfl/matchups/MatchupPendingNote";
import {
  PRACTICE_STATUS_LABELS,
  displayStatusLabel,
  formatSnapPct,
  statusTone,
} from "@/lib/nfl/injuryData";
import type { NflInjuryEntry, NflInjuryResolver, NflTeamInjuryProfile } from "@/lib/nfl/matchupMetrics";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";

const TONE_CLASS: Record<string, string> = {
  out: "bg-red-100 text-red-800",
  doubtful: "bg-orange-100 text-orange-800",
  questionable: "bg-amber-100 text-amber-800",
  reserve: "bg-slate-200 text-slate-600",
};

function StatusBadge({ entry }: { entry: NflInjuryEntry }) {
  const label = displayStatusLabel(entry);
  const tone = statusTone(entry);
  if (!label || !tone) return null;
  return (
    <span
      className={`inline-block rounded px-1 py-0.5 text-[9px] font-bold uppercase leading-none tracking-wide ${TONE_CLASS[tone]}`}
    >
      {label}
    </span>
  );
}

/** Designation counts only — no impact score, no points lost, no spread effect. */
function SummaryRow({ summary }: { summary: NflTeamInjuryProfile["summary"] }) {
  const parts = [
    { label: "Out", value: summary.out, tone: "text-red-700" },
    { label: "Dbt", value: summary.doubtful, tone: "text-orange-700" },
    { label: "Qst", value: summary.questionable, tone: "text-amber-700" },
    { label: "Res", value: summary.reserve, tone: "text-slate-500" },
  ].filter((part) => part.value > 0);

  if (parts.length === 0) return null;

  return (
    <dl className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-slate-200 px-2 py-1.5">
      {parts.map((part) => (
        <div key={part.label} className="flex items-baseline gap-1">
          <dt className={`text-[11px] font-bold tabular-nums ${part.tone}`}>{part.value}</dt>
          <dd className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{part.label}</dd>
        </div>
      ))}
    </dl>
  );
}

function TeamInjuryPanel({
  team,
  profile,
  unavailableMessage,
}: {
  team: NflMatchupTeam;
  profile: NflTeamInjuryProfile | null;
  unavailableMessage: string;
}) {
  const entries = profile?.entries ?? [];

  return (
    <div className="rounded-lg border border-slate-200">
      <div className="border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
        {team.teamName}
      </div>

      {profile ? <SummaryRow summary={profile.summary} /> : null}

      <div className="px-2 pb-2">
        {entries.length === 0 ? (
          <p className="mt-2 rounded border border-dashed border-slate-200 bg-slate-50/60 px-2 py-3 text-center text-[11px] font-semibold text-slate-400">
            {unavailableMessage}
          </p>
        ) : (
          <table className="w-full table-fixed border-collapse text-left">
            <caption className="sr-only">
              {team.teamName} injury report with offensive and defensive snap shares
            </caption>
            <colgroup>
              <col />
              <col className="w-[30px]" />
              <col className="w-[76px]" />
              <col className="w-[42px]" />
              <col className="w-[46px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                <th scope="col" className="py-1 pr-1">Player</th>
                <th scope="col" className="py-1 pr-1">Pos</th>
                <th scope="col" className="py-1 pr-1">Status</th>
                <th scope="col" className="py-1 pr-1 text-right">Last Gm</th>
                <th scope="col" className="py-1 text-right">Season</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.playerId} className="border-b border-slate-100 align-top last:border-0">
                  <td className="py-1 pr-1">
                    {/* Names wrap rather than truncate: at 375px a fixed
                        ellipsis turns "Jahlani Tavai" into "Jahlani T…". */}
                    <span className="block break-words text-[11px] font-bold leading-tight text-slate-800">
                      {entry.playerName}
                    </span>
                    {entry.injuryDescription ? (
                      <span className="block truncate text-[9px] font-semibold text-slate-400">
                        {entry.injuryDescription}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1 pr-1 text-[10px] font-semibold text-slate-500">
                    {entry.position}
                  </td>
                  <td className="py-1 pr-1">
                    <StatusBadge entry={entry} />
                    {entry.practiceStatus ? (
                      <span className="mt-0.5 block text-[9px] font-semibold text-slate-400">
                        {PRACTICE_STATUS_LABELS[entry.practiceStatus]}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1 pr-1 text-right text-[11px] tabular-nums text-slate-700">
                    {formatSnapPct(entry.lastGameSnapPct)}
                  </td>
                  <td className="py-1 text-right text-[11px] tabular-nums text-slate-700">
                    {formatSnapPct(entry.seasonSnapPct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/**
 * Injury availability.
 *
 * Offensive and defensive contributors only — kickers, punters and long
 * snappers are excluded by the data layer, and special-teams participation
 * never qualifies a player as relevant.
 *
 * Last Gm and Season are the player's own unit share (offensive for offensive
 * players, defensive for defensive players), never a combined figure and never
 * inclusive of special teams. "N/A" means the player did not dress; "0%" means
 * he dressed and took no snaps on that side of the ball.
 *
 * Game status, practice status and reserve status stay separate: practice
 * participation appears only as compact secondary context and never replaces
 * the game designation.
 *
 * No injury impact score, points-lost estimate or spread adjustment is derived
 * here or anywhere downstream.
 */
export default function MatchupInjuries({
  matchup,
  resolver,
  unavailableMessage = "Injury report not connected.",
  note,
}: {
  matchup: NflMatchup;
  resolver: NflInjuryResolver;
  unavailableMessage?: string;
  note?: string;
}) {
  const [side, setSide] = useState<"away" | "home">("away");
  const { away, home } = matchup;
  const awayProfile = resolver(away.slug);
  const homeProfile = resolver(home.slug);

  // When neither team has a report, the reason is a property of the section,
  // not of each team. Rendering two headed panels around the same sentence
  // stated it twice and spent a third of the section on an empty state.
  const sectionUnavailable =
    (awayProfile?.entries.length ?? 0) === 0 && (homeProfile?.entries.length ?? 0) === 0;

  const options = [
    { value: "away" as const, label: away.abbr.toUpperCase() },
    { value: "home" as const, label: home.abbr.toUpperCase() },
  ];

  return (
    <MatchupSection
      id="injuries"
      subtitle="Offensive and defensive contributors only. Specialists are excluded."
      headerAside={
        sectionUnavailable ? undefined : (
          <MatchupSegmentedControl
            options={options}
            value={side}
            onChange={setSide}
            ariaLabel="Injury report team"
            size="sm"
            className="lg:hidden"
          />
        )
      }
    >
      {sectionUnavailable ? (
        <p className="text-[11px] leading-4 text-slate-500">{unavailableMessage}</p>
      ) : (
      <div className="grid gap-3 lg:grid-cols-2">
        <div className={side === "away" ? "" : "hidden lg:block"}>
          <TeamInjuryPanel
            team={away}
            profile={awayProfile}
            unavailableMessage={unavailableMessage}
          />
        </div>
        <div className={side === "home" ? "" : "hidden lg:block"}>
          <TeamInjuryPanel
            team={home}
            profile={homeProfile}
            unavailableMessage={unavailableMessage}
          />
        </div>
      </div>
      )}
      {note ? <MatchupPendingNote>{note}</MatchupPendingNote> : null}
    </MatchupSection>
  );
}
