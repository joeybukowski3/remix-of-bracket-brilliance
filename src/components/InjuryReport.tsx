import TeamLogo from "@/components/TeamLogo";
import type { Team } from "@/data/ncaaTeams";
import { lookupTeamInjuries, type InjuryEntry, type InjuryMap } from "@/hooks/useInjuries";

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "out")
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
        Out
      </span>
    );
  if (s === "doubtful")
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-orange-600/20 text-orange-400 border border-orange-600/30">
        Doubtful
      </span>
    );
  if (s === "questionable")
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
        Questionable
      </span>
    );
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-yellow-500/15 text-yellow-300 border border-yellow-500/25">
      Probable
    </span>
  );
}

function StatPill({ label, value }: { label: string; value: string | null }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px]">
      <span className="text-muted-foreground/70">{label}</span>
      <span className="tabular-nums font-semibold text-foreground/80">{value ?? "—"}</span>
    </span>
  );
}

function InjuryRow({ entry }: { entry: InjuryEntry }) {
  const ppgStr = entry.ppg !== null ? entry.ppg.toFixed(1) : null;
  const gpStr = entry.gamesPlayed !== null ? String(entry.gamesPlayed) : null;
  const hasStats = ppgStr !== null || gpStr !== null;

  return (
    <div className="rounded-lg border border-border/50 bg-secondary/30 px-2.5 py-2 space-y-1.5">
      {/* Top row: name, position, status badge, impact tag */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-semibold text-foreground truncate">{entry.playerName}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">{entry.position}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusBadge status={entry.status} />
          {entry.impactRating === "High" && (
            <span className="text-[10px] font-semibold text-orange-400">⚡ High Impact</span>
          )}
        </div>
      </div>

      {/* Bottom row: PPG · GP · description */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        {hasStats && (
          <div className="flex items-center gap-2 shrink-0">
            <StatPill label="PPG " value={ppgStr} />
            <span className="text-border/60">·</span>
            <StatPill label="GP " value={gpStr} />
          </div>
        )}
        <p className="text-[11px] text-muted-foreground leading-relaxed">{entry.description}</p>
      </div>
    </div>
  );
}

function TeamInjuryList({ team, injuries }: { team: Team; injuries: InjuryEntry[] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <TeamLogo name={team.name} logo={team.logo} className="h-5 w-5 shrink-0" />
        <p className="text-xs font-semibold text-foreground">{team.abbreviation}</p>
      </div>
      {injuries.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">✅ No injuries reported</p>
      ) : (
        <div className="space-y-1.5">
          {injuries.map((entry, i) => (
            <InjuryRow key={i} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

interface InjuryReportProps {
  teamA: Team;
  teamB: Team;
  injuryMap: InjuryMap;
}

export default function InjuryReport({ teamA, teamB, injuryMap }: InjuryReportProps) {
  const injuriesA = lookupTeamInjuries(teamA, injuryMap);
  const injuriesB = lookupTeamInjuries(teamB, injuryMap);

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        🏥 Injury Report
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TeamInjuryList team={teamA} injuries={injuriesA} />
        <TeamInjuryList team={teamB} injuries={injuriesB} />
      </div>
      <p className="text-[10px] text-muted-foreground/60 italic">
        Injury data is informational only and is not currently factored into model probabilities.
      </p>
    </div>
  );
}
