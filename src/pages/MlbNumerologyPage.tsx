import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import MlbPlayerHeadshot from "@/components/mlb/MlbPlayerHeadshot";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useMLBNumerology } from "@/hooks/useMLBNumerology";
import type {
  DailyProfile,
  NumerologyDailyData,
  NumerologyPlay,
  NumerologySignal,
  WatchlistPlay,
} from "@/types/mlbNumerology";
import { ChevronDown, ChevronUp, Filter, Search } from "lucide-react";

type ExtendedNumerologyData = NumerologyDailyData & {
  bestAvailable?: NumerologyPlay[];
  evaluationSummary?: {
    playersEvaluated?: number;
    completeProfiles?: number;
    confirmedLineups?: number;
    projectedLineups?: number;
    primaryFamilyMatches?: number;
    personalDayMatches?: number;
    countercurrentPlayers?: number;
    medianScore?: number;
    maxScore?: number;
    scoreDistribution?: Record<string, number>;
  };
};

type ExplorerPlay = {
  key: string;
  playerName: string;
  team: string;
  opponent: string;
  lineupStatus: NumerologyPlay["lineupStatus"];
  battingOrder?: number | null;
  jerseyNumber?: number | null;
  recommendedMarket: string;
  numerologyScore: number;
  baseballScore: number;
  finalScore: number;
  source: "Qualified" | "Best available" | "Watchlist";
};

type SortMode = "final" | "numerology" | "baseball" | "battingOrder";

function getEtDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function scoreTier(score: number) {
  if (score >= 85) return { label: "Elite Alignment", color: "text-violet-200", barColor: "bg-violet-400" };
  if (score >= 75) return { label: "Strong Alignment", color: "text-emerald-300", barColor: "bg-emerald-400" };
  if (score >= 60) return { label: "Qualified Alignment", color: "text-sky-300", barColor: "bg-sky-400" };
  return { label: "Watchlist", color: "text-slate-400", barColor: "bg-slate-500" };
}

const SIGNAL_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  primary_exact_master: { bg: "bg-violet-500/25", text: "text-violet-200", label: "Exact Master" },
  primary_exact_root: { bg: "bg-violet-400/20", text: "text-violet-300", label: "Exact Primary" },
  primary_root: { bg: "bg-sky-500/20", text: "text-sky-200", label: "Root Match" },
  secondary_exact: { bg: "bg-indigo-500/20", text: "text-indigo-200", label: "Calendar Exact" },
  secondary_root: { bg: "bg-slate-500/20", text: "text-slate-300", label: "Secondary Root" },
  family_support: { bg: "bg-emerald-500/15", text: "text-emerald-300", label: "Family" },
  personal_cycle: { bg: "bg-teal-500/20", text: "text-teal-200", label: "Personal Cycle" },
  name_resonance: { bg: "bg-amber-500/15", text: "text-amber-300", label: "Name Resonance" },
  contextual_echo: { bg: "bg-stone-500/20", text: "text-stone-300", label: "Echo" },
  countercurrent: { bg: "bg-rose-500/20", text: "text-rose-300", label: "Countercurrent" },
};

function SignalBadge({ type }: { type: string }) {
  const style = SIGNAL_STYLES[type] ?? SIGNAL_STYLES.family_support;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}

function LineupBadge({ status }: { status: NumerologyPlay["lineupStatus"] }) {
  const styles: Record<string, { bg: string; text: string; label: string }> = {
    confirmed: { bg: "bg-emerald-500/20", text: "text-emerald-300", label: "✓ Confirmed" },
    projected: { bg: "bg-sky-500/20", text: "text-sky-300", label: "~ Projected" },
    morning_projected: { bg: "bg-amber-500/20", text: "text-amber-300", label: "⏳ Morning Projected" },
    not_starting: { bg: "bg-rose-500/20", text: "text-rose-300", label: "✗ Not Starting" },
    unknown: { bg: "bg-slate-600/30", text: "text-slate-400", label: "? Unconfirmed" },
  };
  const style = styles[status] ?? styles.unknown;
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold ${style.bg} ${style.text}`}>{style.label}</span>;
}

function ScoreBar({ value, barColor }: { value: number; barColor: string }) {
  return (
    <div className="h-1 w-full rounded-full bg-white/10">
      <div className={`h-1 rounded-full ${barColor}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-[9px] font-bold uppercase tracking-[0.2em] text-white/25">{children}</h2>;
}

function Row({ label, value, highlight, dim }: { label: string; value: string; highlight?: boolean; dim?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] text-white/30">{label}</span>
      <span className={`font-mono text-[10px] font-bold ${highlight ? "text-violet-300" : dim ? "text-white/30" : "text-white/70"}`}>{value}</span>
    </div>
  );
}

function DailyCode({ profile, date }: { profile: DailyProfile; date: string }) {
  const [, month, day] = date.split("-");
  const universalDayLabel = profile.universalDayMaster
    ? `${profile.universalDayMaster}/${profile.universalDayRoot}`
    : `${profile.universalDayCompound}/${profile.universalDayRoot}`;
  const calendarDayLabel = `${profile.calendarDayCompound}/${profile.calendarDayRoot}`;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a1628] p-5">
      <div className="mb-4 text-center font-mono">
        <div className="mb-1 text-xs tracking-[0.3em] text-white/30">{month} · {day} · {date.split("-")[0]}</div>
        <div className="mb-1 text-[10px] text-white/20">{profile.universalDayTrace[0]}</div>
        <div className="text-2xl font-black tracking-wider text-violet-300">{universalDayLabel}</div>
        <div className="mt-1 text-[9px] text-white/25">Universal Day</div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-violet-400/20 bg-violet-500/5 p-3">
          <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-violet-400/60">Primary Current</div>
          <div className="space-y-1.5">
            <Row label="Universal Day" value={universalDayLabel} highlight />
            <Row label="Primary Family" value={`[${profile.primaryFamily.join(" · ")}]`} />
            <Row label="Balancing" value={String(profile.balancingComplement)} />
            <Row label="Countercurrent" value={String(profile.countercurrent)} dim />
          </div>
        </div>
        <div className="rounded-xl border border-white/8 bg-white/3 p-3">
          <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-white/30">Secondary Current</div>
          <div className="space-y-1.5">
            <Row label="Calendar Day" value={calendarDayLabel} />
            <Row label="Secondary Family" value={`[${profile.secondaryFamily.join(" · ")}]`} />
            <Row label="Universal Month" value={String(profile.universalMonth)} />
            <Row label="Universal Year" value={String(profile.universalYear)} />
            <Row label="Structural Echo" value={profile.structuralEcho} dim />
            {profile.repeatedDigits.length > 0 && (
              <Row label="Repeated Digits" value={profile.repeatedDigits.map((item) => `${item.digit}×${item.count}`).join(", ")} dim />
            )}
          </div>
        </div>
      </div>

      {profile.interpretation && (
        <div className="mt-4 border-t border-white/8 pt-3">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-white/30">Reading the Current</div>
          <p className="text-[11px] leading-5 text-white/50">{profile.interpretation}</p>
        </div>
      )}
    </div>
  );
}

function rootMatches(root: number, limit = 99) {
  const values: number[] = [];
  for (let value = root; value <= limit; value += 9) {
    if (value > 0) values.push(value);
  }
  return values;
}

function DailyKeys({ profile }: { profile: DailyProfile }) {
  const keyJerseys: number[] = Array.from(new Set<number>(profile.primaryFamily.flatMap((root) => rootMatches(root, 49)))).sort((a, b) => a - b);
  return (
    <div className="rounded-2xl border border-violet-400/15 bg-gradient-to-br from-violet-500/8 to-[#0a1628] p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-violet-300/60">Numbers to watch</p>
          <h3 className="mt-1 text-sm font-black text-white/80">What aligns with today</h3>
        </div>
        <span className="rounded-lg bg-rose-500/10 px-2 py-1 font-mono text-[9px] text-rose-300/70">Counter: {profile.countercurrent}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/8 bg-white/3 p-3">
          <p className="text-[9px] uppercase tracking-wide text-white/30">Primary family</p>
          <p className="mt-1 font-mono text-lg font-black text-violet-200">{profile.primaryFamily.join(" · ")}</p>
          <p className="mt-2 text-[10px] leading-4 text-white/35">Life Path, Personal Day, jersey roots and batting positions connected to this family receive the strongest support.</p>
        </div>
        <div className="rounded-xl border border-white/8 bg-white/3 p-3">
          <p className="text-[9px] uppercase tracking-wide text-white/30">Matching jersey numbers</p>
          <p className="mt-1 font-mono text-[11px] font-bold leading-5 text-emerald-300/80">{keyJerseys.join(" · ")}</p>
          <p className="mt-2 text-[10px] leading-4 text-white/35">Balancing number {profile.balancingComplement} can support the current; root {profile.countercurrent} introduces tension.</p>
        </div>
      </div>
    </div>
  );
}

function PlayCard({ play }: { play: NumerologyPlay }) {
  const [expanded, setExpanded] = useState(false);
  const tier = scoreTier(play.finalScore);
  const positive = play.positiveSignals ?? [];
  const counter = play.counterSignals ?? [];
  const why = play.primaryPatternLabel || play.summary || positive[0]?.description;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0a1628]">
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/8 text-[10px] font-black text-white/40">{play.rank}</div>
        {play.playerId != null && typeof play.playerId === "number" && (
          <div className="shrink-0">
            <MlbPlayerHeadshot playerId={play.playerId} name={play.playerName} teamAbbreviation={play.team} size={42} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-white">{play.playerName}</span>
            <span className="text-xs text-white/35">{play.team} vs {play.opponent}</span>
            {play.jerseyNumber != null && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-bold text-white/50">#{play.jerseyNumber}</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <LineupBadge status={play.lineupStatus} />
            {play.battingOrder != null && <span className="text-[9px] text-white/30">Batting {play.battingOrder}</span>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-white/60">{play.recommendedMarket}</span>
            {play.odds != null && <span className="text-xs font-bold text-emerald-400">{play.odds}</span>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-2xl font-black tabular-nums ${tier.color}`}>{play.finalScore}</div>
          <div className="text-[8px] uppercase tracking-wide text-white/25">{tier.label}</div>
        </div>
      </div>

      {why && (
        <div className="border-t border-violet-400/10 bg-violet-500/4 px-4 py-2.5">
          <p className="text-[9px] font-bold uppercase tracking-wide text-violet-300/50">Why this player?</p>
          <p className="mt-1 text-[11px] leading-5 text-white/50">{why}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 border-t border-white/8 px-4 py-2.5">
        <div>
          <div className="mb-1 flex justify-between"><span className="text-[9px] text-white/30">Numerology</span><span className="text-[9px] font-bold text-violet-300">{play.numerologyScore}</span></div>
          <ScoreBar value={play.numerologyScore} barColor="bg-violet-400" />
        </div>
        <div>
          <div className="mb-1 flex justify-between"><span className="text-[9px] text-white/30">Baseball</span><span className="text-[9px] font-bold text-sky-300">{play.baseballScore}</span></div>
          <ScoreBar value={play.baseballScore} barColor="bg-sky-400" />
        </div>
      </div>

      {positive.length > 0 && (
        <div className="border-t border-white/8 px-4 py-2.5">
          <div className="flex flex-wrap gap-1.5">
            {positive.slice(0, 3).map((signal, index) => <SignalBadge key={`${signal.field}-${index}`} type={signal.type} />)}
            {counter.length > 0 && <SignalBadge type="countercurrent" />}
          </div>
        </div>
      )}

      <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}
        className="flex w-full items-center justify-between border-t border-white/8 px-4 py-2 text-[10px] font-semibold text-white/30 transition hover:text-white/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400">
        <span>Calculation trace</span>
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-white/8 px-4 pb-4 pt-3">
          {play.formula && <div className="rounded bg-white/5 px-3 py-2 font-mono text-[10px] text-white/40">{play.formula}</div>}
          {positive.map((signal, index) => <SignalContribution key={`positive-${signal.field}-${index}`} signal={signal} positive />)}
          {counter.map((signal, index) => <SignalContribution key={`counter-${signal.field}-${index}`} signal={signal} />)}
          {play.countercurrentExplanation && <p className="text-[9px] italic text-rose-300/50">{play.countercurrentExplanation}</p>}
          {(play.missingData?.length ?? 0) > 0 && (
            <div className="rounded bg-amber-500/10 px-3 py-1.5 text-[9px] text-amber-300/70">Missing data: {play.missingData?.join(", ")}</div>
          )}
        </div>
      )}
    </div>
  );
}

function SignalContribution({ signal, positive = false }: { signal: NumerologySignal; positive?: boolean }) {
  const magnitude = Math.min(100, Math.abs(signal.points) * 5);
  return (
    <div className={`rounded-lg px-3 py-2 ${positive ? "bg-white/4" : "bg-rose-500/8"}`}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <SignalBadge type={positive ? signal.type : "countercurrent"} />
        <span className={`text-[10px] font-semibold ${positive ? "text-white/70" : "text-rose-300"}`}>{signal.label}</span>
        <span className={`ml-auto font-mono text-[10px] font-bold ${positive ? "text-emerald-400" : "text-rose-400"}`}>{positive ? "+" : ""}{signal.points}</span>
      </div>
      <div className="h-1 rounded-full bg-white/8"><div className={`h-1 rounded-full ${positive ? "bg-emerald-400/70" : "bg-rose-400/70"}`} style={{ width: `${magnitude}%` }} /></div>
      <p className={`mt-1.5 text-[9px] ${positive ? "text-white/35" : "text-rose-300/50"}`}>{signal.description}</p>
    </div>
  );
}

function WatchlistRow({ play }: { play: WatchlistPlay }) {
  const tier = scoreTier(play.finalScore);
  return (
    <div className="flex items-center gap-3 border-b border-white/8 py-2.5 last:border-0">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/6 text-[9px] font-black text-white/35">{play.rank}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5"><span className="text-[11px] font-semibold text-white/75">{play.playerName}</span><span className="text-[9px] text-white/30">{play.team} vs {play.opponent}</span>{play.jerseyNumber != null && <span className="text-[9px] text-white/25">#{play.jerseyNumber}</span>}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5"><span className="text-[9px] text-white/40">{play.recommendedMarket}</span><LineupBadge status={play.lineupStatus} /></div>
        {play.primarySignal && <p className="mt-0.5 truncate text-[9px] text-white/25">{play.primarySignal}</p>}
      </div>
      <span className={`font-mono text-sm font-black tabular-nums ${tier.color}`}>{play.finalScore}</span>
    </div>
  );
}

function buildExplorer(data: ExtendedNumerologyData): ExplorerPlay[] {
  const rows: ExplorerPlay[] = [];
  const add = (play: NumerologyPlay | WatchlistPlay, source: ExplorerPlay["source"]) => {
    const key = `${play.playerName}-${play.team}-${play.recommendedMarket}`;
    if (rows.some((row) => row.key === key)) return;
    rows.push({
      key,
      playerName: play.playerName,
      team: play.team,
      opponent: play.opponent,
      lineupStatus: play.lineupStatus,
      battingOrder: play.battingOrder,
      jerseyNumber: play.jerseyNumber,
      recommendedMarket: play.recommendedMarket,
      numerologyScore: play.numerologyScore,
      baseballScore: play.baseballScore,
      finalScore: play.finalScore,
      source,
    });
  };
  data.featuredPlays.forEach((play) => add(play, "Qualified"));
  data.bestAvailable?.forEach((play) => add(play, "Best available"));
  data.watchlist.forEach((play) => add(play, "Watchlist"));
  return rows;
}

function SlateSummary({ data, explorer }: { data: ExtendedNumerologyData; explorer: ExplorerPlay[] }) {
  const summary = data.evaluationSummary;
  const surfaced = explorer.length;
  const bestScore = summary?.maxScore ?? Math.max(0, ...explorer.map((play) => play.finalScore));
  const confirmed = summary?.confirmedLineups ?? explorer.filter((play) => play.lineupStatus === "confirmed").length;
  const projected = summary?.projectedLineups ?? explorer.filter((play) => ["projected", "morning_projected"].includes(play.lineupStatus)).length;
  const metrics = [
    { label: summary?.playersEvaluated != null ? "Players evaluated" : "Players surfaced", value: summary?.playersEvaluated ?? surfaced },
    { label: "Qualified plays", value: data.featuredPlays.length },
    { label: "Best score", value: bestScore },
    { label: "Countercurrents", value: summary?.countercurrentPlayers ?? data.countercurrents?.length ?? 0 },
    { label: "Confirmed", value: confirmed },
    { label: "Projected", value: projected },
  ];
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a1628] p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-xl border border-white/7 bg-white/3 px-3 py-3">
            <div className="font-mono text-xl font-black text-white/80">{metric.value}</div>
            <div className="mt-1 text-[9px] uppercase tracking-wide text-white/25">{metric.label}</div>
          </div>
        ))}
      </div>
      {!summary?.playersEvaluated && <p className="mt-3 text-[9px] italic text-white/20">Summary counts use the players surfaced in today’s published report. Full-slate totals appear when the generator publishes evaluation metadata.</p>}
    </div>
  );
}

function ScoreDistribution({ data, explorer }: { data: ExtendedNumerologyData; explorer: ExplorerPlay[] }) {
  const published = data.evaluationSummary?.scoreDistribution;
  const buckets: { label: string; count: number }[] = published
    ? Object.entries(published).map(([label, count]) => ({ label, count: Number(count) }))
    : [
        { label: "60+", count: explorer.filter((play) => play.finalScore >= 60).length },
        { label: "55–59", count: explorer.filter((play) => play.finalScore >= 55 && play.finalScore < 60).length },
        { label: "50–54", count: explorer.filter((play) => play.finalScore >= 50 && play.finalScore < 55).length },
        { label: "45–49", count: explorer.filter((play) => play.finalScore >= 45 && play.finalScore < 50).length },
        { label: "Below 45", count: explorer.filter((play) => play.finalScore < 45).length },
      ];
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  return (
    <div className="rounded-2xl border border-white/8 bg-[#0a1628] p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div><h3 className="text-sm font-black text-white/70">Score distribution</h3><p className="mt-1 text-[10px] text-white/25">How rare today’s highest alignments are.</p></div>
        <span className="text-[9px] text-white/20">{published ? "Full slate" : "Visible pool"}</span>
      </div>
      <div className="space-y-2.5">
        {buckets.map((bucket) => (
          <div key={bucket.label} className="grid grid-cols-[52px_1fr_28px] items-center gap-2">
            <span className="font-mono text-[9px] text-white/35">{bucket.label}</span>
            <div className="h-2 overflow-hidden rounded-full bg-white/6"><div className="h-full rounded-full bg-violet-400/60" style={{ width: `${(bucket.count / max) * 100}%` }} /></div>
            <span className="text-right font-mono text-[9px] font-bold text-white/50">{bucket.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataCompleteness({ explorer, data }: { explorer: ExplorerPlay[]; data: ExtendedNumerologyData }) {
  const profiles = data.evaluationSummary?.completeProfiles;
  const jersey = explorer.filter((play) => play.jerseyNumber != null).length;
  const batting = explorer.filter((play) => play.battingOrder != null).length;
  return (
    <div className="rounded-2xl border border-white/8 bg-[#0a1628] p-5">
      <h3 className="text-sm font-black text-white/70">Data completeness</h3>
      <p className="mt-1 text-[10px] text-white/25">Visibility into the inputs behind today’s report.</p>
      <div className="mt-4 space-y-2">
        {profiles != null && <CompletenessRow label="Complete player profiles" value={profiles} total={data.evaluationSummary?.playersEvaluated ?? profiles} />}
        <CompletenessRow label="Jersey numbers" value={jersey} total={Math.max(1, explorer.length)} />
        <CompletenessRow label="Batting-order positions" value={batting} total={Math.max(1, explorer.length)} />
        <CompletenessRow label="Known lineup status" value={explorer.filter((play) => play.lineupStatus !== "unknown").length} total={Math.max(1, explorer.length)} />
      </div>
    </div>
  );
}

function CompletenessRow({ label, value, total }: { label: string; value: number; total: number }) {
  const percentage = Math.round((value / Math.max(1, total)) * 100);
  return (
    <div>
      <div className="mb-1 flex justify-between text-[9px]"><span className="text-white/35">{label}</span><span className="font-mono text-white/50">{value}/{total}</span></div>
      <div className="h-1.5 rounded-full bg-white/6"><div className="h-1.5 rounded-full bg-sky-400/60" style={{ width: `${percentage}%` }} /></div>
    </div>
  );
}

function SlateExplorer({ rows }: { rows: ExplorerPlay[] }) {
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState("all");
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const [sort, setSort] = useState<SortMode>("final");
  const teams = useMemo(() => Array.from(new Set(rows.map((row) => row.team))).sort(), [rows]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows
      .filter((row) => team === "all" || row.team === team)
      .filter((row) => !confirmedOnly || row.lineupStatus === "confirmed")
      .filter((row) => !normalized || `${row.playerName} ${row.team} ${row.opponent} ${row.recommendedMarket}`.toLowerCase().includes(normalized))
      .sort((a, b) => {
        if (sort === "numerology") return b.numerologyScore - a.numerologyScore;
        if (sort === "baseball") return b.baseballScore - a.baseballScore;
        if (sort === "battingOrder") return (a.battingOrder ?? 99) - (b.battingOrder ?? 99);
        return b.finalScore - a.finalScore;
      });
  }, [confirmedOnly, query, rows, sort, team]);

  if (rows.length === 0) return null;
  return (
    <section>
      <SectionLabel>Slate Explorer</SectionLabel>
      <div className="rounded-2xl border border-white/8 bg-[#0a1628] p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-white/25" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search player, team or market"
              className="w-full rounded-lg border border-white/8 bg-white/4 py-2 pl-9 pr-3 text-[10px] text-white/70 outline-none placeholder:text-white/20 focus:border-violet-400/40" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <select value={team} onChange={(event) => setTeam(event.target.value)} className="rounded-lg border border-white/8 bg-[#0d1728] px-2 py-2 text-[10px] text-white/60 outline-none">
              <option value="all">All teams</option>{teams.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)} className="rounded-lg border border-white/8 bg-[#0d1728] px-2 py-2 text-[10px] text-white/60 outline-none">
              <option value="final">Final score</option><option value="numerology">Numerology</option><option value="baseball">Baseball</option><option value="battingOrder">Batting order</option>
            </select>
          </div>
        </div>
        <label className="mt-3 inline-flex items-center gap-2 text-[9px] text-white/35"><input type="checkbox" checked={confirmedOnly} onChange={(event) => setConfirmedOnly(event.target.checked)} className="accent-violet-500" /><Filter className="h-3 w-3" />Confirmed lineups only</label>
        <div className="mt-3 divide-y divide-white/6">
          {filtered.map((row) => (
            <div key={row.key} className="grid grid-cols-[1fr_auto] gap-3 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5"><span className="text-[11px] font-bold text-white/75">{row.playerName}</span><span className="text-[9px] text-white/25">{row.team} vs {row.opponent}</span><LineupBadge status={row.lineupStatus} /></div>
                <div className="mt-1 flex flex-wrap gap-2 text-[9px] text-white/30"><span>{row.recommendedMarket}</span><span>N:{row.numerologyScore}</span><span>B:{row.baseballScore}</span><span className="text-violet-300/50">{row.source}</span></div>
              </div>
              <span className={`font-mono text-base font-black ${scoreTier(row.finalScore).color}`}>{row.finalScore}</span>
            </div>
          ))}
          {filtered.length === 0 && <p className="py-6 text-center text-[10px] text-white/25">No players match these filters.</p>}
        </div>
      </div>
    </section>
  );
}

function ResearchLog({ data }: { data: ExtendedNumerologyData }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-[#0a1628] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-300/45">Research log</p><h3 className="mt-1 text-sm font-black text-white/70">Historical tracking status</h3></div>
        <span className="rounded bg-white/5 px-2 py-1 font-mono text-[9px] text-white/35">v{data.methodologyVersion}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-white/7 bg-white/3 p-3"><p className="text-[9px] text-white/25">Current date</p><p className="mt-1 font-mono text-xs font-bold text-white/60">{data.date}</p></div>
        <div className="rounded-xl border border-white/7 bg-white/3 p-3"><p className="text-[9px] text-white/25">Qualified today</p><p className="mt-1 font-mono text-xs font-bold text-white/60">{data.featuredPlays.length}</p></div>
      </div>
      <p className="mt-3 text-[10px] leading-5 text-white/30">Daily outputs are versioned so future hit-rate and ROI summaries can separate qualified plays from best-available alignments. No performance claim is shown until graded outcomes and a meaningful sample are available.</p>
    </div>
  );
}

function MethodologyLedger({ version, weights }: { version: string; weights?: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-white/8 bg-[#0a1628]">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full items-center justify-between px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400">
        <span className="text-sm font-bold text-white/50">The Methodology Ledger</span>{open ? <ChevronUp className="h-4 w-4 text-white/30" /> : <ChevronDown className="h-4 w-4 text-white/30" />}
      </button>
      {open && (
        <div className="space-y-3 border-t border-white/8 px-5 pb-5 pt-4 text-[11px] leading-5 text-white/40">
          <div><span className="font-semibold text-white/60">Version:</span> {version}</div>
          <div><span className="font-semibold text-white/60">Primary Universal Day:</span> Full-date digit sum. Master numbers 11, 22 and 33 are preserved.</div>
          <div><span className="font-semibold text-white/60">Final Score Formula:</span> 60% Numerology Resonance + 40% Baseball Opportunity.</div>
          <div><span className="font-semibold text-white/60">Numerology system:</span> Pythagorean.</div>
          <div><span className="font-semibold text-white/60">Balancing complement:</span> Model-defined as the number completing 10.</div>
          <div><span className="font-semibold text-white/60">Countercurrent:</span> Model-defined as 9 minus the root. It indicates tension, not predicted failure.</div>
          <p className="italic text-white/25">Numerology traditions are not fully standardized. This model uses a fixed, versioned rule set so every slate is evaluated consistently.</p>
          <p className="text-white/25">Patterns are documented, not guaranteed. Alignment is not probability.</p>
          {weights && <details><summary className="cursor-pointer text-white/35 hover:text-white/60">Signal weights</summary><div className="mt-2 space-y-0.5 font-mono text-[9px] text-white/30">{Object.entries(weights).filter(([key]) => !["numerologyWeight", "baseballWeight"].includes(key)).map(([key, value]) => <div key={key} className="flex justify-between gap-4"><span>{key}</span><span>{value}</span></div>)}</div></details>}
        </div>
      )}
    </div>
  );
}

export default function MlbNumerologyPage() {
  usePageSeo({
    title: "MLB Numerical Alignment | JoeKnowsBall",
    description: "Experimental daily numerical alignment analysis for MLB player props.",
    path: "/mlb/numerology",
    noindex: true,
  });

  const { data: rawData, loading, error, isStale } = useMLBNumerology();
  const data = rawData as ExtendedNumerologyData | null;
  const etDate = getEtDate();
  const explorer = useMemo(() => data ? buildExplorer(data) : [], [data]);

  return (
    <SiteShell>
      <main className="relative min-h-screen" style={{ background: "linear-gradient(150deg,#04080f 0%,#090f1e 40%,#0b0b16 100%)" }}>
        <div className="pointer-events-none absolute inset-0 overflow-hidden select-none" aria-hidden><div className="absolute left-[-2%] top-[8%] text-[30vw] font-black leading-none text-white/[0.015]">3</div><div className="absolute bottom-[10%] right-[-2%] text-[25vw] font-black leading-none text-white/[0.012]">9</div></div>
        <div className="relative mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <Link to="/mlb" className="mb-6 inline-flex items-center gap-1.5 text-[10px] font-semibold text-white/20 transition hover:text-white/50">← MLB</Link>

          <div className="mb-7">
            <div className="mb-3 flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-full border border-violet-400/20 bg-violet-500/8 text-[10px] font-black text-violet-300/70">369</div><div><p className="text-[9px] font-bold uppercase tracking-[0.22em] text-violet-400/50">Hidden Channel</p><h1 className="text-lg font-black tracking-tight text-white">MLB Numerical Alignment</h1></div></div>
            <p className="mb-1 text-xs text-white/30">Patterns beneath the slate.</p>
            <p className="mb-3 text-[10px] italic text-white/20">The model does not claim causation. It records recurrence.</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[9px] text-white/25"><span>Date: {etDate}</span><span>Scheduled: {data?.scheduledFor ?? "09:36 ET"}</span>{data?.generatedAt && <span>Updated: {new Date(data.generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET</span>}{data?.methodologyVersion && <span>v{data.methodologyVersion}</span>}{data?.dataStatus && <span className="capitalize text-amber-400/60">{data.dataStatus.replace(/_/g, " ")}</span>}</div>
            {(data?.dataStatus === "morning_projected" || isStale) && <div className="mt-3 rounded-lg border border-amber-400/15 bg-amber-400/5 px-3 py-2 text-[10px] text-amber-300/70">{isStale ? "⚠️ Previous Analysis — today's alignment has not been generated yet." : "⏳ Morning analysis — batting orders may be projected. Lineup confirmation pending."}</div>}
            <p className="mt-3 rounded-lg border border-white/6 bg-white/3 px-3 py-2 text-[10px] text-white/30">This experimental feature analyzes numerical patterns for research and entertainment. It does not guarantee player performance.</p>
          </div>

          {loading && <div className="space-y-3">{[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl bg-white/4" />)}</div>}
          {error && !loading && <div className="rounded-xl border border-rose-500/20 bg-rose-500/8 px-4 py-8 text-center"><p className="text-sm text-rose-300">Today's numerical alignment analysis is not available yet.</p><p className="mt-1 text-[9px] text-rose-300/40">{error}</p></div>}
          {!loading && !error && !data && <div className="rounded-xl border border-white/8 bg-[#0a1628] px-4 py-10 text-center text-sm text-white/25">Today's numerical alignment analysis is not available yet.</div>}

          {!loading && !error && data && (
            <div className="space-y-6">
              <section><SectionLabel>Daily Slate Summary</SectionLabel><SlateSummary data={data} explorer={explorer} /></section>
              <section><SectionLabel>Today's Key Numbers</SectionLabel><DailyKeys profile={data.dailyProfile} /></section>
              <section><SectionLabel>The Daily Code</SectionLabel><DailyCode profile={data.dailyProfile} date={data.date} /></section>
              <section><SectionLabel>Slate Shape</SectionLabel><div className="grid gap-3 md:grid-cols-2"><ScoreDistribution data={data} explorer={explorer} /><DataCompleteness data={data} explorer={explorer} /></div></section>

              {data.featuredPlays.length > 0 && <section><SectionLabel>Highest Alignment</SectionLabel><div className="space-y-3">{data.featuredPlays.map((play) => <PlayCard key={`${play.rank}-${play.playerName}`} play={play} />)}</div></section>}
              {data.featuredPlays.length === 0 && (data.bestAvailable?.length ?? 0) > 0 && <section><SectionLabel>Best Available Alignments</SectionLabel><div className="mb-3 rounded-lg border border-amber-400/15 bg-amber-400/5 px-3 py-2 text-[10px] text-amber-300/70">Best available today — below the featured-play threshold (60). No player on today's slate has reached qualifying alignment.</div><div className="space-y-3">{data.bestAvailable!.map((play) => <PlayCard key={`ba-${play.rank}-${play.playerName}`} play={play} />)}</div></section>}
              {data.featuredPlays.length === 0 && !(data.bestAvailable?.length) && <div className="rounded-xl border border-white/8 bg-[#0a1628] px-4 py-8 text-center text-xs text-white/25">No featured plays available. Check back after the morning model run.</div>}

              {(data.countercurrents?.length ?? 0) > 0 && <section><SectionLabel>Countercurrents</SectionLabel><p className="mb-3 text-[10px] text-white/30">Conflicting or opposing patterns. These are not predicted failures — they represent tension between numerical fields and baseball opportunity.</p><div className="rounded-2xl border border-rose-500/15 bg-[#0a1628] px-4 py-1">{data.countercurrents!.map((item, index) => <div key={`${item.playerName}-${index}`} className="flex items-center justify-between gap-3 border-b border-white/6 py-2.5 last:border-0"><div><span className="text-[11px] font-semibold text-white/60">{item.playerName}</span><span className="ml-2 text-[9px] text-white/25">{item.team}</span></div><div className="flex items-center gap-3 font-mono text-[9px]"><span className="text-violet-300/60">N:{item.numerologyScore}</span><span className="text-sky-300/60">B:{item.baseballScore}</span><span className="text-white/40">{item.finalScore}</span></div></div>)}</div></section>}
              {data.watchlist.length > 0 && <section><SectionLabel>Numerical Watchlist</SectionLabel><div className="rounded-2xl border border-white/8 bg-[#0a1628] px-4 py-1">{data.watchlist.map((play) => <WatchlistRow key={`${play.rank}-${play.playerName}`} play={play} />)}</div></section>}

              <SlateExplorer rows={explorer} />
              <section><SectionLabel>Research and Calibration</SectionLabel><ResearchLog data={data} /></section>
              {data.narrative?.closingObservation && <p className="px-4 text-center text-[10px] italic text-white/25">{data.narrative.closingObservation}</p>}
              <section><MethodologyLedger version={data.methodologyVersion} weights={data.scoringConfiguration?.weights} /></section>
              <p className="text-center text-[9px] text-white/15">Strong numerical overlap can coexist with poor baseball opportunity. Unknown data is shown as unknown.</p>
            </div>
          )}
        </div>
      </main>
    </SiteShell>
  );
}
