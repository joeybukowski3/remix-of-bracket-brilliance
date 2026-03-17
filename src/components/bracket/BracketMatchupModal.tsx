import { useMemo } from "react";
import { Link } from "react-router-dom";
import { X, ExternalLink } from "lucide-react";
import TeamLogo from "@/components/TeamLogo";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
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
    <div className="flex items-start justify-between gap-3 pb-3 border-b border-border">
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex flex-col items-center gap-1 min-w-[60px]">
          <TeamLogo name={teamA.name} logo={teamA.logo} className="h-10 w-10" />
          {teamA.seed && (
            <span className="text-[10px] font-bold bg-primary/20 text-primary rounded px-1.5 py-0.5">{teamA.seed}</span>
          )}
          <p className="text-xs font-semibold text-foreground text-center leading-tight max-w-[72px] truncate">{teamA.abbreviation}</p>
          <p className="text-[10px] text-muted-foreground text-center">{teamA.record || "—"}</p>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-lg font-bold text-muted-foreground">vs</span>
          <span className="text-[9px] text-muted-foreground/60 mt-1 uppercase tracking-wider text-center">Neutral site</span>
        </div>

        <div className="flex flex-col items-center gap-1 min-w-[60px]">
          <TeamLogo name={teamB.name} logo={teamB.logo} className="h-10 w-10" />
          {teamB.seed && (
            <span className="text-[10px] font-bold bg-primary/20 text-primary rounded px-1.5 py-0.5">{teamB.seed}</span>
          )}
          <p className="text-xs font-semibold text-foreground text-center leading-tight max-w-[72px] truncate">{teamB.abbreviation}</p>
          <p className="text-[10px] text-muted-foreground text-center">{teamB.record || "—"}</p>
        </div>
      </div>
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
}

function ModalBody({
  game,
  weights,
  teamPool,
  onClose,
}: BracketMatchupModalProps) {
  const teamA = game?.teamA;
  const teamB = game?.teamB;

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
    <div className="flex flex-col h-full">
      <div className="p-4 space-y-4 overflow-y-auto flex-1">
        <ModalHeader teamA={teamA} teamB={teamB} onClose={onClose} />

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

      {/* Footer */}
      {fullAnalysisUrl && (
        <div className="px-4 py-3 border-t border-border flex items-center justify-between bg-card/50">
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
}: BracketMatchupModalProps) {
  const isOpen = !!(game?.teamA && game?.teamB);

  // Detect mobile via a simple media query approach — render as Sheet on narrow viewports
  // We use CSS classes to show/hide each container
  return (
    <>
      {/* Desktop: Dialog */}
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="hidden md:flex flex-col p-0 max-w-[440px] max-h-[85vh] overflow-hidden gap-0 border-white/10 bg-card/98 shadow-[0_24px_60px_hsl(var(--background)/0.5)]">
          <ModalBody game={game} weights={weights} teamPool={teamPool} onClose={onClose} />
        </DialogContent>
      </Dialog>

      {/* Mobile: bottom Sheet */}
      <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <SheetContent
          side="bottom"
          className="md:hidden p-0 max-h-[88vh] overflow-hidden flex flex-col rounded-t-2xl border-white/10 bg-card/98"
        >
          <ModalBody game={game} weights={weights} teamPool={teamPool} onClose={onClose} />
        </SheetContent>
      </Sheet>
    </>
  );
}
