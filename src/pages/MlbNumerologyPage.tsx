import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import SiteShell from "@/components/layout/SiteShell";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useMLBNumerology } from "@/hooks/useMLBNumerology";
import type { NumerologyDailyData, NumerologyPlay } from "@/types/mlbNumerology";

const TEAM_CODES: Record<string, string> = {
  AZ: "ari", ATH: "oak", CWS: "chw", KC: "kc", SD: "sd", SF: "sf", TB: "tb", WSH: "wsh",
};

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
  opponent?: string;
  opposingPitcher?: string;
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

function value(value: number | null | undefined, suffix = "") {
  return value == null || !Number.isFinite(Number(value)) ? "N/A" : `${Number(value).toFixed(Number(value) % 1 === 0 ? 0 : 1)}${suffix}`;
}

function StatusPill({ status }: { status?: string }) {
  const confirmed = status === "confirmed";
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${confirmed ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-200"}`}>Today&apos;s Lineup: {confirmed ? "Confirmed" : "Unconfirmed"}</span>;
}

function ModelGrid({ batter }: { batter: HrBatter | null }) {
  const rows = [
    ["HR Score", batter?.hrScore], ["HR Rank", batter?.hrScoreRank], ["Barrel %", batter?.barrelRate],
    ["Hard Hit %", batter?.hardHitRate], ["Exit Velocity", batter?.exitVelo], ["ISO", batter?.iso],
    ["HR/FB %", batter?.hrFBRatio], ["Pull %", batter?.pullRate], ["Last 7 HR", batter?.last7HR], ["Last 30 HR", batter?.last30HR],
  ] as const;
  return <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-sky-300/15 bg-sky-300/10 sm:grid-cols-3">{rows.map(([label, metric]) => <div key={label} className="bg-[#0d1422] p-2.5"><div className="text-[9px] font-bold uppercase tracking-wide text-sky-300/55">{label}</div><div className="mt-1 font-mono text-sm font-bold text-sky-300">{value(metric)}</div></div>)}</div>;
}

function MatchTile({ player, batter, accent }: { player: MatchPlayer; batter: HrBatter | null; accent: "exact" | "root" }) {
  const [numerologyOpen, setNumerologyOpen] = useState(false);
  const [baseballOpen, setBaseballOpen] = useState(false);
  const matches = [...(player.matches ?? []), ...(player.exactNumberMatches ?? []), ...(player.rootNumberMatches ?? [])]
    .filter((item, index, all) => all.findIndex((other) => other.field === item.field && other.label === item.label) === index);
  const exact = accent === "exact";

  return <article className={`rounded-xl border bg-white/[0.025] p-3 ${exact ? "border-amber-300/25" : "border-violet-300/20"}`}>
    <div className="flex items-start gap-3">
      <img src={teamLogo(player.team)} alt={`${player.team} logo`} className="h-9 w-9 shrink-0 object-contain" onError={(event) => { event.currentTarget.style.display = "none"; }} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-white">{player.playerName}</span>
          {player.jerseyNumber != null && <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/55">#{player.jerseyNumber}</span>}
        </div>
        <div className="mt-0.5 text-[11px] text-white/40">{player.team} vs {player.opponent}{player.opposingPitcher ? ` · ${player.opposingPitcher}` : ""}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">{(player.matches ?? []).map((match) => <span key={`${match.field}-${match.label}`} className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${exact ? "bg-amber-300/15 text-amber-200" : "bg-violet-300/15 text-violet-200"}`}>{match.label}</span>)}</div>
      </div>
    </div>

    <div className="mt-3 space-y-2">
      <button type="button" onClick={() => setNumerologyOpen((open) => !open)} className="flex w-full items-center justify-between rounded-lg border border-violet-300/20 bg-violet-300/10 px-3 py-2 text-left text-xs font-bold text-violet-200">
        <span>Numerology</span><span className="flex items-center gap-2 font-mono">{player.numerologyScore}{numerologyOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
      </button>
      {numerologyOpen && <div className="rounded-lg border border-white/8 bg-[#0d1422] p-3"><div className="space-y-2">{matches.length ? matches.map((match) => <div key={`${match.field}-${match.label}`} className="flex items-center justify-between gap-3 rounded-md bg-violet-300/5 px-3 py-2"><span className="text-xs font-semibold text-white/80">{match.label}</span><span className="text-[9px] uppercase tracking-wide text-violet-300/55">{match.field}</span></div>) : <div className="text-xs text-white/40">No detailed matching fields were provided.</div>}</div></div>}

      <button type="button" onClick={() => setBaseballOpen((open) => !open)} className="flex w-full items-center justify-between rounded-lg border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-left text-xs font-bold text-sky-300">
        <span>Baseball Model Stats</span><span className="flex items-center gap-2 font-mono">{value(batter?.hrScore ?? player.baseballScore)}{baseballOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
      </button>
      {baseballOpen && <div className="rounded-lg border border-white/8 bg-[#0d1422] p-3"><ModelGrid batter={batter} />{!batter && <p className="mt-2 text-[10px] text-amber-200/65">This player is not currently available in the HR model data.</p>}</div>}
    </div>

    <div className="mt-3"><StatusPill status={player.lineupStatus} /></div>
  </article>;
}

function MatchSection({ id, title, description, players, hrMap, accent }: { id: string; title: string; description: string; players: MatchPlayer[]; hrMap: Map<string, HrBatter>; accent: "exact" | "root" }) {
  const [expanded, setExpanded] = useState(accent === "exact");
  const visible = expanded ? players : players.slice(0, 12);
  return <section id={id} className="rounded-2xl border border-white/10 bg-[#111827] p-4 sm:p-5">
    <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-lg font-black text-white">{title}</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-white/45">{description}</p></div><span className="rounded-full bg-white/8 px-3 py-1 font-mono text-xs font-bold text-white/65">{players.length}</span></div>
    {players.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 py-8 text-center text-sm text-white/40">No eligible players match this category today.</div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visible.map((player) => <MatchTile key={`${player.playerName}-${player.team}`} player={player} batter={hrMap.get(`${normalize(player.playerName)}|${player.team}`) ?? null} accent={accent} />)}</div>}
    {players.length > 12 && <button type="button" onClick={() => setExpanded((open) => !open)} className="mt-4 w-full rounded-lg border border-white/10 py-2 text-xs font-bold text-white/50 hover:bg-white/5">{expanded ? "Show fewer" : `Show all ${players.length}`}</button>}
  </section>;
}

export default function MlbNumerologyPage() {
  usePageSeo({ title: "MLB Numerology Dashboard | Joe Knows Ball", description: "Daily MLB numerology matches with supporting baseball-model context.", path: "/mlb/numerology" });
  const { data, loading, error, isStale } = useMLBNumerology();
  const [hrBatters, setHrBatters] = useState<HrBatter[]>([]);
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState("all");
  const [exactOnly, setExactOnly] = useState(false);
  const [rootOnly, setRootOnly] = useState(false);
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const [hasHrOnly, setHasHrOnly] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/data/mlb/hr-props-raw.json", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((payload) => { if (active) setHrBatters(Array.isArray(payload?.batters) ? payload.batters : []); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const extended = data as ExtendedData | null;
  const exact = extended?.exactNumberMatches ?? [];
  const root = extended?.rootNumberMatches ?? [];
  const hrMap = useMemo(() => new Map(hrBatters.map((batter) => [`${normalize(batter.player)}|${batter.team}`, batter])), [hrBatters]);
  const teams = useMemo(() => [...new Set([...exact, ...root].map((player) => player.team))].sort(), [exact, root]);

  const explorer = useMemo(() => {
    const records = new Map<string, MatchPlayer & { exact: boolean; root: boolean; batter: HrBatter | null }>();
    const add = (player: MatchPlayer, kind: "exact" | "root") => {
      const key = `${normalize(player.playerName)}|${player.team}`;
      const current = records.get(key);
      records.set(key, { ...(current ?? player), ...player, exact: current?.exact || kind === "exact", root: current?.root || kind === "root", batter: hrMap.get(key) ?? null });
    };
    exact.forEach((player) => add(player, "exact"));
    root.forEach((player) => add(player, "root"));
    const normalizedQuery = query.trim().toLowerCase();
    return [...records.values()].filter((player) => {
      if (team !== "all" && player.team !== team) return false;
      if (exactOnly && !player.exact) return false;
      if (rootOnly && !player.root) return false;
      if (confirmedOnly && player.lineupStatus !== "confirmed") return false;
      if (hasHrOnly && player.batter?.hrScore == null) return false;
      if (!normalizedQuery) return true;
      return `${player.playerName} ${player.team} ${player.opponent} ${player.opposingPitcher ?? ""}`.toLowerCase().includes(normalizedQuery);
    }).sort((a, b) => b.numerologyScore - a.numerologyScore || a.playerName.localeCompare(b.playerName));
  }, [exact, root, hrMap, query, team, exactOnly, rootOnly, confirmedOnly, hasHrOnly]);

  return <SiteShell>
    <main className="site-page min-h-screen bg-[#070b13] pb-16 pt-4 text-white">
      <div className="site-container" style={{ maxWidth: "1500px" }}>
        <section className="rounded-3xl border border-violet-300/15 bg-gradient-to-br from-[#17132a] to-[#0d1422] p-5 sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><div className="text-xs font-black uppercase tracking-[0.22em] text-violet-300">𓂀 MLB Numerology</div><h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Daily Alignment Dashboard</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">Numerology determines the ranking. Baseball model statistics are displayed only as supporting context.</p></div>{data && <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm"><div className="text-white/45">Slate date</div><div className="mt-1 font-mono font-bold text-violet-200">{data.date}</div></div>}</div>
        </section>

        {loading && <div className="mt-4 rounded-2xl border border-white/10 bg-[#111827] py-16 text-center text-white/45">Loading numerology data…</div>}
        {!loading && error && <div className="mt-4 rounded-2xl border border-red-300/20 bg-red-500/10 p-5 text-red-200">Unable to load numerology data: {error}</div>}
        {!loading && !error && !data && <div className="mt-4 rounded-2xl border border-white/10 bg-[#111827] py-16 text-center text-white/45">No numerology data is available.</div>}

        {!loading && !error && data && <div className="mt-4 space-y-4">
          {(isStale || data.dataStatus === "unavailable") && <div className="rounded-xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">{isStale ? "The published numerology slate is from a previous date. " : ""}{data.dataStatus === "unavailable" ? "Some contextual lineup information was unavailable, but the generated numerology matches remain visible." : ""}</div>}

          <section className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-[#111827] p-4"><div className="text-[10px] uppercase tracking-wide text-white/35">Universal Day</div><div className="mt-1 font-mono text-2xl font-black text-violet-300">{data.dailyProfile.universalDayRawSum}/{data.dailyProfile.universalDayRoot}</div></div>
            <div className="rounded-xl border border-white/10 bg-[#111827] p-4"><div className="text-[10px] uppercase tracking-wide text-white/35">Primary Family</div><div className="mt-1 font-mono text-2xl font-black text-violet-300">{(data.dailyProfile.primaryFamily ?? []).join(" · ")}</div></div>
            <div className="rounded-xl border border-white/10 bg-[#111827] p-4"><div className="text-[10px] uppercase tracking-wide text-white/35">Exact Matches</div><div className="mt-1 font-mono text-2xl font-black text-amber-200">{exact.length}</div></div>
            <div className="rounded-xl border border-white/10 bg-[#111827] p-4"><div className="text-[10px] uppercase tracking-wide text-white/35">Root Matches</div><div className="mt-1 font-mono text-2xl font-black text-violet-200">{root.length}</div></div>
          </section>

          <MatchSection id="exact-matches" title="Exact Number Matches" description="Direct compound-number connections to today’s daily code." players={exact} hrMap={hrMap} accent="exact" />
          <MatchSection id="root-matches" title="Reduced-Root Matches" description="Players whose relevant values reduce to today’s primary number family." players={root} hrMap={hrMap} accent="root" />

          <section id="explorer" className="rounded-2xl border border-white/10 bg-[#111827] p-4 sm:p-5">
            <h2 className="text-lg font-black">Player Explorer</h2><p className="mt-1 text-xs text-white/45">Search and combine criteria to build your own numerology match list.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px]">
              <label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search player, team, opponent, or pitcher" className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-3 text-sm text-white outline-none" /></label>
              <select value={team} onChange={(event) => setTeam(event.target.value)} className="rounded-xl border border-white/10 bg-[#0d1422] px-3 py-2.5 text-sm text-white"><option value="all">All teams</option>{teams.map((value) => <option key={value} value={value}>{value}</option>)}</select>
            </div>
            <div className="mt-3 flex flex-wrap gap-3">{[[exactOnly, setExactOnly, "Exact match"], [rootOnly, setRootOnly, "Root match"], [confirmedOnly, setConfirmedOnly, "Confirmed lineup"], [hasHrOnly, setHasHrOnly, "Has HR model data"]].map(([checked, setter, label]) => <label key={String(label)} className="flex cursor-pointer items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-white/65"><input type="checkbox" checked={Boolean(checked)} onChange={() => (setter as React.Dispatch<React.SetStateAction<boolean>>)((current) => !current)} />{String(label)}</label>)}</div>
            <div className="mt-4 divide-y divide-white/8">{explorer.map((player) => <div key={`${player.playerName}-${player.team}`} className="grid gap-3 py-3 sm:grid-cols-[1fr_auto_auto]"><div><div className="font-bold">{player.playerName}</div><div className="text-xs text-white/40">{player.team} vs {player.opponent}{player.opposingPitcher ? ` · ${player.opposingPitcher}` : ""}</div><div className="mt-1 flex gap-1">{player.exact && <span className="rounded bg-amber-300/10 px-2 py-0.5 text-[9px] text-amber-200">Exact</span>}{player.root && <span className="rounded bg-violet-300/10 px-2 py-0.5 text-[9px] text-violet-200">Root</span>}</div></div><div className="sm:text-right"><div className="text-[9px] uppercase text-violet-300/50">Numerology</div><div className="font-mono font-black text-violet-200">{player.numerologyScore}</div></div><div className="sm:text-right"><div className="text-[9px] uppercase text-sky-300/50">HR Score</div><div className="font-mono font-black text-sky-300">{value(player.batter?.hrScore ?? player.baseballScore)}</div></div></div>)}{explorer.length === 0 && <div className="py-10 text-center text-sm text-white/40">No players match all selected criteria.</div>}</div>
          </section>
        </div>}
      </div>
    </main>
  </SiteShell>;
}
