import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, Filter, Search } from "lucide-react";

type MatchReason = {
  field: string;
  value: number;
  root?: number;
  label: string;
};

type RecentActivity = {
  source?: string;
  previousThreeGameAtBats?: number | null;
};

type ExactPlayer = {
  playerId?: number | null;
  personId?: number | null;
  playerName: string;
  team: string;
  opponent: string;
  opposingPitcher?: string | null;
  jerseyNumber?: number | null;
  battingOrder?: number | null;
  lineupStatus?: string;
  numerologyScore: number;
  baseballScore?: number | null;
  matches?: MatchReason[];
  exactNumberMatches?: MatchReason[];
  rootNumberMatches?: MatchReason[];
  recentActivity?: RecentActivity;
  recommendedMarket?: string;
  candidateSource?: string;
};

type HrBatter = {
  player: string;
  team: string;
  opponent?: string;
  opposingPitcher?: string;
  position?: string;
  ballpark?: string;
  parkFactor?: number | null;
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
  opposingPitcherHrVs?: number | null;
  pitcherXera?: number | null;
  pitcherFlyBallRate?: number | null;
  angleTags?: string[];
};

type BattingLine = {
  gamesPlayed?: number;
  atBats?: number;
  runs?: number;
  hits?: number;
  doubles?: number;
  triples?: number;
  homeRuns?: number;
  rbi?: number;
  baseOnBalls?: number;
  strikeOuts?: number;
  avg?: string;
  obp?: string;
  slg?: string;
  ops?: string;
};

type StatsBundle = {
  season: BattingLine | null;
  last14: BattingLine | null;
};

type ExplorerRecord = ExactPlayer & {
  exact: boolean;
  root: boolean;
  hr: HrBatter | null;
};

const statsCache = new Map<number, Promise<StatsBundle>>();

const TEAM_LOGO_CODES: Record<string, string> = {
  AZ: "ari", ATH: "ath", ATL: "atl", BAL: "bal", BOS: "bos", CHC: "chc", CWS: "chw",
  CIN: "cin", CLE: "cle", COL: "col", DET: "det", HOU: "hou", KC: "kc", LAA: "laa",
  LAD: "lad", MIA: "mia", MIL: "mil", MIN: "min", NYM: "nym", NYY: "nyy", PHI: "phi",
  PIT: "pit", SD: "sd", SEA: "sea", SF: "sf", STL: "stl", TB: "tb", TEX: "tex",
  TOR: "tor", WSH: "wsh",
};

function normalize(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function playerId(player: ExactPlayer) {
  const value = Number(player.playerId ?? player.personId);
  return Number.isFinite(value) ? value : null;
}

function teamLogoUrl(team: string) {
  const code = TEAM_LOGO_CODES[team] ?? team.toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/mlb/500/${code}.png`;
}

function formatValue(value: number | null | undefined, kind: "number" | "percent" | "decimal" = "number") {
  if (value == null || !Number.isFinite(Number(value))) return "N/A";
  if (kind === "percent") return `${Number(value).toFixed(1)}%`;
  if (kind === "decimal") return Number(value).toFixed(3);
  return Number(value).toFixed(Number(value) % 1 === 0 ? 0 : 1);
}

function asDate(date: Date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`;
}

function extractStat(json: unknown, type: "season" | "byDateRange"): BattingLine | null {
  const groups = (json as { stats?: Array<{ type?: { displayName?: string }; splits?: Array<{ stat?: BattingLine }> }> })?.stats ?? [];
  const group = groups.find((item) => item.type?.displayName === type) ?? groups[0];
  return group?.splits?.[0]?.stat ?? null;
}

function loadPlayerStats(id: number, slateDate: string): Promise<StatsBundle> {
  const existing = statsCache.get(id);
  if (existing) return existing;
  const end = new Date(`${slateDate}T12:00:00`);
  const start = new Date(end);
  start.setDate(start.getDate() - 13);
  const year = end.getFullYear();
  const request = Promise.all([
    fetch(`https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=season&group=hitting&season=${year}`).then((response) => response.ok ? response.json() : null),
    fetch(`https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=byDateRange&group=hitting&season=${year}&startDate=${asDate(start)}&endDate=${asDate(end)}`).then((response) => response.ok ? response.json() : null),
  ]).then(([season, last14]) => ({ season: extractStat(season, "season"), last14: extractStat(last14, "byDateRange") })).catch(() => ({ season: null, last14: null }));
  statsCache.set(id, request);
  return request;
}

function StatComparison({ stats, loading }: { stats: StatsBundle | null; loading: boolean }) {
  const rows: Array<[string, keyof BattingLine]> = [
    ["G", "gamesPlayed"], ["AB", "atBats"], ["H", "hits"], ["HR", "homeRuns"], ["RBI", "rbi"],
    ["BB", "baseOnBalls"], ["K", "strikeOuts"], ["AVG", "avg"], ["OBP", "obp"], ["SLG", "slg"], ["OPS", "ops"],
  ];
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-[#89ceff]/20">
      <table className="w-full min-w-[430px] text-left text-xs">
        <thead className="bg-[#89ceff]/10"><tr><th className="px-3 py-2 text-[#89ceff]">Split</th>{rows.map(([label]) => <th key={label} className="px-2 py-2 text-center text-[#89ceff]">{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-[#494454]/25 bg-[#11131b]">
          {(["season", "last14"] as const).map((split) => <tr key={split}><td className="whitespace-nowrap px-3 py-2 font-semibold text-[#e2e1ee]">{split === "season" ? "Season" : "Last 14"}</td>{rows.map(([, key]) => <td key={key} className="px-2 py-2 text-center font-mono text-[#cbc3d7]/75">{loading ? "…" : stats?.[split]?.[key] ?? "N/A"}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

function HrModelTable({ batter }: { batter: HrBatter | null }) {
  const rows = [
    ["HR Score", batter?.hrScore, "number"], ["HR Rank", batter?.hrScoreRank, "number"],
    ["Barrel %", batter?.barrelRate, "percent"], ["Hard Hit %", batter?.hardHitRate, "percent"],
    ["Exit Velocity", batter?.exitVelo, "number"], ["ISO", batter?.iso, "decimal"],
    ["HR/FB %", batter?.hrFBRatio, "percent"], ["Pull %", batter?.pullRate, "percent"],
    ["Last 7 HR", batter?.last7HR, "number"], ["Last 30 HR", batter?.last30HR, "number"],
    ["Pitcher HR matchup", batter?.opposingPitcherHrVs, "number"], ["Pitcher xERA", batter?.pitcherXera, "number"],
    ["Pitcher FB %", batter?.pitcherFlyBallRate, "percent"], ["Park Factor", batter?.parkFactor, "number"],
  ] as const;
  return (
    <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[#89ceff]/20 bg-[#89ceff]/10 sm:grid-cols-3">
      {rows.map(([label, value, kind]) => <div key={label} className="bg-[#11131b] p-2.5"><p className="text-[9px] font-bold uppercase tracking-wide text-[#89ceff]/65">{label}</p><p className="mt-1 font-mono text-sm font-semibold text-[#89ceff]">{formatValue(value, kind)}</p></div>)}
    </div>
  );
}

function InlineTileDetails({ player, batter, slateDate }: { player: ExactPlayer; batter: HrBatter | null; slateDate: string }) {
  const [numerologyOpen, setNumerologyOpen] = useState(false);
  const [baseballOpen, setBaseballOpen] = useState(false);
  const [stats, setStats] = useState<StatsBundle | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const id = playerId(player);
  const confirmed = player.lineupStatus === "confirmed" || player.recentActivity?.source === "active_lineup";

  useEffect(() => {
    if (!baseballOpen || id == null || stats) return;
    setStatsLoading(true);
    loadPlayerStats(id, slateDate).then(setStats).finally(() => setStatsLoading(false));
  }, [baseballOpen, id, slateDate, stats]);

  return (
    <div className="mt-4 space-y-2">
      <button type="button" onClick={() => setNumerologyOpen((value) => !value)} aria-expanded={numerologyOpen} className="flex w-full items-center justify-between rounded-lg border border-[#d0bcff]/25 bg-[#d0bcff]/10 px-3 py-2.5 text-left text-sm font-bold text-[#d0bcff] transition hover:bg-[#d0bcff]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d0bcff]">
        <span>Numerology</span><span className="flex items-center gap-2 font-mono"><strong>{player.numerologyScore}</strong>{numerologyOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
      </button>
      {numerologyOpen && <div className="rounded-lg border border-[#d0bcff]/15 bg-[#11131b] p-3"><p className="text-xs text-[#cbc3d7]/60">Exact matching data points</p><div className="mt-2 space-y-2">{(player.matches ?? player.exactNumberMatches ?? []).map((match) => <div key={`${match.field}-${match.label}`} className="flex items-center justify-between gap-3 rounded-md bg-[#d0bcff]/5 px-3 py-2"><span className="text-sm font-semibold text-[#e2e1ee]">{match.label}</span><span className="text-[10px] uppercase tracking-wide text-[#d0bcff]/65">{match.field.replace(/([A-Z])/g, " $1")}</span></div>)}</div></div>}

      <button type="button" onClick={() => setBaseballOpen((value) => !value)} aria-expanded={baseballOpen} className="flex w-full items-center justify-between rounded-lg border border-[#89ceff]/25 bg-[#89ceff]/10 px-3 py-2.5 text-left text-sm font-bold text-[#89ceff] transition hover:bg-[#89ceff]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#89ceff]">
        <span>Baseball Model Stats</span><span className="flex items-center gap-2 font-mono"><strong>{batter?.hrScore ?? player.baseballScore ?? "N/A"}</strong>{baseballOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
      </button>
      {baseballOpen && <div className="rounded-lg border border-[#89ceff]/15 bg-[#11131b] p-3"><p className="text-xs leading-5 text-[#cbc3d7]/60">Joe Knows Ball HR model inputs plus standard hitting results for the season and most recent 14-day period. These do not affect numerology ranking.</p><HrModelTable batter={batter} /><StatComparison stats={stats} loading={statsLoading} />{!batter && <p className="mt-3 text-xs text-amber-200/70">This player is not currently present in the HR props table, so model fields are N/A.</p>}</div>}

      <div className={`inline-flex rounded-full px-3 py-1.5 text-[10px] font-bold ${confirmed ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-200"}`}>Today&apos;s Lineup: {confirmed ? "Confirmed" : "Unconfirmed"}</div>
    </div>
  );
}

const FILTERS = [
  ["confirmed", "Today's lineup confirmed"], ["recent", "Recent activity fallback"],
  ["exact", "Exact number match"], ["root", "Reduced-root match"],
  ["num50", "Numerology score 50+"], ["num75", "Numerology score 75+"],
  ["hasHr", "Has HR model data"], ["hr60", "HR score 60+"], ["hr70", "HR score 70+"], ["hr80", "HR score 80+"],
  ["barrel12", "Barrel rate 12%+"], ["hard45", "Hard-hit rate 45%+"], ["ev92", "Exit velocity 92+"],
  ["iso220", "ISO .220+"], ["pull40", "Pull rate 40%+"],
] as const;

type FilterKey = typeof FILTERS[number][0];

function ExplorerBuilder({ records }: { records: ExplorerRecord[] }) {
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState("all");
  const [selected, setSelected] = useState<Set<FilterKey>>(new Set());
  const teams = useMemo(() => [...new Set(records.map((record) => record.team))].sort(), [records]);
  const toggle = (key: FilterKey) => setSelected((current) => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next; });
  const filtered = useMemo(() => records.filter((record) => {
    const text = `${record.playerName} ${record.team} ${record.opponent} ${record.opposingPitcher ?? ""}`.toLowerCase();
    if (query.trim() && !text.includes(query.trim().toLowerCase())) return false;
    if (team !== "all" && record.team !== team) return false;
    const checks: Partial<Record<FilterKey, boolean>> = {
      confirmed: record.lineupStatus === "confirmed" || record.recentActivity?.source === "active_lineup",
      recent: record.recentActivity?.source === "previous_three_games",
      exact: record.exact,
      root: record.root,
      num50: record.numerologyScore >= 50,
      num75: record.numerologyScore >= 75,
      hasHr: record.hr?.hrScore != null,
      hr60: (record.hr?.hrScore ?? -1) >= 60,
      hr70: (record.hr?.hrScore ?? -1) >= 70,
      hr80: (record.hr?.hrScore ?? -1) >= 80,
      barrel12: (record.hr?.barrelRate ?? -1) >= 12,
      hard45: (record.hr?.hardHitRate ?? -1) >= 45,
      ev92: (record.hr?.exitVelo ?? -1) >= 92,
      iso220: (record.hr?.iso ?? -1) >= 0.22,
      pull40: (record.hr?.pullRate ?? -1) >= 40,
    };
    return [...selected].every((key) => checks[key]);
  }), [query, records, selected, team]);

  return (
    <div className="rounded-xl border border-[#1c223d] bg-[#11131b] p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
        <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search players, teams, opponent or pitcher" className="w-full rounded-lg border border-[#494454] bg-[#1d1f28] py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-[#a078ff]" /></label>
        <select value={team} onChange={(event) => setTeam(event.target.value)} className="rounded-lg border border-[#494454] bg-[#1d1f28] px-3 py-2.5 text-sm text-white outline-none"><option value="all">All teams</option>{teams.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <button type="button" onClick={() => { setQuery(""); setTeam("all"); setSelected(new Set()); }} className="rounded-lg border border-[#494454] px-4 py-2.5 text-sm font-semibold text-[#cbc3d7] hover:bg-[#282a32]">Reset</button>
      </div>
      <div className="mt-4 rounded-lg border border-[#494454]/50 bg-[#191b24] p-3">
        <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[#d0bcff]"><Filter className="h-4 w-4" />Build your own match</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{FILTERS.map(([key, label]) => <label key={key} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-[#cbc3d7]/75 hover:bg-white/5"><input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} className="accent-violet-500" />{label}</label>)}</div>
        <p className="mt-3 text-[10px] text-[#cbc3d7]/45">Selected criteria are combined with AND logic. A player must satisfy every checked condition.</p>
      </div>
      <div className="mt-4 flex items-center justify-between"><p className="text-sm font-semibold text-[#e2e1ee]">Matching players</p><span className="rounded-full bg-[#d0bcff]/10 px-3 py-1 font-mono text-xs text-[#d0bcff]">{filtered.length}</span></div>
      <div className="mt-3 divide-y divide-[#494454]/25">{filtered.slice(0, 100).map((record) => <div key={`${record.playerName}-${record.team}`} className="grid gap-3 py-3 sm:grid-cols-[1fr_auto_auto]"><div><p className="font-semibold text-[#e2e1ee]">{record.playerName}</p><p className="text-xs text-[#cbc3d7]/50">{record.team} vs {record.opponent}{record.opposingPitcher ? ` · ${record.opposingPitcher}` : ""}</p><div className="mt-1 flex flex-wrap gap-1.5">{record.exact && <span className="rounded bg-[#e9c349]/10 px-2 py-0.5 text-[9px] text-[#ffe088]">Exact</span>}{record.root && <span className="rounded bg-[#d0bcff]/10 px-2 py-0.5 text-[9px] text-[#d0bcff]">Root</span>}</div></div><div className="text-left sm:text-right"><p className="text-[9px] uppercase text-[#d0bcff]/65">Numerology</p><p className="font-mono font-bold text-[#d0bcff]">{record.numerologyScore}</p></div><div className="text-left sm:text-right"><p className="text-[9px] uppercase text-[#89ceff]/65">HR score</p><p className="font-mono font-bold text-[#89ceff]">{record.hr?.hrScore ?? "N/A"}</p></div></div>)}{filtered.length === 0 && <p className="py-8 text-center text-sm text-[#cbc3d7]/45">No players satisfy all selected criteria.</p>}</div>
    </div>
  );
}

export default function NumerologyExactMatchDetails() {
  const [numerology, setNumerology] = useState<Record<string, unknown> | null>(null);
  const [batters, setBatters] = useState<HrBatter[]>([]);
  const [cardMounts, setCardMounts] = useState<Array<{ element: HTMLElement; player: ExactPlayer }>>([]);
  const [explorerMount, setExplorerMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (window.location.pathname !== "/mlb/numerology") return;
    let cancelled = false;
    Promise.all([
      fetch("/data/mlb/numerology-daily.json", { cache: "no-store" }).then((response) => response.json()),
      fetch("/data/mlb/hr-props-raw.json", { cache: "no-store" }).then((response) => response.json()),
    ]).then(([daily, hr]) => { if (!cancelled) { setNumerology(daily); setBatters(hr?.batters ?? []); } }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const exactPlayers = (numerology?.exactNumberMatches as ExactPlayer[] | undefined) ?? [];
  const slateDate = String(numerology?.date ?? new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (!numerology || exactPlayers.length === 0) return;
    const bind = () => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>("#exact-matches article"));
      const mounts: Array<{ element: HTMLElement; player: ExactPlayer }> = [];
      cards.forEach((card, index) => {
        const player = exactPlayers[index];
        if (!player) return;
        const content = card.firstElementChild as HTMLElement | null;
        if (!content) return;
        const header = content.firstElementChild as HTMLElement | null;
        const jersey = header?.lastElementChild as HTMLElement | null;
        if (header && jersey && !header.querySelector("[data-team-logo-stack]")) {
          const stack = document.createElement("div");
          stack.dataset.teamLogoStack = "true";
          stack.className = "flex shrink-0 flex-col items-center gap-1.5";
          const logo = document.createElement("img");
          logo.src = teamLogoUrl(player.team);
          logo.alt = `${player.team} logo`;
          logo.className = "h-8 w-8 object-contain";
          logo.onerror = () => { logo.style.display = "none"; };
          header.insertBefore(stack, jersey);
          stack.appendChild(logo);
          stack.appendChild(jersey);
        }
        const children = Array.from(content.children) as HTMLElement[];
        children.slice(2).forEach((child) => { if (!child.dataset.numerologyEnhancementMount) child.style.display = "none"; });
        let mount = content.querySelector<HTMLElement>("[data-numerology-enhancement-mount]");
        if (!mount) {
          mount = document.createElement("div");
          mount.dataset.numerologyEnhancementMount = "true";
          content.appendChild(mount);
        }
        mounts.push({ element: mount, player });
      });
      setCardMounts(mounts);

      const explorer = document.querySelector<HTMLElement>("#explorer");
      if (explorer) {
        const oldPanel = explorer.children[1] as HTMLElement | undefined;
        if (oldPanel) oldPanel.style.display = "none";
        let mount = explorer.querySelector<HTMLElement>("[data-custom-explorer-mount]");
        if (!mount) {
          mount = document.createElement("div");
          mount.dataset.customExplorerMount = "true";
          explorer.appendChild(mount);
        }
        setExplorerMount(mount);
      }
    };
    bind();
    const observer = new MutationObserver(bind);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [exactPlayers, numerology]);

  const hrByPlayer = useMemo(() => new Map(batters.map((batter) => [`${normalize(batter.player)}|${batter.team}`, batter])), [batters]);
  const explorerRecords = useMemo(() => {
    if (!numerology) return [];
    const exact = (numerology.exactNumberMatches as ExactPlayer[] | undefined) ?? [];
    const root = (numerology.rootNumberMatches as ExactPlayer[] | undefined) ?? [];
    const featured = (numerology.featuredPlays as ExactPlayer[] | undefined) ?? [];
    const best = (numerology.bestAvailable as ExactPlayer[] | undefined) ?? [];
    const watch = (numerology.watchlist as ExactPlayer[] | undefined) ?? [];
    const map = new Map<string, ExplorerRecord>();
    const add = (player: ExactPlayer, kind?: "exact" | "root") => {
      const key = `${normalize(player.playerName)}|${player.team}`;
      const current = map.get(key);
      const merged: ExplorerRecord = {
        ...(current ?? player),
        ...player,
        exact: current?.exact || kind === "exact",
        root: current?.root || kind === "root",
        hr: hrByPlayer.get(key) ?? null,
      };
      map.set(key, merged);
    };
    exact.forEach((player) => add(player, "exact"));
    root.forEach((player) => add(player, "root"));
    featured.forEach((player) => add(player));
    best.forEach((player) => add(player));
    watch.forEach((player) => add(player));
    return [...map.values()].sort((a, b) => b.numerologyScore - a.numerologyScore || a.playerName.localeCompare(b.playerName));
  }, [hrByPlayer, numerology]);

  return (
    <>
      {cardMounts.map(({ element, player }) => createPortal(<InlineTileDetails key={`${player.playerName}-${player.team}`} player={player} batter={hrByPlayer.get(`${normalize(player.playerName)}|${player.team}`) ?? null} slateDate={slateDate} />, element))}
      {explorerMount && createPortal(<ExplorerBuilder records={explorerRecords} />, explorerMount)}
    </>
  );
}
