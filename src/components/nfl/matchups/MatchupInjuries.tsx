import { useState } from "react";
import MatchupSection from "@/components/nfl/matchups/MatchupSection";
import MatchupSegmentedControl from "@/components/nfl/matchups/MatchupSegmentedControl";
import MatchupPendingNote from "@/components/nfl/matchups/MatchupPendingNote";
import type { NflInjuryResolver, NflInjurySnapExposure, NflTeamInjuryProfile } from "@/lib/nfl/matchupMetrics";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";

const NA = "N/A";

function snapPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return NA;
  return `${value.toFixed(0)}%`;
}

/**
 * Exposure summary for one unit.
 *
 * Labelled "Snap Exposure" rather than "Total Snaps": these are summed
 * individual snap shares across injured players, which is not a share of the
 * team's snaps and must not be presented as one.
 */
function ExposureSummary({
  unit,
  exposure,
}: {
  unit: string;
  exposure: NflInjurySnapExposure | null;
}) {
  return (
    <div className="rounded-lg border border-slate-200 px-2 py-1.5">
      <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{unit}</div>
      <dl className="mt-1 space-y-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[10px] font-bold text-slate-500">Unavailable</dt>
          <dd className="text-[11px] font-black tabular-nums text-slate-900">
            {exposure ? `${exposure.unavailablePct.toFixed(0)}%` : NA}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[10px] font-bold text-slate-500">Questionable</dt>
          <dd className="text-[11px] font-black tabular-nums text-slate-900">
            {exposure ? `${exposure.questionablePct.toFixed(0)}%` : NA}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function TeamInjuryPanel({
  team,
  profile,
}: {
  team: NflMatchupTeam;
  profile: NflTeamInjuryProfile | null;
}) {
  const entries = profile?.entries ?? [];

  return (
    <div className="rounded-lg border border-slate-200">
      <div className="border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-slate-600">
        {team.teamName}
      </div>

      <div className="grid grid-cols-2 gap-2 p-2">
        <ExposureSummary unit="Offense snap exposure" exposure={profile?.offense ?? null} />
        <ExposureSummary unit="Defense snap exposure" exposure={profile?.defense ?? null} />
      </div>

      <div className="px-2 pb-2">
        {entries.length === 0 ? (
          <p className="rounded border border-dashed border-slate-200 bg-slate-50/60 px-2 py-3 text-center text-[11px] font-semibold text-slate-400">
            No injury report connected.
          </p>
        ) : (
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">{team.teamName} injury report with snap shares</caption>
            <thead>
              <tr className="border-b border-slate-200 text-[9px] font-black uppercase tracking-wide text-slate-400">
                <th scope="col" className="py-1 pr-1">Player</th>
                <th scope="col" className="py-1 pr-1">Pos</th>
                <th scope="col" className="py-1 pr-1">Status</th>
                <th scope="col" className="py-1 pr-1 text-right">Last Gm</th>
                <th scope="col" className="py-1 text-right">Season</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.playerId} className="border-b border-slate-100 last:border-0">
                  <td className="truncate py-1 pr-1 text-[11px] font-bold text-slate-800">
                    {entry.playerName}
                  </td>
                  <td className="py-1 pr-1 text-[10px] font-semibold text-slate-500">
                    {entry.position}
                  </td>
                  <td className="py-1 pr-1 text-[10px] font-black uppercase text-slate-600">
                    {entry.status}
                  </td>
                  <td className="py-1 pr-1 text-right text-[11px] tabular-nums text-slate-700">
                    {snapPct(entry.lastGameSnapPct)}
                  </td>
                  <td className="py-1 text-right text-[11px] tabular-nums text-slate-700">
                    {snapPct(entry.seasonSnapPct)}
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
 * Injury impact. Offensive and defensive contributors only — kickers, punters,
 * long snappers and return-only specialists are excluded from exposure by the
 * data layer (see EXCLUDED_INJURY_POSITIONS).
 */
export default function MatchupInjuries({
  matchup,
  resolver,
}: {
  matchup: NflMatchup;
  resolver: NflInjuryResolver;
}) {
  const [side, setSide] = useState<"away" | "home">("away");
  const { away, home } = matchup;

  const options = [
    { value: "away" as const, label: away.abbr.toUpperCase() },
    { value: "home" as const, label: home.abbr.toUpperCase() },
  ];

  return (
    <MatchupSection
      id="injuries"
      subtitle="Offensive and defensive contributors only. Specialists are excluded."
      headerAside={
        <MatchupSegmentedControl
          options={options}
          value={side}
          onChange={setSide}
          ariaLabel="Injury report team"
          size="sm"
          className="lg:hidden"
        />
      }
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <div className={side === "away" ? "" : "hidden lg:block"}>
          <TeamInjuryPanel team={away} profile={resolver(away.slug)} />
        </div>
        <div className={side === "home" ? "" : "hidden lg:block"}>
          <TeamInjuryPanel team={home} profile={resolver(home.slug)} />
        </div>
      </div>
      <MatchupPendingNote>
        Designations and snap shares populate from the official injury report and a game-level snap
        source in a later phase. OUT and DOUBTFUL count as unavailable exposure; QUESTIONABLE is
        tracked separately.
      </MatchupPendingNote>
    </MatchupSection>
  );
}
