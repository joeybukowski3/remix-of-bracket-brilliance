import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Calculator,
  ChevronDown,
  Eye,
  Home,
  Search,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react";
import SiteShell from "@/components/layout/SiteShell";
import MlbPlayerHeadshot from "@/components/mlb/MlbPlayerHeadshot";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useMLBNumerology } from "@/hooks/useMLBNumerology";
import type { NumerologyDailyData, NumerologyPlay, WatchlistPlay } from "@/types/mlbNumerology";

type Match = { field: string; value: number; root?: number; label: string };
type MatchPlayer = {
  playerId?: string | number | null;
  personId?: string | number | null;
  playerName: string;
  team: string;
  opponent: string;
  opposingPitcher?: string | null;
  lineupStatus?: NumerologyPlay["lineupStatus"];
  battingOrder?: number | null;
  jerseyNumber?: number | null;
  numerologyScore: number;
  baseballScore?: number | null;
  matches?: Match[];
  exactNumberMatches?: Match[];
  rootNumberMatches?: Match[];
};

type ExtendedData = NumerologyDailyData & {
  exactNumberMatches?: MatchPlayer[];
  rootNumberMatches?: MatchPlayer[];
  bestAvailable?: NumerologyPlay[];
};

type ExplorerRow = MatchPlayer & { matchType: "Exact Match" | "Root Match" | "Neutral" };

const panel = "rounded-xl border border-[#1c223d] bg-[rgba(18,22,38,0.72)] backdrop-blur-xl";
const label = "text-[11px] font-bold uppercase tracking-[0.1em]";

function safeNumber(value: number | null | undefined) {
  return value == null || !Number.isFinite(Number(value)) ? "N/A" : Number(value).toFixed(Number(value) % 1 === 0 ? 0 : 1);
}

function mergeMatches(player: MatchPlayer) {
  return [
    ...(Array.isArray(player.matches) ? player.matches : []),
    ...(Array.isArray(player.exactNumberMatches) ? player.exactNumberMatches : []),
    ...(Array.isArray(player.rootNumberMatches) ? player.rootNumberMatches : []),
  ].filter((item): item is Match => Boolean(item?.field && item?.label))
    .filter((item, index, all) => all.findIndex((other) => other.field === item.field && other.label === item.label) === index);
}

function validPlayerId(player: MatchPlayer) {
  const value = Number(player.playerId ?? player.personId);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function NavLink({ href, icon, children, active = false }: { href: string; icon: ReactNode; children: ReactNode; active?: boolean }) {
  return <a href={href} className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm transition ${active ? "bg-[#a078ff] font-bold text-[#340080]" : "text-[#cbc3d7] hover:bg-[#282a32]"}`}>{icon}{children}</a>;
}

function MatchCard({ player, kind }: { player: MatchPlayer; kind: "exact" | "root" }) {
  const matches = mergeMatches(player);
  const primary = matches[0];
  const id = validPlayerId(player);
  const exact = kind === "exact";
  const [detailsOpen, setDetailsOpen] = useState(false);

  return <article className={`${panel} p-6 transition hover:-translate-y-1 ${exact ? "border-l-4 border-l-[#e9c349] shadow-[0_0_15px_rgba(212,175,55,.12)]" : "border-t border-t-[#d0bcff]/30 shadow-[0_0_15px_rgba(139,92,246,.12)]"}`}>
    <div className="flex items-start gap-4">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-[#494454] bg-[#0c0e16]">
        {id ? <MlbPlayerHeadshot playerId={id} playerName={player.playerName} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-lg font-bold text-[#d0bcff]">{player.team?.slice(0, 2) || "ML"}</div>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-2xl font-semibold text-[#e2e1ee]">{player.playerName}</h3>
            <p className="text-sm text-[#cbc3d7]">{player.team} vs {player.opponent}</p>
          </div>
          <span className={`rounded px-2 py-1 ${label} ${exact ? "bg-[#af8d11] text-[#342800]" : "bg-[#d0bcff]/15 text-[#d0bcff]"}`}>{primary?.label ?? (exact ? "Exact Match" : "Root Match")}</span>
        </div>
      </div>
    </div>

    <div className="mt-5 grid grid-cols-2 gap-3">
      <div className="rounded-lg border border-[#d0bcff]/20 bg-[#d0bcff]/10 p-4"><p className={`${label} text-[#d0bcff]`}>Numerology</p><p className="mt-2 font-mono text-xl font-medium text-[#d0bcff]">{safeNumber(player.numerologyScore)}</p></div>
      <div className="rounded-lg border border-[#89ceff]/20 bg-[#89ceff]/10 p-4"><p className={`${label} text-[#89ceff]`}>Model Rating</p><p className="mt-2 font-mono text-xl font-medium text-[#89ceff]">{safeNumber(player.baseballScore)}</p></div>
    </div>

    <button type="button" onClick={() => setDetailsOpen((value) => !value)} className="mt-4 flex w-full items-center justify-between rounded-lg border border-[#494454] bg-[#191b24] px-4 py-3 text-sm text-[#cbc3d7]">
      <span>View alignment details</span><ChevronDown className={`h-4 w-4 transition ${detailsOpen ? "rotate-180" : ""}`} />
    </button>
    {detailsOpen && <div className="mt-3 space-y-2 rounded-lg border border-[#494454]/60 bg-[#0c0e16] p-4">
      <p className="text-xs italic text-[#958ea0]">Model Rating is informational and does not affect numerology eligibility or ranking.</p>
      {matches.length ? matches.map((match) => <div key={`${match.field}-${match.label}`} className="flex items-center justify-between gap-3 text-sm"><span className="text-[#e2e1ee]">{match.label}</span><span className="font-mono text-[#d0bcff]">{match.value}{match.root != null && match.root !== match.value ? ` → ${match.root}` : ""}</span></div>) : <p className="text-sm text-[#958ea0]">No detailed fields were supplied.</p>}
    </div>}
  </article>;
}

function WatchRow({ play, positive }: { play: WatchlistPlay | NumerologyPlay; positive: boolean }) {
  return <div className="flex items-center justify-between border-b border-[#494454]/30 p-6 last:border-b-0 hover:bg-[#282a32]">
    <div><p className="text-lg font-semibold text-[#e2e1ee]">{play.playerName}</p><p className="text-sm text-[#cbc3d7]">{play.team} vs {play.opponent}</p></div>
    <div className="text-right"><p className={`font-mono text-lg ${positive ? "text-emerald-400" : "text-[#ffb4ab]"}`}>{positive ? "+" : "-"}{safeNumber(Math.abs(Number(play.numerologyScore ?? 0)))}</p><p className={`${label} text-[#958ea0]`}>{positive ? "Resonance" : "Friction"}</p></div>
  </div>;
}

export default function MlbNumerologyPage() {
  usePageSeo({ title: "MLB Numerology | Joe Knows Ball", description: "Daily numerical alignment across today’s MLB slate.", path: "/mlb/numerology" });
  const { data, loading, error, isStale } = useMLBNumerology();
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState("all");
  const [matchType, setMatchType] = useState("all");

  const extended = data as ExtendedData | null;
  const exact = Array.isArray(extended?.exactNumberMatches) ? extended.exactNumberMatches : [];
  const root = Array.isArray(extended?.rootNumberMatches) ? extended.rootNumberMatches : [];
  const featured = Array.isArray(data?.featuredPlays) ? data.featuredPlays : [];
  const watchlist = Array.isArray(data?.watchlist) ? data.watchlist : [];
  const countercurrents = Array.isArray(data?.countercurrents) ? data.countercurrents : [];
  const profile = data?.dailyProfile;

  const explorer = useMemo(() => {
    const rows = new Map<string, ExplorerRow>();
    const add = (player: MatchPlayer, type: ExplorerRow["matchType"]) => {
      if (!player?.playerName || !player?.team) return;
      const key = `${player.playerName.toLowerCase()}|${player.team}`;
      const current = rows.get(key);
      if (!current || type === "Exact Match") rows.set(key, { ...player, matchType: type });
    };
    exact.forEach((player) => add(player, "Exact Match"));
    root.forEach((player) => add(player, "Root Match"));
    featured.forEach((player) => add(player, "Neutral"));
    const needle = query.trim().toLowerCase();
    return [...rows.values()].filter((player) => {
      if (team !== "all" && player.team !== team) return false;
      if (matchType !== "all" && player.matchType !== matchType) return false;
      return !needle || `${player.playerName} ${player.team} ${player.opponent}`.toLowerCase().includes(needle);
    }).sort((a, b) => Number(b.numerologyScore || 0) - Number(a.numerologyScore || 0));
  }, [exact, root, featured, query, team, matchType]);

  const teams = useMemo(() => [...new Set(explorer.map((player) => player.team).filter(Boolean))].sort(), [explorer]);
  const universalLabel = profile ? `${profile.universalDayCompound}/${profile.universalDayRoot}` : "—";
  const calendarLabel = profile ? `${profile.calendarDayCompound}/${profile.calendarDayRoot}` : "—";

  return <SiteShell>
    <div className="min-h-screen bg-[#0a0c14] text-[#e2e1ee]">
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-[#494454] bg-[#1d1f28] p-4 lg:flex">
          <div className="mb-10 px-2 pt-6"><h2 className="font-serif text-3xl text-[#d0bcff]">MLB Numerology</h2><p className="mt-1 text-sm text-[#cbc3d7]">The Enlightened Fan</p></div>
          <nav className="flex flex-col gap-2">
            <NavLink href="#overview" icon={<Home className="h-5 w-5" />} active>Overview</NavLink>
            <NavLink href="#exact-matches" icon={<Star className="h-5 w-5" />}>Exact Matches</NavLink>
            <NavLink href="#root-matches" icon={<Calculator className="h-5 w-5" />}>Root Matches</NavLink>
            <NavLink href="#top-alignments" icon={<TrendingUp className="h-5 w-5" />}>Top Alignments</NavLink>
            <NavLink href="#watchlist" icon={<Eye className="h-5 w-5" />}>Watchlist</NavLink>
            <NavLink href="#explorer" icon={<Search className="h-5 w-5" />}>Explorer</NavLink>
            <NavLink href="#methodology" icon={<BookOpen className="h-5 w-5" />}>Methodology</NavLink>
          </nav>
        </aside>

        <main className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:px-10">
          <section className="mb-10 border-b border-[#494454] pb-6">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div><div className="mb-2 flex items-center gap-2 text-[#d0bcff]"><Eye className="h-5 w-5 fill-current" /><span className={label}>Sacred Alignment</span></div><h1 className="font-serif text-4xl font-bold tracking-tight sm:text-5xl">MLB Numerology</h1><p className="mt-3 max-w-2xl text-base text-[#cbc3d7]">Daily numerical alignment across today’s MLB slate.</p></div>
              <div className="text-left md:text-right"><div className="mb-2 flex gap-2 md:justify-end"><span className={`rounded border border-[#494454] bg-[#282a32] px-3 py-1 ${label}`}>Methodology {data?.methodologyVersion ?? "v2.1"}</span><span className={`rounded bg-[#93000a] px-3 py-1 text-[#ffdad6] ${label}`}>Disclaimer</span></div><p className="font-mono text-sm text-[#cbc3d7]">{data?.date ?? "—"} • <span className="text-[#d0bcff]">{isStale ? "Stale data" : "Current slate"}</span></p></div>
            </div>
          </section>

          {loading && <div className={`${panel} p-12 text-center text-[#cbc3d7]`}>Loading numerology data…</div>}
          {!loading && error && <div className="rounded-xl border border-[#ffb4ab]/30 bg-[#93000a]/25 p-6 text-[#ffdad6]">Unable to load numerology data: {error}</div>}
          {!loading && !error && (!data || !profile) && <div className={`${panel} p-12 text-center text-[#cbc3d7]`}>No numerology data is available.</div>}

          {!loading && !error && data && profile && <>
            <section id="overview" className="mb-16 grid gap-5 md:grid-cols-2">
              <div className={`${panel} relative overflow-hidden p-6`}><Calculator className="absolute -right-6 -top-6 h-32 w-32 text-[#d0bcff]/5" /><h3 className={`${label} mb-6 border-b border-[#494454]/30 pb-2 text-[#e9c349]`}>Core Frequencies</h3><div className="mb-8 flex items-baseline gap-4"><span className="font-serif text-5xl font-bold text-[#d0bcff]">{universalLabel}</span><span className="text-xl font-semibold text-[#cbc3d7]">Universal Day</span></div><div className="grid grid-cols-2 gap-6"><div><p className={`${label} mb-2 text-[#cbc3d7]`}>Calculation Formula</p><p className="font-mono text-lg">{Array.isArray(profile.universalDayTrace) ? profile.universalDayTrace[0] : "—"}</p></div><div><p className={`${label} mb-2 text-[#cbc3d7]`}>Calendar Day</p><p className="font-mono text-lg">{calendarLabel}</p></div></div><div className="mt-8 rounded-lg border border-[#494454]/20 bg-[#0c0e16] p-4"><p className={`${label} mb-3 text-[#d0bcff]`}>Primary Family</p><div className="flex gap-6 font-mono text-lg">{(Array.isArray(profile.primaryFamily) ? profile.primaryFamily : []).map((number) => <span key={number} className="text-[#d0bcff]">{number}</span>)}</div></div></div>
              <div className={`${panel} p-6`}><h3 className={`${label} mb-6 border-b border-[#494454]/30 pb-2 text-[#e9c349]`}>Energy Balancing</h3><div className="mb-8 grid grid-cols-2 gap-8"><div className="space-y-6"><div><p className={`${label} mb-2 text-[#cbc3d7]`}>Secondary Family</p><p className="font-mono text-lg">{(Array.isArray(profile.secondaryFamily) ? profile.secondaryFamily : []).join("-") || "—"}</p></div><div><p className={`${label} mb-2 text-[#cbc3d7]`}>Balancing Complement</p><p className="font-mono text-lg text-[#e9c349]">{profile.balancingComplement}</p></div></div><div className="space-y-6"><div><p className={`${label} mb-2 text-[#cbc3d7]`}>Countercurrent</p><p className="font-mono text-lg text-[#ffb4ab]">{profile.countercurrent}</p></div><div><p className={`${label} mb-2 text-[#cbc3d7]`}>Repeated Digits</p><p className="font-mono text-lg">{(Array.isArray(profile.repeatedDigits) ? profile.repeatedDigits : []).map((item) => item.digit).join(", ") || "None"}</p></div></div></div><div className="rounded-lg border-l-2 border-[#e9c349] bg-[#33343e]/30 p-4 text-sm italic leading-6 text-[#cbc3d7]">“{profile.interpretation || "Today’s slate is evaluated strictly through the published numerology model."}”</div></div>
            </section>

            <section id="exact-matches" className="mb-16"><div className="mb-5 flex items-center gap-2"><Star className="h-5 w-5 fill-[#e9c349] text-[#e9c349]" /><h2 className="text-xl font-semibold">Exact Matches</h2><span className={`ml-auto rounded bg-[#e9c349]/10 px-3 py-1 text-[#af8d11] ${label}`}>High Probability</span></div><div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{exact.length ? exact.map((player) => <MatchCard key={`${player.playerName}-${player.team}`} player={player} kind="exact" />) : <div className={`${panel} col-span-full p-8 text-center text-[#958ea0]`}>No exact matches today.</div>}</div></section>

            <section id="root-matches" className="mb-16"><div className="mb-5 flex items-center gap-2"><Calculator className="h-5 w-5 text-[#d0bcff]" /><h2 className="text-xl font-semibold">Reduced-Root Matches</h2></div><div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{root.length ? root.map((player) => <MatchCard key={`${player.playerName}-${player.team}`} player={player} kind="root" />) : <div className={`${panel} col-span-full p-8 text-center text-[#958ea0]`}>No root matches today.</div>}</div></section>

            <section id="top-alignments" className="mb-16"><div className="mb-5 flex items-center gap-2"><BarChart3 className="h-5 w-5 text-[#89ceff]" /><h2 className="text-xl font-semibold">Top Alignments</h2></div><div className="grid gap-4 md:grid-cols-3">{featured.slice(0, 6).map((play) => <div key={`${play.playerName}-${play.team}`} className={`${panel} p-5`}><p className="font-serif text-xl font-semibold">{play.playerName}</p><p className="mt-1 text-sm text-[#cbc3d7]">{play.team} vs {play.opponent}</p><div className="mt-5 h-1 rounded bg-[#1c223d]"><div className="h-full rounded bg-[#d0bcff]" style={{ width: `${Math.min(100, Math.max(0, play.numerologyScore))}%` }} /></div><p className={`${label} mt-2 text-right text-[#cbc3d7]`}>Strength: {safeNumber(play.numerologyScore)}%</p></div>)}</div></section>

            <section id="watchlist" className="mb-16 grid gap-5 md:grid-cols-2"><div className={`${panel} overflow-hidden border-emerald-500/20`}><div className="flex items-center justify-between border-b border-emerald-500/20 bg-emerald-500/10 p-4"><div className="flex items-center gap-2"><Eye className="h-5 w-5 text-emerald-400" /><h3 className={`${label} text-emerald-400`}>Watchlist Signals</h3></div><span className={`${label} text-emerald-400/70`}>Flowing</span></div>{watchlist.slice(0, 5).map((play) => <WatchRow key={`${play.playerName}-${play.team}`} play={play} positive />)}</div><div className={`${panel} overflow-hidden border-[#ffb4ab]/20`}><div className="flex items-center justify-between border-b border-[#ffb4ab]/20 bg-[#ffb4ab]/10 p-4"><div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-[#ffb4ab]" /><h3 className={`${label} text-[#ffb4ab]`}>Countercurrents</h3></div><span className={`${label} text-[#ffb4ab]/70`}>Resistance</span></div>{countercurrents.slice(0, 5).map((play) => <WatchRow key={`${play.playerName}-${play.team}`} play={{ ...play, opponent: "", lineupStatus: "unknown", battingOrder: null, jerseyNumber: null, recommendedMarket: "", odds: null, formula: "", confidence: "low", positiveSignals: [], counterSignals: [], rank: 0, playerId: null }} positive={false} />)}</div></section>

            <section id="explorer" className="mb-16"><div className="mb-5 flex items-center gap-2"><Search className="h-5 w-5 text-[#d0bcff]" /><h2 className="text-xl font-semibold">Player Explorer</h2></div><div className={`${panel} overflow-hidden`}><div className="flex flex-wrap items-center gap-4 border-b border-[#494454] bg-[#191b24] p-6"><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-[220px] flex-1 rounded-lg border border-[#494454] bg-[#1d1f28] px-4 py-2 text-sm outline-none focus:border-[#d0bcff]" placeholder="Search players" /><select value={team} onChange={(event) => setTeam(event.target.value)} className="rounded-lg border border-[#494454] bg-[#1d1f28] px-4 py-2 text-sm"><option value="all">All Teams</option>{teams.map((value) => <option key={value} value={value}>{value}</option>)}</select><select value={matchType} onChange={(event) => setMatchType(event.target.value)} className="rounded-lg border border-[#494454] bg-[#1d1f28] px-4 py-2 text-sm"><option value="all">All Match Types</option><option>Exact Match</option><option>Root Match</option><option>Neutral</option></select></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="bg-[#33343e]/20"><tr>{["Player","Match Type","Numerology","Model Rating","Lineup Pos","Status"].map((heading) => <th key={heading} className={`border-b border-[#494454] p-5 text-[#cbc3d7] ${label}`}>{heading}</th>)}</tr></thead><tbody>{explorer.map((player) => <tr key={`${player.playerName}-${player.team}`} className="hover:bg-[#282a32]"><td className="border-b border-[#494454]/30 p-5"><div className="font-semibold">{player.playerName}</div><div className="text-sm text-[#cbc3d7]">{player.team} vs {player.opponent}</div></td><td className="border-b border-[#494454]/30 p-5"><span className={`rounded px-2 py-1 ${label} ${player.matchType === "Exact Match" ? "bg-[#e9c349]/20 text-[#e9c349]" : player.matchType === "Root Match" ? "bg-[#d0bcff]/20 text-[#d0bcff]" : "bg-[#958ea0]/20 text-[#cbc3d7]"}`}>{player.matchType}</span></td><td className="border-b border-[#494454]/30 p-5 font-mono">{safeNumber(player.numerologyScore)}</td><td className="border-b border-[#494454]/30 p-5 font-mono">{safeNumber(player.baseballScore)}</td><td className="border-b border-[#494454]/30 p-5 font-mono">{player.battingOrder ?? "—"}</td><td className="border-b border-[#494454]/30 p-5"><span className={`rounded px-2 py-1 ${label} ${player.lineupStatus === "confirmed" ? "bg-emerald-500/20 text-emerald-400" : "bg-[#e9c349]/20 text-[#e9c349]"}`}>{player.lineupStatus ?? "unknown"}</span></td></tr>)}</tbody></table></div></div></section>

            <section id="methodology" className="mb-20"><details className={`${panel} group overflow-hidden`}><summary className="flex cursor-pointer list-none items-center justify-between bg-[#282a32]/50 p-6"><div className="flex items-center gap-3"><BookOpen className="h-5 w-5 text-[#d0bcff]" /><h2 className="text-xl font-semibold">Methodology & Mathematical Constraints</h2></div><ChevronDown className="h-5 w-5 transition group-open:rotate-180" /></summary><div className="space-y-4 border-t border-[#494454] p-6 text-sm leading-7 text-[#cbc3d7]"><p>The existing numerology engine and generated data remain unchanged. This page only presents the current model through the approved Stitch visual design.</p><p><strong className="text-[#e2e1ee]">Exact Matches:</strong> Direct compound or master-number alignments generated by the current model.</p><p><strong className="text-[#e2e1ee]">Reduced-Root Matches:</strong> Root-family relationships generated by the current model.</p><p className="rounded-lg bg-[#0c0e16] p-4 italic">Disclaimer: MLB Numerology is for entertainment and esoteric research purposes only. Model Rating is supplemental and never affects numerology eligibility or ranking.</p></div></details></section>
          </>}
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 z-50 flex w-full justify-around border-t border-[#494454]/30 bg-[#191b24]/90 px-5 py-3 backdrop-blur-xl lg:hidden"><a href="#overview" className="flex flex-col items-center text-[#d0bcff]"><Home className="h-5 w-5" /><span className={label}>Overview</span></a><a href="#exact-matches" className="flex flex-col items-center text-[#cbc3d7]"><Sparkles className="h-5 w-5" /><span className={label}>Matches</span></a><a href="#watchlist" className="flex flex-col items-center text-[#cbc3d7]"><Eye className="h-5 w-5" /><span className={label}>Watchlist</span></a><a href="#explorer" className="flex flex-col items-center text-[#cbc3d7]"><Search className="h-5 w-5" /><span className={label}>Explorer</span></a></nav>
    </div>
  </SiteShell>;
}
