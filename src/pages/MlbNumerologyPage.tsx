import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  BookOpen,
  Calculator,
  ChevronDown,
  ChevronUp,
  Eye,
  Filter,
  LayoutDashboard,
  Search,
  Star,
  TrendingUp,
} from "lucide-react";
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

type NumberMatch = {
  field: string;
  value: number;
  root?: number;
  label: string;
};

type NumberMatchPlayer = {
  playerId?: number | null;
  playerName: string;
  team: string;
  opponent: string;
  opposingPitcher?: string | null;
  lineupStatus: NumerologyPlay["lineupStatus"];
  battingOrder?: number | null;
  jerseyNumber?: number | null;
  numerologyScore: number;
  baseballScore: number | null;
  matches: NumberMatch[];
  candidateSource?: string;
  recommendedMarket?: string;
  marketScore?: number | null;
};

type ExtendedNumerologyData = NumerologyDailyData & {
  exactNumberMatches?: NumberMatchPlayer[];
  rootNumberMatches?: NumberMatchPlayer[];
  bestAvailable?: NumerologyPlay[];
  rankingBasis?: string;
  baseballContextOnly?: boolean;
  candidatePool?: {
    description?: string;
    eligiblePlayerCount?: number;
    evaluatedPlayerCount?: number;
  };
  evaluationSummary?: {
    playersEvaluated?: number;
    confirmedLineups?: number;
    projectedLineups?: number;
    countercurrentPlayers?: number;
    maxScore?: number;
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
  baseballScore: number | null;
  source: "Qualified" | "Best available" | "Watchlist";
};

type SortMode = "numerology" | "baseball" | "battingOrder";

const cardClass =
  "rounded-xl border border-[#1c223d] bg-[rgba(18,22,38,0.82)] shadow-[0_16px_45px_rgba(0,0,0,0.18)] backdrop-blur-md";

const sectionLinks = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "exact-matches", label: "Exact Matches", icon: Star },
  { id: "root-matches", label: "Root Matches", icon: Calculator },
  { id: "top-alignments", label: "Top Alignments", icon: TrendingUp },
  { id: "watchlist", label: "Watchlist", icon: Eye },
  { id: "explorer", label: "Explorer", icon: Search },
  { id: "methodology", label: "Methodology", icon: BookOpen },
];

function getEtDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDate(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  return parsed.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

function scoreTier(score: number) {
  if (score >= 85) return { label: "Elite Alignment", color: "text-[#d0bcff]" };
  if (score >= 75) return { label: "Strong Alignment", color: "text-emerald-300" };
  if (score >= 60) return { label: "Qualified Alignment", color: "text-[#89ceff]" };
  return { label: "Watchlist", color: "text-slate-400" };
}

const SIGNAL_STYLES: Record<string, { className: string; label: string }> = {
  primary_exact_master: { className: "bg-violet-500/20 text-violet-200", label: "Exact Master" },
  primary_exact_root: { className: "bg-violet-400/15 text-violet-200", label: "Exact Primary" },
  primary_root: { className: "bg-sky-500/15 text-sky-200", label: "Root Match" },
  secondary_exact: { className: "bg-indigo-500/15 text-indigo-200", label: "Calendar Exact" },
  secondary_root: { className: "bg-slate-500/15 text-slate-300", label: "Secondary Root" },
  family_support: { className: "bg-emerald-500/15 text-emerald-300", label: "Family" },
  personal_cycle: { className: "bg-teal-500/15 text-teal-200", label: "Personal Cycle" },
  name_resonance: { className: "bg-amber-500/15 text-amber-200", label: "Name Resonance" },
  contextual_echo: { className: "bg-stone-500/15 text-stone-300", label: "Echo" },
  countercurrent: { className: "bg-rose-500/15 text-rose-200", label: "Countercurrent" },
};

function SignalBadge({ type }: { type: string }) {
  const style = SIGNAL_STYLES[type] ?? SIGNAL_STYLES.family_support;
  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${style.className}`}>
      {style.label}
    </span>
  );
}

function LineupBadge({ status }: { status: NumerologyPlay["lineupStatus"] }) {
  const styles: Record<string, { className: string; label: string }> = {
    confirmed: { className: "bg-emerald-500/15 text-emerald-300", label: "Confirmed" },
    projected: { className: "bg-sky-500/15 text-sky-300", label: "Projected" },
    morning_projected: { className: "bg-amber-500/15 text-amber-300", label: "Morning projected" },
    not_starting: { className: "bg-rose-500/15 text-rose-300", label: "Not starting" },
    unknown: { className: "bg-white/5 text-white/45", label: "Unconfirmed" },
  };
  const style = styles[status] ?? styles.unknown;
  return <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${style.className}`}>{style.label}</span>;
}

function SectionHeading({ eyebrow, title, description, icon }: { eyebrow: string; title: string; description?: string; icon?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="mb-1 flex items-center gap-2 text-[#d0bcff]">
          {icon}
          <span className="text-[11px] font-bold uppercase tracking-[0.16em]">{eyebrow}</span>
        </div>
        <h2 className="text-xl font-semibold text-[#e2e1ee]">{title}</h2>
        {description && <p className="mt-1 max-w-3xl text-sm leading-6 text-[#cbc3d7]/65">{description}</p>}
      </div>
    </div>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#cbc3d7]/55">{label}</p>
      <div className={`mt-1 font-mono text-base font-semibold ${accent ? "text-[#d0bcff]" : "text-[#e2e1ee]"}`}>{value}</div>
    </div>
  );
}

function DailyOverview({ profile, date }: { profile: DailyProfile; date: string }) {
  const universal = profile.universalDayMaster
    ? `${profile.universalDayMaster}/${profile.universalDayRoot}`
    : profile.universalDayRawSum > 9
      ? `${profile.universalDayRawSum}/${profile.universalDayRoot}`
      : String(profile.universalDayRoot);
  const calendar = `${profile.calendarDayCompound}/${profile.calendarDayRoot}`;

  return (
    <section id="overview" className="scroll-mt-28">
      <SectionHeading eyebrow="Daily current" title="Today’s numerical environment" icon={<Eye className="h-4 w-4" />} />
      <div className="grid gap-5 md:grid-cols-2">
        <div className={`${cardClass} relative overflow-hidden p-6`}>
          <div className="pointer-events-none absolute -right-5 -top-8 text-[130px] leading-none text-[#d0bcff]/[0.035]">𓂀</div>
          <p className="border-b border-[#494454]/35 pb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#e9c349]">Core frequencies</p>
          <div className="mt-5 flex flex-wrap items-end gap-3">
            <span className="font-serif text-5xl font-bold tracking-tight text-[#d0bcff]">{universal}</span>
            <span className="pb-1 text-lg font-semibold text-[#cbc3d7]">Universal Day</span>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-5">
            <Stat label="Calculation formula" value={profile.universalDayTrace[0] ?? "N/A"} />
            <Stat label="Calendar day" value={calendar} />
            <Stat label="Structural echo" value={profile.structuralEcho} />
            <Stat label="Slate date" value={formatDate(date)} />
          </div>
          <div className="mt-6 rounded-lg border border-[#d0bcff]/15 bg-[#0c0e16] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#d0bcff]">Primary family</p>
            <p className="mt-2 font-mono text-2xl font-semibold tracking-[0.35em] text-[#d0bcff]">{profile.primaryFamily.join(" · ")}</p>
          </div>
        </div>

        <div className={`${cardClass} p-6`}>
          <p className="border-b border-[#494454]/35 pb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#e9c349]">Energy balancing</p>
          <div className="mt-5 grid grid-cols-2 gap-5">
            <Stat label="Secondary family" value={profile.secondaryFamily.join(" · ")} />
            <Stat label="Balancing complement" value={profile.balancingComplement} accent />
            <Stat label="Countercurrent" value={<span className="text-rose-300">{profile.countercurrent}</span>} />
            <Stat label="Repeated digits" value={profile.repeatedDigits.length ? profile.repeatedDigits.map((item) => `${item.digit}×${item.count}`).join(", ") : "None"} />
            <Stat label="Universal month" value={profile.universalMonth} />
            <Stat label="Universal year" value={profile.universalYear} />
          </div>
          {profile.interpretation && (
            <blockquote className="mt-6 rounded-lg border-l-2 border-[#e9c349] bg-[#33343e]/35 p-4 text-sm italic leading-6 text-[#cbc3d7]/75">
              “{profile.interpretation}”
            </blockquote>
          )}
        </div>
      </div>
    </section>
  );
}

function NumberMatchSection({ players, accent }: { players: NumberMatchPlayer[]; accent: "exact" | "root" }) {
  const [expanded, setExpanded] = useState(accent === "exact");
  const exact = accent === "exact";
  const visible = expanded ? players : players.slice(0, 9);
  const sectionId = exact ? "exact-matches" : "root-matches";

  return (
    <section id={sectionId} className="scroll-mt-28">
      <SectionHeading
        eyebrow={exact ? "Direct daily-number matches" : "Reduced-root matches"}
        title={exact ? "Exact Number Matches" : "Reduced-Root Matches"}
        description={exact
          ? "Direct compound-number connections to today’s code. Exact matches remain distinct from values that only reduce to the same root."
          : "Players whose jersey, personal-cycle, life-path, batting-order, or other eligible number reduces to today’s root."}
        icon={exact ? <Star className="h-4 w-4 text-[#e9c349]" /> : <Calculator className="h-4 w-4" />}
      />
      <div className="mb-4 flex justify-end">
        <span className={`rounded-full px-3 py-1 font-mono text-xs font-bold ${exact ? "bg-[#e9c349]/10 text-[#e9c349]" : "bg-[#d0bcff]/10 text-[#d0bcff]"}`}>{players.length} players</span>
      </div>
      {players.length === 0 ? (
        <div className={`${cardClass} border-dashed px-5 py-10 text-center text-sm text-[#cbc3d7]/55`}>No players match this level on today’s eligible game-team rosters.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((player) => (
            <article key={`${player.playerName}-${player.team}`} className={`${cardClass} overflow-hidden border-l-4 ${exact ? "border-l-[#e9c349] shadow-[0_0_18px_rgba(212,175,55,0.08)]" : "border-l-[#a078ff] shadow-[0_0_18px_rgba(139,92,246,0.08)]"}`}>
              <div className="p-5">
                <div className="flex items-start gap-3">
                  {player.playerId != null && <MlbPlayerHeadshot playerId={player.playerId} name={player.playerName} teamAbbreviation={player.team} size={48} />}
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-lg font-semibold text-[#e2e1ee]">{player.playerName}</h3>
                    <p className="mt-0.5 text-sm text-[#cbc3d7]/65">{player.team} vs {player.opponent}</p>
                    {player.opposingPitcher && <p className="mt-1 truncate text-xs text-[#cbc3d7]/45">vs {player.opposingPitcher}</p>}
                  </div>
                  {player.jerseyNumber != null && <span className="rounded bg-white/5 px-2 py-1 font-mono text-xs text-white/60">#{player.jerseyNumber}</span>}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {player.matches.map((match) => (
                    <span key={`${match.field}-${match.label}`} className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${exact ? "bg-[#e9c349]/12 text-[#ffe088]" : "bg-[#d0bcff]/12 text-[#d0bcff]"}`}>{match.label}</span>
                  ))}
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-[#d0bcff]/15 bg-[#d0bcff]/5 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[#d0bcff]">Numerology</p>
                    <p className="mt-1 font-mono text-xl font-semibold text-[#d0bcff]">{player.numerologyScore}</p>
                  </div>
                  <div className="rounded-lg border border-[#89ceff]/15 bg-[#89ceff]/5 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[#89ceff]">Baseball context</p>
                    <p className="mt-1 font-mono text-xl font-semibold text-[#89ceff]">{player.baseballScore ?? "N/A"}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[#cbc3d7]/55">
                  <LineupBadge status={player.lineupStatus} />
                  {player.battingOrder != null && <span>Batting #{player.battingOrder}</span>}
                  {player.recommendedMarket && <span>{player.recommendedMarket}</span>}
                  {player.candidateSource === "team_40_man_roster" && <span className="text-amber-200/60">40-man roster</span>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {players.length > 9 && (
        <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-4 w-full rounded-lg border border-[#494454] bg-[#1d1f28] px-4 py-3 text-sm font-semibold text-[#cbc3d7] transition hover:border-[#a078ff] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d0bcff]">
          {expanded ? "Show fewer" : `Show all ${players.length} players`}
        </button>
      )}
    </section>
  );
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  return <div className="h-1.5 overflow-hidden rounded-full bg-white/5"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;
}

function SignalContribution({ signal, positive = false }: { signal: NumerologySignal; positive?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${positive ? "border-emerald-400/10 bg-emerald-400/5" : "border-rose-400/10 bg-rose-400/5"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <SignalBadge type={positive ? signal.type : "countercurrent"} />
        <span className="text-sm font-semibold text-[#e2e1ee]">{signal.label}</span>
        <span className={`ml-auto font-mono text-sm font-bold ${positive ? "text-emerald-300" : "text-rose-300"}`}>{positive ? "+" : ""}{signal.points}</span>
      </div>
      <p className="mt-2 text-xs leading-5 text-[#cbc3d7]/60">{signal.description}</p>
    </div>
  );
}

function PlayCard({ play }: { play: NumerologyPlay }) {
  const [expanded, setExpanded] = useState(false);
  const tier = scoreTier(play.numerologyScore);
  const positive = play.positiveSignals ?? [];
  const counter = play.counterSignals ?? [];
  const why = play.primaryPatternLabel || play.summary || positive[0]?.description;

  return (
    <article className={`${cardClass} overflow-hidden`}>
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/5 font-mono text-xs font-bold text-white/55">{play.rank}</div>
          {play.playerId != null && typeof play.playerId === "number" && <MlbPlayerHeadshot playerId={play.playerId} name={play.playerName} teamAbbreviation={play.team} size={48} />}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-[#e2e1ee]">{play.playerName}</h3>
              <span className="text-sm text-[#cbc3d7]/55">{play.team} vs {play.opponent}</span>
              {play.jerseyNumber != null && <span className="rounded bg-white/5 px-2 py-1 font-mono text-xs text-white/55">#{play.jerseyNumber}</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2"><LineupBadge status={play.lineupStatus} />{play.battingOrder != null && <span className="text-xs text-[#cbc3d7]/50">Batting {play.battingOrder}</span>}<span className="text-sm text-[#cbc3d7]/70">{play.recommendedMarket}</span>{play.odds != null && <span className="font-mono text-sm font-bold text-emerald-300">{play.odds}</span>}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className={`font-mono text-3xl font-bold ${tier.color}`}>{play.numerologyScore}</div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-white/35">{tier.label}</div>
          </div>
        </div>
        {why && <div className="mt-4 rounded-lg border border-[#d0bcff]/10 bg-[#d0bcff]/5 p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-[#d0bcff]">Why this player?</p><p className="mt-2 text-sm leading-6 text-[#cbc3d7]/70">{why}</p></div>}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><div className="mb-2 flex justify-between text-xs"><span className="text-[#cbc3d7]/55">Numerology alignment</span><span className="font-mono font-bold text-[#d0bcff]">{play.numerologyScore}</span></div><ScoreBar value={play.numerologyScore} color="bg-[#a078ff]" /></div>
          <div><div className="mb-2 flex justify-between text-xs"><span className="text-[#cbc3d7]/55">Baseball context · not ranked</span><span className="font-mono font-bold text-[#89ceff]">{play.baseballScore ?? "N/A"}</span></div><ScoreBar value={play.baseballScore ?? 0} color="bg-[#009ada]" /></div>
        </div>
        {(positive.length > 0 || counter.length > 0) && <div className="mt-4 flex flex-wrap gap-2">{positive.slice(0, 4).map((signal, index) => <SignalBadge key={`${signal.field}-${index}`} type={signal.type} />)}{counter.length > 0 && <SignalBadge type="countercurrent" />}</div>}
      </div>
      <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} className="flex w-full items-center justify-between border-t border-[#494454]/35 px-5 py-3 text-sm font-semibold text-[#cbc3d7]/60 transition hover:bg-white/[0.025] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d0bcff]">
        <span>Calculation trace</span>{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {expanded && <div className="space-y-3 border-t border-[#494454]/35 px-5 py-4">{play.formula && <div className="rounded-lg bg-[#0c0e16] p-3 font-mono text-xs text-[#cbc3d7]/65">{play.formula}</div>}{positive.map((signal, index) => <SignalContribution key={`p-${signal.field}-${index}`} signal={signal} positive />)}{counter.map((signal, index) => <SignalContribution key={`c-${signal.field}-${index}`} signal={signal} />)}{(play.missingData?.length ?? 0) > 0 && <div className="rounded-lg border border-amber-400/15 bg-amber-400/5 p-3 text-xs text-amber-200/75">Missing data: {play.missingData?.join(", ")}</div>}</div>}
    </article>
  );
}

function WatchlistRow({ play }: { play: WatchlistPlay }) {
  return (
    <div className="flex items-center gap-3 border-b border-[#494454]/25 px-4 py-4 last:border-0">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/5 font-mono text-xs font-bold text-white/45">{play.rank}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-[#e2e1ee]">{play.playerName}</span><span className="text-xs text-[#cbc3d7]/50">{play.team} vs {play.opponent}</span><LineupBadge status={play.lineupStatus} /></div>
        <div className="mt-1 flex flex-wrap gap-2 text-xs text-[#cbc3d7]/55"><span>{play.recommendedMarket}</span>{play.primarySignal && <span>• {play.primarySignal}</span>}</div>
      </div>
      <span className={`font-mono text-lg font-bold ${scoreTier(play.numerologyScore).color}`}>{play.numerologyScore}</span>
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
      baseballScore: play.baseballScore ?? null,
      source,
    });
  };
  data.featuredPlays.forEach((play) => add(play, "Qualified"));
  data.bestAvailable?.forEach((play) => add(play, "Best available"));
  data.watchlist.forEach((play) => add(play, "Watchlist"));
  return rows;
}

function SlateExplorer({ rows }: { rows: ExplorerPlay[] }) {
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState("all");
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const [sort, setSort] = useState<SortMode>("numerology");
  const teams = useMemo(() => Array.from(new Set(rows.map((row) => row.team))).sort(), [rows]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...rows]
      .filter((row) => team === "all" || row.team === team)
      .filter((row) => !confirmedOnly || row.lineupStatus === "confirmed")
      .filter((row) => !normalized || `${row.playerName} ${row.team} ${row.opponent} ${row.recommendedMarket}`.toLowerCase().includes(normalized))
      .sort((a, b) => {
        if (sort === "numerology") return b.numerologyScore - a.numerologyScore;
        if (sort === "baseball") return (b.baseballScore ?? -1) - (a.baseballScore ?? -1);
        return (a.battingOrder ?? 99) - (b.battingOrder ?? 99);
      });
  }, [confirmedOnly, query, rows, sort, team]);

  if (rows.length === 0) return null;
  return (
    <section id="explorer" className="scroll-mt-28">
      <SectionHeading eyebrow="Search and compare" title="Player Explorer" icon={<Search className="h-4 w-4" />} />
      <div className={`${cardClass} overflow-hidden`}>
        <div className="grid gap-3 border-b border-[#494454]/35 bg-[#191b24] p-4 md:grid-cols-[1fr_auto_auto]">
          <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search player, team, opponent or market" className="w-full rounded-lg border border-[#494454] bg-[#1d1f28] py-2.5 pl-10 pr-3 text-sm text-[#e2e1ee] outline-none placeholder:text-white/30 focus:border-[#a078ff]" /></label>
          <select value={team} onChange={(event) => setTeam(event.target.value)} className="rounded-lg border border-[#494454] bg-[#1d1f28] px-3 py-2.5 text-sm text-[#e2e1ee] outline-none focus:border-[#a078ff]"><option value="all">All teams</option>{teams.map((value) => <option key={value} value={value}>{value}</option>)}</select>
          <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)} className="rounded-lg border border-[#494454] bg-[#1d1f28] px-3 py-2.5 text-sm text-[#e2e1ee] outline-none focus:border-[#a078ff]"><option value="numerology">Numerology alignment</option><option value="baseball">Baseball context</option><option value="battingOrder">Batting order</option></select>
          <label className="flex items-center gap-2 text-xs text-[#cbc3d7]/60 md:col-span-3"><input type="checkbox" checked={confirmedOnly} onChange={(event) => setConfirmedOnly(event.target.checked)} className="accent-violet-500" /><Filter className="h-3.5 w-3.5" />Confirmed lineups only</label>
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-[#282a32]"><tr>{["Player", "Source", "Numerology", "Baseball context", "Batting", "Lineup", "Market"].map((label) => <th key={label} className="border-b border-[#494454] px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-[#cbc3d7]/55">{label}</th>)}</tr></thead>
            <tbody>{filtered.map((row) => <tr key={row.key} className="border-b border-[#494454]/20 transition hover:bg-white/[0.025]"><td className="px-4 py-3"><div className="font-semibold text-[#e2e1ee]">{row.playerName}</div><div className="text-xs text-[#cbc3d7]/45">{row.team} vs {row.opponent}{row.jerseyNumber != null ? ` · #${row.jerseyNumber}` : ""}</div></td><td className="px-4 py-3 text-xs text-[#d0bcff]">{row.source}</td><td className="px-4 py-3 font-mono font-bold text-[#d0bcff]">{row.numerologyScore}</td><td className="px-4 py-3 font-mono text-[#89ceff]">{row.baseballScore ?? "N/A"}</td><td className="px-4 py-3 text-sm text-[#cbc3d7]/65">{row.battingOrder ?? "N/A"}</td><td className="px-4 py-3"><LineupBadge status={row.lineupStatus} /></td><td className="px-4 py-3 text-sm text-[#cbc3d7]/65">{row.recommendedMarket}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="divide-y divide-[#494454]/25 md:hidden">{filtered.map((row) => <div key={row.key} className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold text-[#e2e1ee]">{row.playerName}</div><div className="mt-1 text-xs text-[#cbc3d7]/50">{row.team} vs {row.opponent}</div></div><span className="font-mono text-xl font-bold text-[#d0bcff]">{row.numerologyScore}</span></div><div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#cbc3d7]/55"><span>{row.source}</span><span>Baseball: {row.baseballScore ?? "N/A"}</span><LineupBadge status={row.lineupStatus} /><span>{row.recommendedMarket}</span></div></div>)}</div>
        {filtered.length === 0 && <p className="py-10 text-center text-sm text-[#cbc3d7]/45">No players match these filters.</p>}
      </div>
    </section>
  );
}

function MethodologyLedger({ data }: { data: ExtendedNumerologyData }) {
  const [open, setOpen] = useState(false);
  return (
    <section id="methodology" className="scroll-mt-28">
      <div className={`${cardClass} overflow-hidden`}>
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full items-center justify-between bg-[#282a32]/70 px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d0bcff]"><span className="flex items-center gap-3 text-lg font-semibold text-[#e2e1ee]"><BookOpen className="h-5 w-5 text-[#d0bcff]" />Methodology & data sources</span>{open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}</button>
        {open && <div className="space-y-4 border-t border-[#494454]/35 p-5 text-sm leading-6 text-[#cbc3d7]/70"><p><strong className="text-[#e2e1ee]">Ranking basis:</strong> Players are selected and ranked by deterministic numerology alignment only. Baseball scores are displayed as context and do not affect qualification, rank, featured status, watchlist status, or tie-breaking.</p><p><strong className="text-[#e2e1ee]">Exact matches:</strong> Direct compound-number connections are kept separate from reduced-root matches. Compound and master labels such as 24/6, 23/5, 22/4, and 11/2 remain intact.</p><p><strong className="text-[#e2e1ee]">Candidate pool:</strong> {data.candidatePool?.description ?? "Eligible non-pitchers on game-team rosters are evaluated using the versioned numerology rules."}</p><p><strong className="text-[#e2e1ee]">Generation:</strong> The report is generated daily at {data.scheduledFor}. Methodology version {data.methodologyVersion}. Narrative source: {data.narrativeSource}.</p><div className="rounded-lg bg-[#0c0e16] p-4 italic text-[#cbc3d7]/55">Patterns are documented for entertainment and research. Numerical alignment does not guarantee athletic performance or betting outcomes.</div></div>}
      </div>
    </section>
  );
}

function SectionNav() {
  return (
    <>
      <aside className="sticky top-24 hidden h-[calc(100vh-7rem)] w-56 shrink-0 self-start overflow-y-auto rounded-xl border border-[#1c223d] bg-[#191b24] p-3 lg:block">
        <div className="mb-5 px-3 pt-2"><div className="text-3xl text-[#d0bcff]">𓂀</div><p className="mt-2 font-serif text-xl font-semibold text-[#d0bcff]">MLB Numerology</p><p className="mt-1 text-xs text-[#cbc3d7]/45">Daily alignment dashboard</p></div>
        <nav className="space-y-1">{sectionLinks.map(({ id, label, icon: Icon }, index) => <a key={id} href={`#${id}`} className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition ${index === 0 ? "bg-[#a078ff] font-bold text-[#340080]" : "text-[#cbc3d7]/70 hover:bg-[#282a32] hover:text-white"}`}><Icon className="h-4 w-4" />{label}</a>)}</nav>
      </aside>
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex justify-around border-t border-[#494454]/40 bg-[#191b24]/95 px-2 py-2 backdrop-blur-xl lg:hidden">{sectionLinks.slice(0, 5).map(({ id, label, icon: Icon }) => <a key={id} href={`#${id}`} className="flex min-h-11 min-w-14 flex-col items-center justify-center gap-1 text-[#cbc3d7]/60 hover:text-[#d0bcff]"><Icon className="h-4 w-4" /><span className="text-[9px] font-bold uppercase tracking-wide">{label.replace(" Matches", "")}</span></a>)}</nav>
    </>
  );
}

export default function MlbNumerologyPage() {
  usePageSeo({
    title: "MLB Numerology | Joe Knows Ball",
    description: "Daily deterministic numerology alignment analysis across the MLB slate.",
    path: "/mlb/numerology",
    noindex: true,
  });

  const { data: rawData, loading, error, isStale } = useMLBNumerology();
  const data = rawData as ExtendedNumerologyData | null;
  const explorer = useMemo(() => (data ? buildExplorer(data) : []), [data]);
  const topPlays = data?.featuredPlays.length ? data.featuredPlays : (data?.bestAvailable ?? []);
  const updated = data?.generatedAt ? new Date(data.generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) : null;

  return (
    <SiteShell>
      <main className="min-h-screen bg-[#0a0c14] pb-24 text-[#e2e1ee] lg:pb-12">
        <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
          <Link to="/mlb" className="mb-5 inline-flex text-sm font-semibold text-[#cbc3d7]/55 transition hover:text-[#d0bcff]">← Back to MLB</Link>
          <div className="flex gap-6">
            <SectionNav />
            <div className="min-w-0 flex-1">
              <header className="mb-8 border-b border-[#494454]/45 pb-6">
                <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
                  <div>
                    <div className="mb-2 flex items-center gap-2 text-[#d0bcff]"><span className="text-2xl">𓂀</span><span className="text-[11px] font-bold uppercase tracking-[0.18em]">Sacred alignment</span></div>
                    <h1 className="font-serif text-4xl font-bold tracking-tight text-[#e2e1ee] sm:text-5xl">MLB Numerology</h1>
                    <p className="mt-2 text-base text-[#cbc3d7]/70">Daily numerical alignment across today’s MLB slate.</p>
                  </div>
                  <div className="flex flex-col gap-2 md:items-end">
                    <div className="flex flex-wrap gap-2">{data?.methodologyVersion && <span className="rounded border border-[#494454] bg-[#282a32] px-3 py-1 text-[10px] font-bold uppercase tracking-wide">Methodology v{data.methodologyVersion}</span>}{data?.dataStatus && <span className={`rounded px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${data.dataStatus === "confirmed" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-200"}`}>{data.dataStatus.replace(/_/g, " ")}</span>}</div>
                    <p className="font-mono text-xs text-[#cbc3d7]/55">{data ? formatDate(data.date) : getEtDate()}{updated && <> · Updated {updated} ET</>}</p>
                  </div>
                </div>
                <p className="mt-5 rounded-lg border border-[#d0bcff]/10 bg-[#d0bcff]/5 px-4 py-3 text-sm text-[#cbc3d7]/70"><strong className="text-[#d0bcff]">Numerology determines ranking.</strong> Baseball data is supplemental context only and never affects qualification or order.</p>
                {(isStale || data?.dataStatus === "morning_projected" || data?.dataStatus === "unavailable") && <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-400/15 bg-amber-400/5 px-4 py-3 text-sm text-amber-200/75"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{isStale ? "This report is from a previous slate. Today’s generation has not completed yet." : data?.dataStatus === "unavailable" ? "Some contextual data is unavailable, but the generated numerology profile and player matches below remain viewable." : "Morning analysis may use projected batting orders. Confirmed lineups can update later."}</span></div>}
              </header>

              {loading && <div className="grid gap-5 md:grid-cols-2">{[1, 2, 3, 4].map((item) => <div key={item} className="h-56 animate-pulse rounded-xl bg-[#191b24]" />)}</div>}
              {error && !loading && <div className={`${cardClass} border-rose-500/20 px-5 py-12 text-center`}><p className="text-lg font-semibold text-rose-200">Today’s numerical alignment analysis is not available yet.</p><p className="mt-2 text-sm text-rose-200/55">{error}</p></div>}
              {!loading && !error && !data && <div className={`${cardClass} px-5 py-12 text-center text-[#cbc3d7]/55`}>Today’s numerical alignment analysis is not available yet.</div>}

              {!loading && !error && data && <div className="space-y-12">
                <DailyOverview profile={data.dailyProfile} date={data.date} />
                <NumberMatchSection players={data.exactNumberMatches ?? []} accent="exact" />
                <NumberMatchSection players={data.rootNumberMatches ?? []} accent="root" />

                <section id="top-alignments" className="scroll-mt-28">
                  <SectionHeading eyebrow="Numerology-only ranking" title="Highest Aggregate Numerology Scores" description="The highest combined numerology-signal totals. Baseball opportunity remains visible as context but does not affect this order." icon={<TrendingUp className="h-4 w-4" />} />
                  {topPlays.length > 0 ? <div className="space-y-4">{topPlays.map((play) => <PlayCard key={`${play.rank}-${play.playerName}`} play={play} />)}</div> : <div className={`${cardClass} px-5 py-10 text-center text-sm text-[#cbc3d7]/45`}>No aggregate alignments are available yet. Exact and root matches above may still be available.</div>}
                </section>

                <section id="watchlist" className="scroll-mt-28">
                  <SectionHeading eyebrow="Supporting and opposing signals" title="Watchlist & Countercurrents" icon={<Eye className="h-4 w-4" />} />
                  <div className="grid gap-5 xl:grid-cols-2">
                    <div className={`${cardClass} overflow-hidden border-emerald-500/15`}><div className="flex items-center justify-between border-b border-emerald-500/15 bg-emerald-500/8 px-4 py-3"><span className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-emerald-300"><Eye className="h-4 w-4" />Numerical watchlist</span><span className="font-mono text-xs text-emerald-300/65">{data.watchlist.length}</span></div>{data.watchlist.length ? data.watchlist.map((play) => <WatchlistRow key={`${play.rank}-${play.playerName}`} play={play} />) : <p className="p-6 text-center text-sm text-[#cbc3d7]/45">No watchlist players today.</p>}</div>
                    <div className={`${cardClass} overflow-hidden border-rose-500/15`}><div className="flex items-center justify-between border-b border-rose-500/15 bg-rose-500/8 px-4 py-3"><span className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-rose-300"><AlertTriangle className="h-4 w-4" />Countercurrents</span><span className="font-mono text-xs text-rose-300/65">{data.countercurrents?.length ?? 0}</span></div>{(data.countercurrents?.length ?? 0) > 0 ? data.countercurrents!.map((item, index) => <div key={`${item.playerName}-${index}`} className="border-b border-[#494454]/25 p-4 last:border-0"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-[#e2e1ee]">{item.playerName}</p><p className="mt-1 text-xs text-[#cbc3d7]/45">{item.team}</p></div><span className="font-mono text-lg font-bold text-rose-300">{item.numerologyScore}</span></div><div className="mt-3 flex flex-wrap gap-2">{item.countercurrentSignals.map((signal, signalIndex) => <span key={`${signal.field}-${signalIndex}`} className="rounded-full bg-rose-500/10 px-2.5 py-1 text-[10px] text-rose-200">{signal.label}</span>)}</div></div>) : <p className="p-6 text-center text-sm text-[#cbc3d7]/45">No countercurrent players today.</p>}</div>
                  </div>
                </section>

                <SlateExplorer rows={explorer} />
                <MethodologyLedger data={data} />
                {data.narrative?.closingObservation && <p className="text-center text-sm italic text-[#cbc3d7]/45">{data.narrative.closingObservation}</p>}
              </div>}
            </div>
          </div>
        </div>
      </main>
    </SiteShell>
  );
}
