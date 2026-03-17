import { useMemo } from "react";
import { useInjuries, lookupTeamInjuries } from "@/hooks/useInjuries";
import { Link } from "react-router-dom";
import { X, ExternalLink, CheckCircle2 } from "lucide-react";
import TeamLogo from "@/components/TeamLogo";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  calculateTeamScore,
  computeHomeInflationMetrics,
  computeQuadRecord,
  formatStat,
  getTop50AvgDropOff,
  hasStat,
  DEFAULT_STAT_WEIGHTS,
  type StatWeight,
  type Team,
} from "@/data/ncaaTeams";
import type { BracketGame } from "@/lib/bracket";

// ─── helpers ────────────────────────────────────────────────────────────────

function netEff(team: Team) {
  const oe = team.stats.adjOE;
  const de = team.stats.adjDE;
  return hasStat(oe) && hasStat(de) ? oe - de : null;
}

function modelProbs(teamA: Team, teamB: Team, weights: StatWeight[]) {
  const sA = calculateTeamScore(teamA.stats, weights);
  const sB = calculateTeamScore(teamB.stats, weights);
  const total = sA + sB || 1;
  return { probA: sA / total, probB: sB / total, scoreA: sA, scoreB: sB };
}

function pct(n: number) {
  return `${(n * 100).toFixed(0)}%`;
}

// ─── sub-components ─────────────────────────────────────────────────────────

function ModalHeader({ teamA, teamB, onClose }: { teamA: Team; teamB: Team; onClose: () => void }) {
  return (
    <div className="flex items-start gap-2">
      {/* 3-column centered layout */}
      <div className="flex-1 grid grid-cols-3 items-center gap-2">
        {/* Team A */}
        <div className="flex flex-col items-center gap-1">
          <TeamLogo name={teamA.name} logo={teamA.logo} className="h-12 w-12" />
          {teamA.seed && (
            <span className="text-[10px] font-bold bg-primary/20 text-primary rounded px-1.5 py-0.5">{teamA.seed}</span>
          )}
          <p className="text-xs font-semibold text-foreground text-center leading-tight">{teamA.abbreviation}</p>
          <p className="text-[10px] text-muted-foreground text-center">{teamA.record || "—"}</p>
        </div>

        {/* VS / Site info */}
        <div className="flex flex-col items-center justify-center gap-1">
          <span className="text-lg font-bold text-muted-foreground">VS</span>
          <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wider text-center bg-secondary/60 px-2 py-0.5 rounded">
            Neutral site
          </span>
        </div>

        {/* Team B */}
        <div className="flex flex-col items-center gap-1">
          <TeamLogo name={teamB.name} logo={teamB.logo} className="h-12 w-12" />
          {teamB.seed && (
            <span className="text-[10px] font-bold bg-primary/20 text-primary rounded px-1.5 py-0.5">{teamB.seed}</span>
          )}
          <p className="text-xs font-semibold text-foreground text-center leading-tight">{teamB.abbreviation}</p>
          <p className="text-[10px] text-muted-foreground text-center">{teamB.record || "—"}</p>
        </div>
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        aria-label="Close"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function ModelStrip({
  teamA,
  teamB,
  weights,
}: {
  teamA: Team;
  teamB: Team;
  weights: StatWeight[];
}) {
  const { probA, probB, scoreA, scoreB } = modelProbs(teamA, teamB, weights);
  const total = scoreA + scoreB || 1;

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Model Win Probability</p>
      <div className="flex items-center gap-2 text-xs">
        <span className="font-bold tabular-nums text-foreground w-10 text-right">{pct(probA)}</span>
        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden flex">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${(scoreA / total) * 100}%` }}
          />
          <div
            className="h-full bg-secondary-foreground/25 transition-all duration-300"
            style={{ width: `${(scoreB / total) * 100}%` }}
          />
        </div>
        <span className="font-bold tabular-nums text-foreground w-10 text-left">{pct(probB)}</span>
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground px-0.5">
        <span>{teamA.abbreviation} — {scoreA.toFixed(1)} power</span>
        <span>{teamB.abbreviation} — {scoreB.toFixed(1)} power</span>
      </div>
    </div>
  );
}

function TwoColRow({
  label,
  valA,
  valB,
  higherIsBetter,
  format = (v: number) => v.toFixed(1),
}: {
  label: string;
  valA: number | null;
  valB: number | null;
  higherIsBetter: boolean;
  format?: (v: number) => string;
}) {
  const aWins = hasStat(valA) && hasStat(valB) && (higherIsBetter ? valA > valB : valA < valB);
  const bWins = hasStat(valA) && hasStat(valB) && (higherIsBetter ? valB > valA : valB < valA);

  return (
    <div className="grid grid-cols-[1fr,auto,1fr] items-center py-1.5 border-b border-border/40 last:border-0 gap-2">
      <span className={`text-right text-xs tabular-nums font-semibold rounded px-1 py-0.5 transition-colors ${aWins ? "bg-green-500/10 text-green-400" : "text-foreground"}`}>
        {hasStat(valA) ? format(valA) : "—"}
      </span>
      <span className="text-[10px] text-muted-foreground text-center whitespace-nowrap px-1">{label}</span>
      <span className={`text-left text-xs tabular-nums font-semibold rounded px-1 py-0.5 transition-colors ${bWins ? "bg-green-500/10 text-green-400" : "text-foreground"}`}>
        {hasStat(valB) ? format(valB) : "—"}
      </span>
    </div>
  );
}

function EfficiencyTable({
  teamA,
  teamB,
  avgDropOff,
  rankA,
  rankB,
  totalTeams,
}: {
  teamA: Team;
  teamB: Team;
  avgDropOff: number;
  rankA: number;
  rankB: number;
  totalTeams: number;
}) {
  const infA = computeHomeInflationMetrics(teamA, avgDropOff);
  const infB = computeHomeInflationMetrics(teamB, avgDropOff);
  const quadA = computeQuadRecord(teamA, rankA, totalTeams);
  const quadB = computeQuadRecord(teamB, rankB, totalTeams);

  const inflLabel = (lbl: string) => {
    if (lbl === "home-inflated") return <span className="text-orange-400 text-[10px] font-bold">⚠️ Inflated</span>;
    if (lbl === "road-tested") return <span className="text-blue-400 text-[10px] font-bold">💪 Road Tested</span>;
    return <span className="text-green-400 text-[10px] font-bold">✅ Stable</span>;
  };

  return (
    <div className="space-y-3">
      {/* Efficiency ratings */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Efficiency Ratings</p>
        <div className="grid grid-cols-[1fr,auto,1fr] pb-1 border-b border-border mb-0.5 gap-2">
          <span className="text-right text-[10px] font-semibold text-muted-foreground">{teamA.abbreviation}</span>
          <span className="text-[10px] font-semibold text-muted-foreground text-center px-1">Stat</span>
          <span className="text-left text-[10px] font-semibold text-muted-foreground">{teamB.abbreviation}</span>
        </div>
        <TwoColRow label="Adj. Off. Eff" valA={teamA.stats.adjOE} valB={teamB.stats.adjOE} higherIsBetter />
        <TwoColRow label="Adj. Def. Eff" valA={teamA.stats.adjDE} valB={teamB.stats.adjDE} higherIsBetter={false} />
        <TwoColRow label="Net Efficiency" valA={netEff(teamA)} valB={netEff(teamB)} higherIsBetter />
        <TwoColRow label="Home Net Eff" valA={infA.netEffHome} valB={infB.netEffHome} higherIsBetter />
        <TwoColRow label="Away Net Eff" valA={infA.netEffAway} valB={infB.netEffAway} higherIsBetter />
        <TwoColRow label="Drop-Off (Δ)" valA={infA.dropOff} valB={infB.dropOff} higherIsBetter={false} format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`} />
        <TwoColRow label="Infl. Score" valA={infA.homeInflationScore} valB={infB.homeInflationScore} higherIsBetter={false} format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`} />
      </div>

      {/* Four factors proxies */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Scoring &amp; Defense</p>
        <TwoColRow label="FG%" valA={teamA.stats.fgPct} valB={teamB.stats.fgPct} higherIsBetter format={(v) => `${v.toFixed(1)}%`} />
        <TwoColRow label="3PT%" valA={teamA.stats.threePct} valB={teamB.stats.threePct} higherIsBetter format={(v) => `${v.toFixed(1)}%`} />
        <TwoColRow label="FT%" valA={teamA.stats.ftPct} valB={teamB.stats.ftPct} higherIsBetter format={(v) => `${v.toFixed(1)}%`} />
        <TwoColRow label="RPG" valA={teamA.stats.rpg} valB={teamB.stats.rpg} higherIsBetter />
        <TwoColRow label="TOV/G" valA={teamA.stats.tpg} valB={teamB.stats.tpg} higherIsBetter={false} />
        <TwoColRow label="Opp PPG" valA={teamA.stats.oppPpg} valB={teamB.stats.oppPpg} higherIsBetter={false} />
        <TwoColRow label="Tempo" valA={teamA.stats.tempo} valB={teamB.stats.tempo} higherIsBetter />
      </div>

      {/* Resume */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Resume</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { team: teamA, quad: quadA, inf: infA },
            { team: teamB, quad: quadB, inf: infB },
          ].map(({ team, quad, inf }) => (
            <div key={team.canonicalId} className="space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground">{team.abbreviation}</p>
              <div className="flex flex-col gap-1">
                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-yellow-400/15 text-yellow-400 border border-yellow-400/25">
                  Q1 {quad.q1.wins}-{quad.q1.losses}
                </span>
                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-secondary text-secondary-foreground">
                  Q2 {quad.q2.wins}-{quad.q2.losses}
                </span>
                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-secondary text-secondary-foreground">
                  Q3 {quad.q3.wins}-{quad.q3.losses}
                </span>
              </div>
              <div className="mt-1">{inflLabel(inf.label)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── main modal ──────────────────────────────────────────────────────────────

interface BracketMatchupModalProps {
  game: BracketGame | null;
  weights: StatWeight[];
  teamPool: Team[];
  onClose: () => void;
  onPick?: (gameId: string, teamId: string) => void;
}

function ModalBody({
  game,
  weights,
  teamPool,
  onClose,
  onPick,
}: BracketMatchupModalProps) {
  const teamA = game?.teamA;
  const teamB = game?.teamB;

  const { data: injuryMap } = useInjuries();

  const avgDropOff = useMemo(() => getTop50AvgDropOff(teamPool), [teamPool]);

  const sortedPool = useMemo(
    () =>
      [...teamPool].sort(
        (a, b) => calculateTeamScore(b.stats, DEFAULT_STAT_WEIGHTS) - calculateTeamScore(a.stats, DEFAULT_STAT_WEIGHTS),
      ),
    [teamPool],
  );

  const rankA = teamA ? (sortedPool.findIndex((t) => t.canonicalId === teamA.canonicalId) + 1 || sortedPool.length) : 1;
  const rankB = teamB ? (sortedPool.findIndex((t) => t.canonicalId === teamB.canonicalId) + 1 || sortedPool.length) : 1;

  const fullAnalysisUrl =
    teamA && teamB
      ? `/schedule?away=${encodeURIComponent(teamA.canonicalId)}&home=${encodeURIComponent(teamB.canonicalId)}`
      : null;

  if (!teamA || !teamB) return null;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sticky header */}
      <div className="shrink-0 bg-card z-10 px-4 pt-4 pb-3 border-b border-border">
        <ModalHeader teamA={teamA} teamB={teamB} onClose={onClose} />
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <p className="text-[10px] text-muted-foreground italic text-center">
          Neutral site — away efficiency is the stronger predictor here.
        </p>

        <ModelStrip teamA={teamA} teamB={teamB} weights={weights} />

        <EfficiencyTable
          teamA={teamA}
          teamB={teamB}
          avgDropOff={avgDropOff}
          rankA={rankA}
          rankB={rankB}
          totalTeams={sortedPool.length}
        />
      </div>

      {/* Pick winner */}
      {onPick && game && (
        <div className="shrink-0 px-4 py-3 border-t border-border bg-secondary/40">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Pick Winner</p>
          <div className="grid grid-cols-2 gap-2">
            {[teamA, teamB].map((team) => {
              if (!team) return null;
              const isPicked = game.winner?.canonicalId === team.canonicalId;
              return (
                <button
                  key={team.canonicalId}
                  onClick={() => onPick(game.id, team.canonicalId)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                    isPicked
                      ? "bg-primary/20 border-primary/40 text-primary ring-1 ring-inset ring-primary/30"
                      : "bg-card border-border text-foreground hover:bg-secondary hover:border-primary/30"
                  }`}
                >
                  <TeamLogo name={team.name} logo={team.logo} className="h-5 w-5 shrink-0" />
                  <span className="truncate text-xs">{team.abbreviation}</span>
                  {isPicked && <CheckCircle2 className="h-3.5 w-3.5 ml-auto shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Compact injuries */}
      {injuryMap && injuryMap.size > 0 && (() => {
        const injA = lookupTeamInjuries(teamA, injuryMap).filter(
          (e) => e.status.toLowerCase() === "out" || e.status.toLowerCase() === "doubtful",
        );
        const injB = lookupTeamInjuries(teamB, injuryMap).filter(
          (e) => e.status.toLowerCase() === "out" || e.status.toLowerCase() === "doubtful",
        );
        const bothClean = injA.length === 0 && injB.length === 0;
        return (
          <div className="shrink-0 px-4 py-2.5 border-t border-border bg-secondary/20">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              🏥 Injuries
            </p>
            {bothClean ? (
              <p className="text-[11px] text-muted-foreground">✅ Both teams healthy</p>
            ) : (
              <div className="space-y-1">
                {[{ team: teamA, inj: injA }, { team: teamB, inj: injB }].map(({ team, inj }) => (
                  <p key={team.canonicalId} className="text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground">{team.abbreviation}:</span>{" "}
                    {inj.length === 0
                      ? "No key injuries"
                      : inj
                          .map((e) => `${e.playerName.split(" ").pop()} (${e.position}) — ${e.status}`)
                          .join(" · ")}
                  </p>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Sticky footer */}
      {fullAnalysisUrl && (
        <div className="shrink-0 px-4 py-3 border-t border-border flex items-center justify-between bg-secondary/80">
          <span className="text-[10px] text-muted-foreground">Away efficiency is weighted higher for neutral-site games.</span>
          <Link
            to={fullAnalysisUrl}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline shrink-0"
          >
            Full Analysis
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}

export default function BracketMatchupModal({
  game,
  weights,
  teamPool,
  onClose,
  onPick,
}: BracketMatchupModalProps) {
  const isOpen = !!(game?.teamA && game?.teamB);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="flex flex-col p-0 max-w-[440px] max-h-[85vh] overflow-hidden gap-0 border-border bg-card shadow-[0_24px_60px_hsl(var(--background)/0.5)]"
        style={{ opacity: 1 }}
      >
        <DialogTitle className="sr-only">Bracket Matchup Analysis</DialogTitle>
        <ModalBody game={game} weights={weights} teamPool={teamPool} onClose={onClose} onPick={onPick} />
      </DialogContent>
    </Dialog>
  );
}
