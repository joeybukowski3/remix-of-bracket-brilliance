import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import SiteShell from "@/components/layout/SiteShell";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useMLBNumerology } from "@/hooks/useMLBNumerology";
import type { NumerologyDailyData, NumerologyPlay } from "@/types/mlbNumerology";

const TEAM_CODES: Record<string, string> = { AZ: "ari", ATH: "oak", CWS: "chw", KC: "kc", SD: "sd", SF: "sf", TB: "tb", WSH: "wsh" };
const teamLogo = (team: string) => `https://a.espncdn.com/i/teamlogos/mlb/500/${TEAM_CODES[team] ?? team.toLowerCase()}.png`;
const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

type Match = { field: string; value: number; root?: number; label: string };
type MatchPlayer = {
  playerId?: number | null;
  personId?: number | null;
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

type HrBatter = {
  player: string;
  team: string;
  barrelRate?: number | null;
  hardHitRate?: number | null;
  exitVelo?: number | null;
  iso?: number | null;
  hrFBRatio?: number | null;
  pullRate?: number | null;
  last7HR?: number | null;
  last30HR?: number | null;
  hrScore?: number | null;
  hrScoreRank?: number | null;
};

type ExtendedData = NumerologyDailyData & {
  exactNumberMatches?: MatchPlayer[];
  rootNumberMatches?: MatchPlayer[];
  bestAvailable?: NumerologyPlay[];
};

type ClassifiedPlayer = MatchPlayer & {
  allMatches: Match[];
  directCompound: Match[];
  directRoot: Match[];
  strongRootFamily: Match[];
};

function metric(value: number | null | undefined) {
  return value == null || !Number.isFinite(Number(value)) ? "N/A" : Number(value).toFixed(Number(value) % 1 === 0 ? 0 : 1);
}

function uniqueMatches(player: MatchPlayer) {
  return [...(player.matches ?? []), ...(player.exactNumberMatches ?? []), ...(player.rootNumberMatches ?? [])]
    .filter((match, index, all) => all.findIndex((other) => other.field === match.field && other.label === match.label) === index);
}

function fieldPriority(field: string) {
  const order = ["personalDay", "jersey", "birthDay", "lifePath", "age", "battingOrder", "expression"];
  const index = order.indexOf(field);
  return index === -1 ? 99 : index;
}

function classifyPlayer(player: MatchPlayer, compound: number, root: number): ClassifiedPlayer {
  const allMatches = uniqueMatches(player);
  const directCompound = allMatches.filter((match) => match.value === compound);
  const directRoot = allMatches.filter((match) => match.value === root);
  const strongRootFamily = allMatches.filter((match) => match.root === root && match.value !== compound && match.value !== root);
  return { ...player, allMatches, directCompound, directRoot, strongRootFamily };
}

function sortDirect(a: ClassifiedPlayer, b: ClassifiedPlayer) {
  if (b.directCompound.length !== a.directCompound.length) return b.directCompound.length - a.directCompound.length;
  if (b.directRoot.length !== a.directRoot.length) return b.directRoot.length - a.directRoot.length;
  const aBest = Math.min(...a.allMatches.map((match) => fieldPriority(match.field)), 99);
  const bBest = Math.min(...b.allMatches.map((match) => fieldPriority(match.field)), 99);
  if (aBest !== bBest) return aBest - bBest;
  if (b.strongRootFamily.length !== a.strongRootFamily.length) return b.strongRootFamily.length - a.strongRootFamily.length;
  return b.numerologyScore - a.numerologyScore || a.playerName.localeCompare(b.playerName);
}

function StatusPill({ status }: { status?: string }) {
  const confirmed = status === "confirmed";
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${confirmed ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-200"}`}>{confirmed ? "Confirmed lineup" : "Active pool · lineup unconfirmed"}</span>;
}

function ModelGrid({ batter }: { batter: HrBatter | null }) {
  const rows = [
    ["HR Score", batter?.hrScore], ["HR Rank", batter?.hrScoreRank], ["Barrel %", batter?.barrelRate],
    ["Hard Hit %", batter?.hardHitRate], ["Exit Velocity", batter?.exitVelo], ["ISO", batter?.iso],
    ["HR/FB %", batter?.hrFBRatio], ["Pull %", batter?.pullRate], ["Last 7 HR", batter?.last7HR], ["Last 30 HR", batter?.last30HR],
  ] as const;
  return <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-sky-300/15 bg-sky-300/10 sm:grid-cols-3">{rows.map(([label, value]) => <div key={label} className="bg-[#0d1422] p-2.5"><div className="text-[9px] font-bold uppercase tracking-wide text-sky-300/55">{label}</div><div className="mt-1 font-mono text-sm font-bold text-sky-300">{metric(value)}</div></div>)}</div>;
}

function PlayerCard({ player, batter, tone }: { player: ClassifiedPlayer; batter: HrBatter | null; tone: "gold" | "violet" | "blue" | "slate" }) {
  const [numerologyOpen, setNumerologyOpen] = useState(false);
  const [baseballOpen, setBaseballOpen] = useState(false);
  const tones = {
    gold: "border-amber-300/30 bg-amber-300/[0.035]",
    violet: "border-violet-300/25 bg-violet-300/[0.03]",
    blue: "border-sky-300/20 bg-sky-300/[0.025]",
    slate: "border-white/10 bg-white/[0.02]",
  };
  return <article className={`rounded-xl border p-3 ${tones[tone]}`}>
    <div className="flex items-start gap-3">
      <img src={teamLogo(player.team)} alt={`${player.team} logo`} className="h-9 w-9 shrink-0 object-contain" onError={(event) => { event.currentTarget.style.display = "none"; }} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-bold text-white">{player.playerName}</span>{player.jerseyNumber != null && <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/55">#{player.jerseyNumber}</span>}</div>
        <div className="mt-0.5 text-[11px] text-white/40">{player.team} vs {player.opponent}{player.opposingPitcher ? ` · ${player.opposingPitcher}` : ""}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">{player.allMatches.map((match) => <span key={`${match.field}-${match.label}`} className="rounded-full bg-violet-300/12 px-2 py-0.5 text-[9px] font-bold text-violet-200">{match.label}</span>)}</div>
      </div>
    </div>

    <div className="mt-3 space-y-2">
      <button type="button" onClick={() => setNumerologyOpen((open) => !open)} className="flex w-full items-center justify-between rounded-lg border border-violet-300/20 bg-violet-300/10 px-3 py-2 text-left text-xs font-bold text-violet-200"><span>Numerology match details</span><span className="flex items-center gap-2 font-mono">Score {player.numerologyScore}{numerologyOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span></button>
      {numerologyOpen && <div className="space-y-2 rounded-lg border border-white/8 bg-[#0d1422] p-3">{player.allMatches.map((match) => <div key={`${match.field}-${match.label}`} className="flex items-center justify-between gap-3 rounded-md bg-violet-300/5 px-3 py-2"><span className="text-xs font-semibold text-white/80">{match.label}</span><span className="text-[9px] uppercase tracking-wide text-violet-300/55">{match.field}</span></div>)}</div>}

      <button type="button" onClick={() => setBaseballOpen((open) => !open)} className="flex w-full items-center justify-between rounded-lg border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-left text-xs font-bold text-sky-300"><span>Baseball context · not used in ranking</span><span className="flex items-center gap-2 font-mono">{metric(batter?.hrScore ?? player.baseballScore)}{baseballOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span></button>
      {baseballOpen && <div className="rounded-lg border border-white/8 bg-[#0d1422] p-3"><ModelGrid batter={batter} /></div>}
    </div>
    <div className="mt-3"><StatusPill status={player.lineupStatus} /></div>
  </article>;
}

function PlayerSection({ id, title, description, players, hrMap, tone, openByDefault = false }: { id: string; title: string; description: string; players: ClassifiedPlayer[]; hrMap: Map<string, HrBatter>; tone: "gold" | "violet" | "blue" | "slate"; openByDefault?: boolean }) {
  const [expanded, setExpanded] = useState(openByDefault);
  const visible = expanded ? players : players.slice(0, 9);
  return <section id={id} className="rounded-2xl border border-white/10 bg-[#111827] p-4 sm:p-5">
    <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-lg font-black text-white">{title}</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-white/45">{description}</p></div><span className="rounded-full bg-white/8 px-3 py-1 font-mono text-xs font-bold text-white/65">{players.length}</span></div>
    {players.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 py-8 text-center text-sm text-white/40">No active players match this category today.</div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visible.map((player) => <PlayerCard key={`${player.playerName}-${player.team}`} player={player} batter={hrMap.get(`${normalize(player.playerName)}|${player.team}`) ?? null} tone={tone} />)}</div>}
    {players.length > 9 && <button type="button" onClick={() => setExpanded((open) => !open)} className="mt-4 w-full rounded-lg border border-white/10 py-2 text-xs font-bold text-white/50 hover:bg-white/5">{expanded ? "Show fewer" : `Show all ${players.length}`}</button>}
  </section>;
}

export default function MlbNumerologyPage() {
  usePageSeo({ title: "MLB Numerology Dashboard | Joe Knows Ball", description: "Direct daily MLB numerology matches with baseball statistics shown only as supporting context.", path: "/mlb/numerology" });
  const { data, loading, error, isStale } = useMLBNumerology();
  const [hrBatters, setHrBatters] = useState<HrBatter[]>([]);
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState("all");

  useEffect(() => {
    let active = true;
    fetch("/data/mlb/hr-props-raw.json", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((payload) => { if (active) setHrBatters(Array.isArray(payload?.batters) ? payload.batters : []); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const extended = data as ExtendedData | null;
  const exact = extended?.exactNumberMatches ?? [];
  const rootMatches = extended?.rootNumberMatches ?? [];
  const compound = data?.dailyProfile?.universalDayCompound ?? data?.dailyProfile?.universalDayRawSum ?? 0;
  const root = data?.dailyProfile?.universalDayRoot ?? 0;
  const hrMap = useMemo(() => new Map(hrBatters.map((batter) => [`${normalize(batter.player)}|${batter.team}`, batter])), [hrBatters]);

  const classified = useMemo(() => {
    const merged = new Map<string, MatchPlayer>();
    const add = (player: MatchPlayer) => {
      const key = `${normalize(player.playerName)}|${player.team}`;
      const current = merged.get(key);
      merged.set(key, current ? { ...current, ...player, matches: [...(current.matches ?? []), ...(player.matches ?? [])], exactNumberMatches: [...(current.exactNumberMatches ?? []), ...(player.exactNumberMatches ?? [])], rootNumberMatches: [...(current.rootNumberMatches ?? []), ...(player.rootNumberMatches ?? [])] } : player);
    };
    exact.forEach(add);
    rootMatches.forEach(add);
    return [...merged.values()].map((player) => classifyPlayer(player, compound, root));
  }, [exact, rootMatches, compound, root]);

  const directCompound = useMemo(() => classified.filter((player) => player.directCompound.length > 0).sort(sortDirect), [classified]);
  const directRoot = useMemo(() => classified.filter((player) => player.directCompound.length === 0 && player.directRoot.length > 0).sort(sortDirect), [classified]);
  const strongFamily = useMemo(() => classified.filter((player) => player.directCompound.length === 0 && player.directRoot.length === 0 && player.strongRootFamily.some((match) => ["personalDay", "jersey", "birthDay", "lifePath", "age"].includes(match.field))).sort(sortDirect), [classified]);
  const used = useMemo(() => new Set([...directCompound, ...directRoot, ...strongFamily].map((player) => `${normalize(player.playerName)}|${player.team}`)), [directCompound, directRoot, strongFamily]);
  const highScore = useMemo(() => classified.filter((player) => !used.has(`${normalize(player.playerName)}|${player.team}`)).sort((a, b) => b.numerologyScore - a.numerologyScore).slice(0, 20), [classified, used]);
  const teams = useMemo(() => [...new Set(classified.map((player) => player.team))].sort(), [classified]);

  const explorer = useMemo(() => {
    const q = query.trim().toLowerCase();
    return classified.filter((player) => {
      if (team !== "all" && player.team !== team) return false;
      if (!q) return true;
      return `${player.playerName} ${player.team} ${player.opponent} ${player.opposingPitcher ?? ""}`.toLowerCase().includes(q);
    }).sort(sortDirect);
  }, [classified, query, team]);

  return <SiteShell><main className="site-page min-h-screen bg-[#070b13] pb-16 pt-4 text-white"><div className="site-container" style={{ maxWidth: "1500px" }}>
    <section className="rounded-3xl border border-violet-300/15 bg-gradient-to-br from-[#17132a] to-[#0d1422] p-5 sm:p-7"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><div className="text-xs font-black uppercase tracking-[0.22em] text-violet-300">𓂀 MLB Numerology</div><h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Direct Daily Matches</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">Direct compound and root matches are shown first. Baseball model data never affects eligibility, numerology score, or ranking.</p></div>{data && <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm"><div className="text-white/45">Today&apos;s code</div><div className="mt-1 font-mono text-2xl font-black text-violet-200">{compound}/{root}</div><div className="mt-1 text-[10px] text-white/35">{data.date}</div></div>}</div></section>

    {loading && <div className="mt-4 rounded-2xl border border-white/10 bg-[#111827] py-16 text-center text-white/45">Loading numerology data…</div>}
    {!loading && error && <div className="mt-4 rounded-2xl border border-red-300/20 bg-red-500/10 p-5 text-red-200">Unable to load numerology data: {error}</div>}
    {!loading && !error && data && <div className="mt-4 space-y-4">
      {isStale && <div className="rounded-xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">The published slate is from {data.date}. Rankings below reflect that generated data.</div>}
      <section className="grid gap-3 md:grid-cols-4"><div className="rounded-xl border border-white/10 bg-[#111827] p-4"><div className="text-[10px] uppercase text-white/35">Daily compound</div><div className="mt-1 font-mono text-2xl font-black text-amber-200">{compound}</div></div><div className="rounded-xl border border-white/10 bg-[#111827] p-4"><div className="text-[10px] uppercase text-white/35">Daily root</div><div className="mt-1 font-mono text-2xl font-black text-violet-200">{root}</div></div><div className="rounded-xl border border-white/10 bg-[#111827] p-4"><div className="text-[10px] uppercase text-white/35">Direct compound</div><div className="mt-1 font-mono text-2xl font-black text-amber-200">{directCompound.length}</div></div><div className="rounded-xl border border-white/10 bg-[#111827] p-4"><div className="text-[10px] uppercase text-white/35">Direct root</div><div className="mt-1 font-mono text-2xl font-black text-violet-200">{directRoot.length}</div></div></section>

      <PlayerSection id="direct-compound" title={`Direct ${compound} Matches`} description={`Players with a field equal to ${compound} exactly. These are the strongest literal daily matches and are ranked by number of direct matches, field strength, supporting correlations, then numerology score.`} players={directCompound} hrMap={hrMap} tone="gold" openByDefault />
      <PlayerSection id="direct-root" title={`Direct Root ${root} Matches`} description={`Players with a field equal to ${root} exactly, without first reducing another number.`} players={directRoot} hrMap={hrMap} tone="violet" openByDefault />
      <PlayerSection id="strong-family" title={`Strong ${root}-Family Correlations`} description={`Meaningful compounds reducing to ${root} in Personal Day, jersey, birth day, Life Path, or age. These are supporting correlations, not equal to a direct ${compound} or ${root} match.`} players={strongFamily} hrMap={hrMap} tone="blue" />
      <PlayerSection id="high-score" title="High Numerology Scores" description="Players with strong cumulative numerology alignment who do not have a direct daily compound or root match. Baseball context remains separate." players={highScore} hrMap={hrMap} tone="slate" />

      <section className="rounded-2xl border border-white/10 bg-[#111827] p-4 sm:p-5"><h2 className="text-lg font-black">All Active Matches</h2><p className="mt-1 text-xs text-white/45">Search the active HR-model player pool without changing numerology ranking.</p><div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px]"><label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search player, team, opponent, or pitcher" className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-3 text-sm text-white outline-none" /></label><select value={team} onChange={(event) => setTeam(event.target.value)} className="rounded-xl border border-white/10 bg-[#0d1422] px-3 py-2.5 text-sm text-white"><option value="all">All teams</option>{teams.map((value) => <option key={value} value={value}>{value}</option>)}</select></div><div className="mt-4 divide-y divide-white/8">{explorer.map((player) => <div key={`${player.playerName}-${player.team}`} className="grid gap-3 py-3 sm:grid-cols-[1fr_auto]"><div><div className="font-bold">{player.playerName}</div><div className="text-xs text-white/40">{player.team} vs {player.opponent}</div><div className="mt-1 flex flex-wrap gap-1">{player.directCompound.length > 0 && <span className="rounded bg-amber-300/10 px-2 py-0.5 text-[9px] text-amber-200">Direct {compound}</span>}{player.directRoot.length > 0 && <span className="rounded bg-violet-300/10 px-2 py-0.5 text-[9px] text-violet-200">Direct {root}</span>}{player.strongRootFamily.length > 0 && <span className="rounded bg-sky-300/10 px-2 py-0.5 text-[9px] text-sky-200">{root}-family</span>}</div></div><div className="sm:text-right"><div className="text-[9px] uppercase text-violet-300/50">Numerology score</div><div className="font-mono font-black text-violet-200">{player.numerologyScore}</div></div></div>)}{explorer.length === 0 && <div className="py-10 text-center text-sm text-white/40">No players match the current search.</div>}</div></section>
    </div>}
  </div></main></SiteShell>;
}
