import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpDown, ChevronDown, Clock } from "lucide-react";
import SiteShell from "@/components/layout/SiteShell";
import SeoFooterBlock from "@/components/SeoFooterBlock";
import StatSliders from "@/components/StatSliders";
import TeamLogo from "@/components/TeamLogo";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type ScheduleGame } from "@/hooks/useSchedule";
import { useUpcomingSchedule } from "@/hooks/useUpcomingSchedule";
import { useLiveOdds, type LiveOddsEvent } from "@/hooks/useLiveOdds";
import { useLiveTeams } from "@/hooks/useLiveTeams";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  DEFAULT_STAT_WEIGHTS,
  ELITE_8_PRESET_WEIGHTS,
  buildCanonicalTeams,
  calculateTeamScore,
  findTeamByEspn,
  type StatWeight,
  type Team,
} from "@/data/ncaaTeams";
import { buildPlaceholderBracketSource, buildTournamentMatchups, loadOfficialBracketSource, type BracketSourceConfig } from "@/lib/bracket";
import {
  buildVegasProbabilityComparison,
  formatMoneyline,
  formatProbabilityValue,
  getModelEdgeIntensity,
  type VegasProbabilityComparison,
} from "@/lib/odds";
import { formatRoundedPercent } from "@/lib/numberFormat";
import { useLast10 } from "@/hooks/useLast10";

type SortMode = "top-edge" | "smallest-edge" | "game-time" | "model-favorite" | "spread-rank";

interface SpreadRankInfo {
  canonicalId: string;
  gameId: string;
  name: string;
  abbreviation: string;
  logo?: string | null;
  spread: number;
  modelProb: number;
  spreadRank: number;
  modelRank: number;
  poolSize: number;
  /** modelRank − spreadRank; negative = model likes more than Vegas */
  rankDelta: number;
}

interface BettingBoardEntry {
  game: ScheduleGame;
  away: Team | null;
  home: Team | null;
  tournamentContext: {
    region: string;
    seeds: [number, number];
    route: string;
  } | null;
  modelProbAway: number | null;
  modelProbHome: number | null;
  vegas: VegasProbabilityComparison | null;
  modelFavorite: "away" | "home" | "even";
  edgeValue: number | null;
  edgeSide: "away" | "home" | "even";
  link: string | null;
  homeSpread: number | null;
  awaySpread: number | null;
}

function formatGameTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getDateGroupLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const label = d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  if (d.toDateString() === today.toDateString()) return `Today — ${label}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow — ${label}`;
  return label;
}

function getEdgeClass(points: number | null) {
  const intensity = getModelEdgeIntensity(points);
  if (intensity === "high") return "border-[hsl(var(--success)/0.25)] bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]";
  if (intensity === "medium") return "border-primary/20 bg-primary/10 text-primary";
  if (intensity === "low") return "border-border bg-secondary/70 text-foreground";
  return "border-border bg-secondary/60 text-muted-foreground";
}

function buildEntryLink(game: ScheduleGame, away: Team | null, home: Team | null, tournamentRoute: string | null) {
  if (tournamentRoute) return tournamentRoute;
  if (!away || !home) return null;
  return `/schedule/${game.id}?away=${encodeURIComponent(away.canonicalId)}&home=${encodeURIComponent(home.canonicalId)}`;
}

function getSpreadDiscrepancy(entry: BettingBoardEntry, spreadRankMap: Map<string, SpreadRankInfo>): number {
  const gameId = String(entry.game.id);
  const awayRank = entry.away ? spreadRankMap.get(`${gameId}:${entry.away.canonicalId}`) : null;
  const homeRank = entry.home ? spreadRankMap.get(`${gameId}:${entry.home.canonicalId}`) : null;
  return Math.max(awayRank ? Math.abs(awayRank.rankDelta) : 0, homeRank ? Math.abs(homeRank.rankDelta) : 0);
}

function sortEntries(
  entries: BettingBoardEntry[],
  mode: SortMode,
  spreadRankMap: Map<string, SpreadRankInfo> = new Map(),
) {
  const sorted = [...entries];
  sorted.sort((a, b) => {
    const edgeA = a.edgeValue ?? -1;
    const edgeB = b.edgeValue ?? -1;

    if (mode === "smallest-edge") {
      if (edgeA !== edgeB) return edgeA - edgeB;
    } else if (mode === "game-time") {
      const timeDiff = new Date(a.game.date).getTime() - new Date(b.game.date).getTime();
      if (timeDiff !== 0) return timeDiff;
    } else if (mode === "model-favorite") {
      const favA = Math.max(a.modelProbAway ?? 0, a.modelProbHome ?? 0);
      const favB = Math.max(b.modelProbAway ?? 0, b.modelProbHome ?? 0);
      if (favA !== favB) return favB - favA;
    } else if (mode === "spread-rank") {
      const discA = getSpreadDiscrepancy(a, spreadRankMap);
      const discB = getSpreadDiscrepancy(b, spreadRankMap);
      if (discA !== discB) return discB - discA;
    } else if (edgeA !== edgeB) {
      return edgeB - edgeA;
    }

    if (edgeA !== edgeB) return edgeB - edgeA;
    const dateDiff = new Date(a.game.date).getTime() - new Date(b.game.date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return a.game.name.localeCompare(b.game.name);
  });
  return sorted;
}

function InterpretationBadge({ delta }: { delta: number }) {
  if (delta <= -5)
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold border border-primary/20 bg-primary/10 text-primary">
        🚨 Model Strong Lean
      </span>
    );
  if (delta < 0)
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold border border-primary/15 bg-primary/5 text-primary">
        ✅ Model Slight Lean
      </span>
    );
  if (delta === 0)
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-secondary text-muted-foreground">
        ➖ Aligned
      </span>
    );
  if (delta <= 4)
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold border border-[hsl(var(--success)/0.2)] bg-[hsl(var(--success)/0.08)] text-[hsl(var(--success))]">
        ⚠️ Vegas Slight Lean
      </span>
    );
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold border border-amber-200 bg-amber-50 text-amber-700">
      🔥 Vegas Strong Lean
    </span>
  );
}

type DeltaSortField = "delta" | "spread" | "spreadRank" | "modelRank";

type MismatchEntry = {
  attackerCId: string;
  attackerAbbr: string;
  attackerLogo?: string | null;
  attackerName: string;
  defenderAbbr: string;
  defenderLogo?: string | null;
  defenderName: string;
  score: number;
  context: string;
  link: string | null;
  gameTime: string;
};

function TopDeltaRankTable({
  entries,
  boardEntries,
}: {
  entries: SpreadRankInfo[];
  boardEntries: BettingBoardEntry[];
}) {
  const [sortField, setSortField] = useState<DeltaSortField>("delta");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const gameEntryMap = useMemo(() => {
    const m = new Map<string, BettingBoardEntry>();
    for (const e of boardEntries) m.set(String(e.game.id), e);
    return m;
  }, [boardEntries]);

  const sorted = useMemo(() => {
    return [...entries].sort((a, b) => {
      let diff = 0;
      if (sortField === "delta") diff = a.rankDelta - b.rankDelta;
      else if (sortField === "spread") diff = a.spread - b.spread;
      else if (sortField === "spreadRank") diff = a.spreadRank - b.spreadRank;
      else if (sortField === "modelRank") diff = a.modelRank - b.modelRank;
      return diff * sortDir;
    });
  }, [entries, sortField, sortDir]);

  const gameColorMap = useMemo(() => {
    const seen = new Map<string, number>();
    let idx = 0;
    for (const entry of sorted) {
      if (!seen.has(entry.gameId)) seen.set(entry.gameId, idx++ % 2);
    }
    return seen;
  }, [sorted]);

  const toggleSort = (field: DeltaSortField) => {
    if (sortField === field) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortField(field); setSortDir(1); }
  };

  const thClass = (field: DeltaSortField, align: "left" | "right" = "right") =>
    `pb-2 ${align === "left" ? "text-left" : "text-right"} cursor-pointer select-none hover:text-foreground text-[10px] font-semibold uppercase tracking-wider ${sortField === field ? "text-foreground" : "text-muted-foreground"}`;

  const sortIndicator = (field: DeltaSortField) =>
    sortField === field ? (sortDir === 1 ? " ↑" : " ↓") : "";

  const fmtSpread = (v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1));
  const poolSize = entries[0]?.poolSize ?? entries.length;

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card/95 p-8 text-center shadow-sm">
        <p className="text-sm text-muted-foreground">No spread data available. Lines populate when live odds load.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card/95 p-4 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">Top Delta Rank</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {entries.length} teams with live lines — sorted by model vs Vegas rank gap. Negative Δ = model likes more than Vegas; positive = Vegas likes more than model.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Team</th>
              <th className={thClass("spread")} onClick={() => toggleSort("spread")}>Spread{sortIndicator("spread")}</th>
              <th className={thClass("spreadRank")} onClick={() => toggleSort("spreadRank")}>Spread Rk{sortIndicator("spreadRank")}</th>
              <th className={thClass("modelRank")} onClick={() => toggleSort("modelRank")}>Model Rk{sortIndicator("modelRank")}</th>
              <th className={thClass("delta")} onClick={() => toggleSort("delta")}>Δ{sortIndicator("delta")}</th>
              <th className="pb-2 text-left pl-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Signal</th>
              <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">vs.</th>
              <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Time</th>
              <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" />
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ canonicalId, gameId, name, abbreviation, logo, spread, spreadRank, modelRank, rankDelta }) => {
              const gameEntry = gameEntryMap.get(gameId);
              const isAlt = gameColorMap.get(gameId) === 0;
              let opponentAbbr = "—";
              let opponentLogo: string | undefined | null = undefined;
              let opponentName = "";
              if (gameEntry) {
                if (gameEntry.away?.canonicalId === canonicalId) {
                  opponentAbbr = gameEntry.home?.abbreviation || gameEntry.game.homeTeam?.abbreviation || "—";
                  opponentLogo = gameEntry.home?.logo || gameEntry.game.homeTeam?.logo;
                  opponentName = gameEntry.home?.name || gameEntry.game.homeTeam?.name || "";
                } else {
                  opponentAbbr = gameEntry.away?.abbreviation || gameEntry.game.awayTeam?.abbreviation || "—";
                  opponentLogo = gameEntry.away?.logo || gameEntry.game.awayTeam?.logo;
                  opponentName = gameEntry.away?.name || gameEntry.game.awayTeam?.name || "";
                }
              }
              return (
                <tr
                  key={`${gameId}:${canonicalId}`}
                  className={`border-b border-border/40 last:border-0 ${isAlt ? "bg-secondary/15" : ""}`}
                >
                  <td className="py-2 pr-2">
                    <div className="flex items-center gap-1.5">
                      <TeamLogo name={name} logo={logo} className="h-5 w-5 shrink-0" />
                      <span className="font-medium">{abbreviation}</span>
                    </div>
                  </td>
                  <td className="py-2 text-right tabular-nums">{fmtSpread(spread)}</td>
                  <td className="py-2 text-right tabular-nums">#{spreadRank} <span className="text-muted-foreground/60">/{poolSize}</span></td>
                  <td className="py-2 text-right tabular-nums">#{modelRank} <span className="text-muted-foreground/60">/{poolSize}</span></td>
                  <td className={`py-2 text-right tabular-nums font-semibold ${rankDelta < 0 ? "text-purple-400" : rankDelta > 0 ? "text-green-400" : "text-muted-foreground"}`}>
                    {rankDelta > 0 ? `+${rankDelta}` : rankDelta}
                  </td>
                  <td className="py-2 pl-3"><InterpretationBadge delta={rankDelta} /></td>
                  <td className="py-2 text-right">
                    {opponentAbbr !== "—" ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="text-muted-foreground">{opponentAbbr}</span>
                        {opponentLogo !== undefined && (
                          <TeamLogo name={opponentName} logo={opponentLogo} className="h-4 w-4 shrink-0" />
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-2 text-right text-muted-foreground whitespace-nowrap">
                    {gameEntry ? formatGameTime(gameEntry.game.date) : "—"}
                  </td>
                  <td className="py-2 pl-2 text-right">
                    {gameEntry?.link ? (
                      <Link to={gameEntry.link} className="text-[10px] font-semibold uppercase tracking-wide text-primary hover:underline">
                        View →
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MismatchCategoryCard({
  title,
  description,
  entries,
  defaultOpen = false,
}: {
  title: string;
  description: string;
  entries: MismatchEntry[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (entries.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-secondary/20 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-secondary/30 transition-colors"
      >
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-[11px] text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-secondary-foreground">
            {entries.length}
          </span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      {open && (
        <div className="border-t border-border/40 px-4 py-3 space-y-1">
          {entries.map((e, i) => (
            <div key={`${e.attackerCId}-${i}`} className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0">
              <div className="flex items-center gap-1.5 min-w-[76px]">
                <TeamLogo name={e.attackerName} logo={e.attackerLogo} className="h-5 w-5 shrink-0" />
                <span className="text-xs font-semibold text-foreground">{e.attackerAbbr}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">vs</span>
              <div className="flex items-center gap-1.5 min-w-[76px]">
                <TeamLogo name={e.defenderName} logo={e.defenderLogo} className="h-5 w-5 shrink-0" />
                <span className="text-xs text-foreground">{e.defenderAbbr}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-muted-foreground truncate">{e.context}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-[10px] text-muted-foreground whitespace-nowrap flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {e.gameTime}
                </span>
                {e.link ? (
                  <Link to={e.link} className="text-[10px] font-semibold uppercase tracking-wide text-primary hover:underline whitespace-nowrap">
                    View →
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MismatchSpecialsTab({ boardEntries }: { boardEntries: BettingBoardEntry[] }) {
  function computeCategory(
    filter: (attacker: Team, defender: Team) => { match: boolean; score: number; context: string },
    maxResults = 7,
  ): MismatchEntry[] {
    const results: (MismatchEntry & { _score: number })[] = [];
    for (const entry of boardEntries) {
      const { away, home, link, game } = entry;
      const pairs: [Team | null, Team | null][] = [[away, home], [home, away]];
      for (const [attacker, defender] of pairs) {
        if (!attacker || !defender) continue;
        const { match, score, context } = filter(attacker, defender);
        if (match) {
          results.push({
            attackerCId: attacker.canonicalId,
            attackerAbbr: attacker.abbreviation,
            attackerLogo: attacker.logo,
            attackerName: attacker.name,
            defenderAbbr: defender.abbreviation,
            defenderLogo: defender.logo,
            defenderName: defender.name,
            score,
            context,
            link,
            gameTime: formatGameTime(game.date),
            _score: score,
          });
        }
      }
    }
    results.sort((a, b) => b._score - a._score);
    return results.slice(0, maxResults);
  }

  const sharpshooterMismatches = computeCategory((attacker, defender) => {
    const a3 = attacker.stats.threePct;
    const dDE = defender.stats.adjDE;
    if (a3 === null || dDE === null) return { match: false, score: 0, context: "" };
    const match = a3 >= 36.5 && dDE >= 98;
    return { match, score: a3 + (dDE - 98) * 0.5, context: `${a3.toFixed(1)}% 3PT vs Adj.DE ${dDE.toFixed(0)}` };
  });

  const paceMismatches = computeCategory((attacker, defender) => {
    const aOE = attacker.stats.adjOE;
    const dTempo = defender.stats.tempo;
    if (aOE === null || dTempo === null) return { match: false, score: 0, context: "" };
    const match = aOE >= 114 && dTempo <= 67;
    return { match, score: (aOE - 114) + (70 - dTempo) * 0.8, context: `Adj.OE ${aOE.toFixed(1)} vs tempo ${dTempo.toFixed(1)}` };
  });

  const efficiencyMismatches = computeCategory((attacker, defender) => {
    const aOE = attacker.stats.adjOE;
    const dDE = defender.stats.adjDE;
    if (aOE === null || dDE === null) return { match: false, score: 0, context: "" };
    const diff = aOE - dDE;
    const match = diff >= 18;
    return { match, score: diff, context: `Adj.OE ${aOE.toFixed(1)} vs Adj.DE ${dDE.toFixed(1)} (gap ${diff > 0 ? "+" : ""}${diff.toFixed(1)})` };
  });

  const turnoverMismatches = computeCategory((attacker, defender) => {
    const aTOV = attacker.stats.tpg;
    const dTOV = defender.stats.tpg;
    if (aTOV === null || dTOV === null) return { match: false, score: 0, context: "" };
    const match = aTOV <= 12.5 && dTOV >= 13.5;
    return { match, score: dTOV - aTOV, context: `${aTOV.toFixed(1)} TOV/G vs opponent ${dTOV.toFixed(1)} TOV/G` };
  });

  const reboundingMismatches = computeCategory((attacker, defender) => {
    const aRPG = attacker.stats.rpg;
    const dRPG = defender.stats.rpg;
    if (aRPG === null || dRPG === null) return { match: false, score: 0, context: "" };
    const diff = aRPG - dRPG;
    const match = diff >= 3;
    return { match, score: diff, context: `${aRPG.toFixed(1)} RPG vs ${dRPG.toFixed(1)} RPG (+${diff.toFixed(1)} advantage)` };
  });

  const hasAny = sharpshooterMismatches.length > 0 || paceMismatches.length > 0 || efficiencyMismatches.length > 0 || turnoverMismatches.length > 0 || reboundingMismatches.length > 0;

  if (!hasAny) {
    return (
      <div className="rounded-2xl border border-border bg-card/95 p-8 text-center shadow-sm">
        <p className="text-sm text-muted-foreground">No mismatch matchups detected. Check back when more games with full stat coverage are available.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card/95 p-4 shadow-sm space-y-3">
      <div className="mb-2">
        <h2 className="text-lg font-semibold text-foreground">Mismatch Specials</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Stat-driven edge opportunities across 5 matchup categories, scored by mismatch severity.</p>
      </div>
      <MismatchCategoryCard
        title="🎯 Sharpshooter vs Porous Defense"
        description="High 3PT% team (≥ 36.5%) facing a weak defense (Adj.DE ≥ 98)"
        entries={sharpshooterMismatches}
        defaultOpen
      />
      <MismatchCategoryCard
        title="⚡ High Offense vs Slow Tempo"
        description="High-OE offense (≥ 114) faces a tempo-control team (≤ 67 possessions/game)"
        entries={paceMismatches}
      />
      <MismatchCategoryCard
        title="🔥 Efficiency Blowout"
        description="Adj. Offensive Efficiency significantly exceeds opponent's Adj. Defensive Efficiency (gap ≥ 18)"
        entries={efficiencyMismatches}
      />
      <MismatchCategoryCard
        title="🔄 Turnover Discipline Edge"
        description="Ball-secure team (≤ 12.5 TOV/G) vs turnover-prone opponent (≥ 13.5 TOV/G)"
        entries={turnoverMismatches}
      />
      <MismatchCategoryCard
        title="💪 Rebounding Domination"
        description="Significant rebounding advantage (3.0+ RPG gap)"
        entries={reboundingMismatches}
      />
    </div>
  );
}

function SpreadRankingsTable({ entries }: { entries: SpreadRankInfo[] }) {
  const fmtSpread = (v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1));
  const poolSize = entries[0]?.poolSize ?? entries.length;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            {["Team", "Spread", "Spread Rank", "Model Rank", "Δ Rank", "Interpretation"].map((h, i) => (
              <th
                key={h}
                className={`pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ${i === 0 ? "text-left" : i === 5 ? "text-left pl-3" : "text-right"}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map(({ canonicalId, gameId, name, abbreviation, logo, spread, spreadRank, modelRank, rankDelta }) => (
            <tr key={`${gameId}:${canonicalId}`} className="border-b border-border/40 last:border-0">
              <td className="py-2">
                <div className="flex items-center gap-2">
                  <TeamLogo name={name} logo={logo} className="h-5 w-5 shrink-0" />
                  <span className="font-medium">{abbreviation}</span>
                </div>
              </td>
              <td className="py-2 text-right tabular-nums">{fmtSpread(spread)}</td>
              <td className="py-2 text-right tabular-nums">#{spreadRank} <span className="text-muted-foreground/60">of {poolSize}</span></td>
              <td className="py-2 text-right tabular-nums">#{modelRank} <span className="text-muted-foreground/60">of {poolSize}</span></td>
              <td
                className={`py-2 text-right tabular-nums font-semibold ${
                  rankDelta < 0 ? "text-purple-400" : rankDelta > 0 ? "text-green-400" : "text-muted-foreground"
                }`}
              >
                {rankDelta > 0 ? `+${rankDelta}` : rankDelta}
              </td>
              <td className="py-2 pl-3">
                <InterpretationBadge delta={rankDelta} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProbabilityRow({
  logo,
  name,
  abbr,
  prob,
  isFavored,
}: {
  logo?: string | null;
  name: string;
  abbr: string;
  prob: string;
  isFavored: boolean;
}) {
  return (
    <div className={`flex items-center gap-1.5 ${isFavored ? "font-bold text-primary" : "text-muted-foreground/70"}`}>
      <TeamLogo name={name} logo={logo} className="h-4 w-4 shrink-0" />
      <span className="text-[11px] flex-1 min-w-0 truncate">{abbr}</span>
      <span className="text-[11px] tabular-nums shrink-0">{prob}</span>
    </div>
  );
}

function BettingBoardRow({
  entry,
  spreadRankMap,
}: {
  entry: BettingBoardEntry;
  spreadRankMap: Map<string, SpreadRankInfo>;
}) {
  const [spreadExpanded, setSpreadExpanded] = useState(false);
  const { data: last10Data } = useLast10();
  const l10Map = last10Data?.teams ?? {};
  const l10Away = entry.away?.espnId ? l10Map[entry.away.espnId] : null;
  const l10Home = entry.home?.espnId ? l10Map[entry.home.espnId] : null;

  function l10Badge(record: { wins: number; losses: number } | null | undefined) {
    if (!record) return null;
    const color = record.wins >= 8 ? "text-green-400" : record.wins >= 5 ? "text-muted-foreground" : "text-amber-400";
    return <span className={`text-[10px] font-semibold tabular-nums ${color}`}>L10: {record.wins}-{record.losses}</span>;
  }

  const edgeTeam =
    entry.edgeSide === "away"
      ? entry.away?.abbreviation || entry.game.awayTeam?.abbreviation || "Away"
      : entry.edgeSide === "home"
        ? entry.home?.abbreviation || entry.game.homeTeam?.abbreviation || "Home"
        : "Even";

  const lineText = entry.vegas
    ? `${formatMoneyline(entry.vegas.teamA.moneyline)} / ${formatMoneyline(entry.vegas.teamB.moneyline)}`
    : "Line unavailable";

  const edgeText =
    entry.edgeValue !== null && entry.edgeSide !== "even"
      ? `${edgeTeam} +${entry.edgeValue.toFixed(1)}%`
      : "No model edge";

  const awayAbbr = entry.away?.abbreviation || entry.game.awayTeam?.abbreviation || "Away";
  const homeAbbr = entry.home?.abbreviation || entry.game.homeTeam?.abbreviation || "Home";
  const awayLogo = entry.away?.logo || entry.game.awayTeam?.logo;
  const homeLogo = entry.home?.logo || entry.game.homeTeam?.logo;
  const awayName = entry.away?.name || entry.game.awayTeam?.name || "Away";
  const homeName = entry.home?.name || entry.game.homeTeam?.name || "Home";

  const modelAwayProb = entry.modelProbAway ?? 0;
  const modelHomeProb = entry.modelProbHome ?? 0;
  const vegasAwayProb = entry.vegas?.teamA.impliedProbability ?? 0;
  const vegasHomeProb = entry.vegas?.teamB.impliedProbability ?? 0;

  const edgeModelProb = entry.edgeSide === "away" ? entry.modelProbAway : entry.modelProbHome;
  const edgeVegasProb =
    entry.edgeSide === "away" ? entry.vegas?.teamA.impliedProbability : entry.vegas?.teamB.impliedProbability;

  const gameId = String(entry.game.id);
  const awayRank = entry.away ? spreadRankMap.get(`${gameId}:${entry.away.canonicalId}`) : null;
  const homeRank = entry.home ? spreadRankMap.get(`${gameId}:${entry.home.canonicalId}`) : null;
  const hasSpreadData = awayRank !== null || homeRank !== null;

  const mainGridClass =
    "grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,2.2fr),minmax(0,1fr),minmax(0,1fr),minmax(0,1fr),minmax(0,0.9fr),auto] md:items-center";

  const mainContent = (
    <>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {entry.tournamentContext ? (
            <Badge variant="outline" className="border-primary/25 bg-primary/5 text-primary">
              {entry.tournamentContext.region}
            </Badge>
          ) : null}
          {entry.game.status ? (
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {entry.game.status}
            </span>
          ) : null}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <TeamLogo
              name={entry.away?.name || entry.game.awayTeam?.name || "Away"}
              logo={entry.away?.logo || entry.game.awayTeam?.logo}
              className="h-8 w-8"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {entry.away?.name || entry.game.awayTeam?.name || "Away team"}
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-[11px] text-muted-foreground">
                  {entry.tournamentContext
                    ? `Seed ${entry.tournamentContext.seeds[0]}`
                    : entry.away?.record || entry.game.awayTeam?.record || "Record unavailable"}
                </p>
                {l10Badge(l10Away)}
              </div>
            </div>
          </div>
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">vs</span>
          <div className="flex items-center gap-2 min-w-0">
            <TeamLogo
              name={entry.home?.name || entry.game.homeTeam?.name || "Home"}
              logo={entry.home?.logo || entry.game.homeTeam?.logo}
              className="h-8 w-8"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {entry.home?.name || entry.game.homeTeam?.name || "Home team"}
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-[11px] text-muted-foreground">
                  {entry.tournamentContext
                    ? `Seed ${entry.tournamentContext.seeds[1]}`
                    : entry.home?.record || entry.game.homeTeam?.record || "Record unavailable"}
                </p>
                {l10Badge(l10Home)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-secondary/55 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Model</p>
        {entry.modelProbAway !== null && entry.modelProbHome !== null ? (
          <div className="space-y-1">
            <ProbabilityRow
              logo={awayLogo}
              name={awayName}
              abbr={awayAbbr}
              prob={formatRoundedPercent(modelAwayProb * 100)}
              isFavored={modelAwayProb >= modelHomeProb}
            />
            <ProbabilityRow
              logo={homeLogo}
              name={homeName}
              abbr={homeAbbr}
              prob={formatRoundedPercent(modelHomeProb * 100)}
              isFavored={modelHomeProb > modelAwayProb}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Unavailable</p>
        )}
      </div>

      <div className="rounded-xl bg-secondary/55 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Vegas</p>
        {entry.vegas ? (
          <div className="space-y-1">
            <ProbabilityRow
              logo={awayLogo}
              name={awayName}
              abbr={awayAbbr}
              prob={formatProbabilityValue(entry.vegas.teamA.impliedProbability)}
              isFavored={vegasAwayProb >= vegasHomeProb}
            />
            <ProbabilityRow
              logo={homeLogo}
              name={homeName}
              abbr={homeAbbr}
              prob={formatProbabilityValue(entry.vegas.teamB.impliedProbability)}
              isFavored={vegasHomeProb > vegasAwayProb}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Unavailable</p>
        )}
      </div>

      <div className="rounded-xl bg-secondary/55 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Model Edge</p>
        <div className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${getEdgeClass(entry.edgeValue)}`}>
          {edgeText}
        </div>
        {entry.vegas && edgeModelProb !== null && edgeVegasProb !== null && entry.edgeSide !== "even" && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Model {formatRoundedPercent(edgeModelProb * 100)} · Vegas {formatProbabilityValue(edgeVegasProb)}
          </p>
        )}
      </div>

      <div className="rounded-xl bg-secondary/55 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Vegas Line</p>
        <p className="mt-1 text-sm font-semibold text-foreground">{lineText}</p>
      </div>

      <div className="flex items-center justify-between gap-3 md:justify-end">
        <div className="text-right">
          <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground md:justify-end">
            <Clock className="h-3 w-3" />
            {formatGameTime(entry.game.date)}
          </p>
          {entry.link ? (
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-primary">View Analysis</p>
          ) : (
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Unavailable</p>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div
      className={`rounded-2xl border border-border bg-card/90 overflow-hidden transition-colors ${
        entry.link ? "hover:border-primary/40" : ""
      }`}
    >
      {entry.link ? (
        <Link to={entry.link} className={`${mainGridClass} hover:bg-secondary/40 transition-colors`}>
          {mainContent}
        </Link>
      ) : (
        <div className={mainGridClass}>{mainContent}</div>
      )}

      {hasSpreadData && (
        <>
          <button
            onClick={() => setSpreadExpanded((v) => !v)}
            className="flex w-full items-center gap-1.5 border-t border-border/20 px-4 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground hover:bg-secondary/20"
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform duration-150 ${spreadExpanded ? "rotate-180" : ""}`}
            />
            Spread Analysis
          </button>
          {spreadExpanded && (
            <div className="border-t border-border/30 bg-secondary/15 px-4 py-4">
              <div className="grid grid-cols-2 gap-6">
                {(
                  [
                    { rank: awayRank, abbr: awayAbbr, logo: awayLogo, name: awayName },
                    { rank: homeRank, abbr: homeAbbr, logo: homeLogo, name: homeName },
                  ] as const
                ).map(({ rank, abbr, logo, name }) =>
                  rank ? (
                    <div key={abbr} className="flex flex-col items-center gap-2 text-center">
                      <div className="flex items-center gap-1.5">
                        <TeamLogo name={name} logo={logo} className="h-5 w-5 shrink-0" />
                        <span className="text-sm font-bold text-foreground">{abbr}</span>
                      </div>
                      <div className="space-y-1 w-full">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Spread</span>
                          <span className="tabular-nums font-semibold text-foreground">
                            {rank.spread > 0 ? `+${rank.spread.toFixed(1)}` : rank.spread.toFixed(1)}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Spread Rank</span>
                          <span className="tabular-nums font-semibold text-foreground">
                            #{rank.spreadRank} <span className="text-muted-foreground/60 font-normal">of {rank.poolSize}</span>
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Model Rank</span>
                          <span className="tabular-nums font-semibold text-foreground">
                            #{rank.modelRank} <span className="text-muted-foreground/60 font-normal">of {rank.poolSize}</span>
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Δ Rank</span>
                          <span
                            className={`tabular-nums font-bold text-sm ${
                              rank.rankDelta < 0
                                ? "text-purple-400"
                                : rank.rankDelta > 0
                                  ? "text-green-400"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {rank.rankDelta > 0 ? `+${rank.rankDelta}` : rank.rankDelta}
                          </span>
                        </div>
                      </div>
                      <InterpretationBadge delta={rank.rankDelta} />
                    </div>
                  ) : (
                    <div key={abbr} className="flex items-center justify-center text-xs text-muted-foreground">
                      No spread data for {abbr}
                    </div>
                  ),
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function BettingEdge() {
  const [weights, setWeights] = useState<StatWeight[]>(DEFAULT_STAT_WEIGHTS);
  const [showControls, setShowControls] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("top-edge");
  const [selectedPreset, setSelectedPreset] = useState<"default" | "elite">("default");
  const [showSpreadRankings, setShowSpreadRankings] = useState(false);
  const [pageTab, setPageTab] = useState<"edge-board" | "top-delta" | "mismatch">("edge-board");
  const [bracketSource, setBracketSource] = useState<BracketSourceConfig>(buildPlaceholderBracketSource());
  const { data: liveTeams = [] } = useLiveTeams();
  const { games, isLoading, error } = useUpcomingSchedule(7);
  const { data: liveOdds = [] } = useLiveOdds();

  const teamPool = useMemo(() => buildCanonicalTeams(liveTeams), [liveTeams]);
  const officialMatchups = useMemo(() => buildTournamentMatchups(bracketSource, teamPool), [bracketSource, teamPool]);

  useEffect(() => {
    let ignore = false;
    loadOfficialBracketSource().then((payload) => {
      if (!ignore && payload) setBracketSource(payload);
    });
    return () => {
      ignore = true;
    };
  }, []);

  usePageSeo({
    title: "Betting Edge | NCAA Model vs Vegas Comparison | Joe Knows Ball",
    description:
      "Compare NCAA model probabilities against live Vegas implied odds with dynamic betting edges, sliders, and custom presets.",
    canonical: "https://www.joeknowsball.com/betting-edge",
  });

  const officialMatchupByGameId = useMemo(
    () => new Map(officialMatchups.map((matchup) => [matchup.gameId, matchup])),
    [officialMatchups],
  );

  // Pre-resolve Odds API team names to canonical IDs once, then reference cheaply per game
  const resolvedOddsEvents = useMemo(
    () =>
      liveOdds
        .map((event) => ({
          event,
          homeCanonicalId: findTeamByEspn(event.homeTeam, "", teamPool)?.canonicalId ?? null,
          awayCanonicalId: findTeamByEspn(event.awayTeam, "", teamPool)?.canonicalId ?? null,
        }))
        .filter(
          (r): r is { event: LiveOddsEvent; homeCanonicalId: string; awayCanonicalId: string } =>
            r.homeCanonicalId !== null && r.awayCanonicalId !== null,
        ),
    [liveOdds, teamPool],
  );

  const boardEntries = useMemo(() => {
    const entries = games.map((game) => {
      const away = game.awayTeam ? findTeamByEspn(game.awayTeam.name, game.awayTeam.abbreviation, teamPool) : null;
      const home = game.homeTeam ? findTeamByEspn(game.homeTeam.name, game.homeTeam.abbreviation, teamPool) : null;
      const matchup = officialMatchupByGameId.get(String(game.id));

      const scoreAway = away ? calculateTeamScore(away.stats, weights) : null;
      const scoreHome = home ? calculateTeamScore(home.stats, weights) : null;
      const totalScore = (scoreAway ?? 0) + (scoreHome ?? 0);
      const modelProbAway = scoreAway !== null && scoreHome !== null && totalScore > 0 ? scoreAway / totalScore : null;
      const modelProbHome = scoreAway !== null && scoreHome !== null && totalScore > 0 ? scoreHome / totalScore : null;

      // Prefer ESPN schedule odds; fall back to The Odds API when lines are missing
      let moneylineAway: number | null = game.odds?.awayMoneyline ?? null;
      let moneylineHome: number | null = game.odds?.homeMoneyline ?? null;
      let oddsProvider: string | null = game.odds?.provider ?? null;
      let awaySpread: number | null = null;
      let homeSpread: number | null = null;

      // Always look up live odds to get spreads; also fill in moneylines if ESPN didn't have them
      if (away && home) {
        const liveMatch = resolvedOddsEvents.find(
          (r) =>
            (r.homeCanonicalId === home.canonicalId && r.awayCanonicalId === away.canonicalId) ||
            (r.homeCanonicalId === away.canonicalId && r.awayCanonicalId === home.canonicalId),
        );
        if (liveMatch) {
          // Odds API may list teams in either order — swap-correct so our away/home align
          const isSwapped = liveMatch.homeCanonicalId === away.canonicalId;
          if (moneylineAway === null || moneylineHome === null) {
            moneylineAway = isSwapped ? liveMatch.event.homeMoneyline : liveMatch.event.awayMoneyline;
            moneylineHome = isSwapped ? liveMatch.event.awayMoneyline : liveMatch.event.homeMoneyline;
            oddsProvider = liveMatch.event.sportsbook;
          }
          awaySpread = isSwapped ? liveMatch.event.homeSpread : liveMatch.event.awaySpread;
          homeSpread = isSwapped ? liveMatch.event.awaySpread : liveMatch.event.homeSpread;
        }
      }

      const vegas =
        modelProbAway !== null && modelProbHome !== null
          ? buildVegasProbabilityComparison({
              modelProbA: modelProbAway,
              modelProbB: modelProbHome,
              moneylineA: moneylineAway,
              moneylineB: moneylineHome,
              sportsbook: oddsProvider,
            })
          : null;

      const modelFavorite =
        modelProbAway === null || modelProbHome === null
          ? "even"
          : modelProbAway > modelProbHome
            ? "away"
            : modelProbHome > modelProbAway
              ? "home"
              : "even";

      const edgeSide =
        vegas?.edge.team === "teamA" ? "away" : vegas?.edge.team === "teamB" ? "home" : "even";

      return {
        game,
        away,
        home,
        tournamentContext: matchup
          ? {
              region: `${matchup.region} Region`,
              seeds: [matchup.teamA.seed, matchup.teamB.seed] as [number, number],
              route: `/matchup/${matchup.gameId}`,
            }
          : null,
        modelProbAway,
        modelProbHome,
        vegas,
        modelFavorite,
        edgeValue: vegas?.edge.points ?? null,
        edgeSide,
        link: buildEntryLink(game, away, home, matchup ? `/matchup/${matchup.gameId}` : null),
        homeSpread,
        awaySpread,
      } satisfies BettingBoardEntry;
    });

    return entries;
  }, [games, officialMatchupByGameId, resolvedOddsEvents, teamPool, weights]);

  const spreadRankMap = useMemo(() => {
    // Step 1: Flatten all board entries with BOTH spreads valid into game-sides
    type Side = {
      gameId: string;
      canonicalId: string;
      name: string;
      abbreviation: string;
      logo?: string | null;
      spread: number;
      modelProb: number;
    };
    const sides: Side[] = [];
    for (const entry of boardEntries) {
      if (entry.awaySpread === null || entry.homeSpread === null) continue;
      if (entry.away && entry.modelProbAway !== null) {
        sides.push({
          gameId: String(entry.game.id),
          canonicalId: entry.away.canonicalId,
          name: entry.away.name,
          abbreviation: entry.away.abbreviation,
          logo: entry.away.logo,
          spread: entry.awaySpread,
          modelProb: entry.modelProbAway,
        });
      }
      if (entry.home && entry.modelProbHome !== null) {
        sides.push({
          gameId: String(entry.game.id),
          canonicalId: entry.home.canonicalId,
          name: entry.home.name,
          abbreviation: entry.home.abbreviation,
          logo: entry.home.logo,
          spread: entry.homeSpread,
          modelProb: entry.modelProbHome,
        });
      }
    }
    if (sides.length === 0) return new Map<string, SpreadRankInfo>();

    const poolSize = sides.length;

    // Step 2: Rank by modelProb descending (rank 1 = model's biggest favorite)
    const byModelProb = [...sides].sort((a, b) => b.modelProb - a.modelProb);
    const modelRankByKey = new Map<string, number>();
    byModelProb.forEach((side, idx) => {
      modelRankByKey.set(`${side.gameId}:${side.canonicalId}`, idx + 1);
    });

    // Step 3: Rank by spread ascending (rank 1 = most negative spread = Vegas's biggest favorite)
    const bySpread = [...sides].sort((a, b) => a.spread - b.spread);
    const spreadRankByKey = new Map<string, number>();
    bySpread.forEach((side, idx) => {
      spreadRankByKey.set(`${side.gameId}:${side.canonicalId}`, idx + 1);
    });

    // Step 4: Build final map keyed by gameId:canonicalId
    const map = new Map<string, SpreadRankInfo>();
    for (const side of sides) {
      const key = `${side.gameId}:${side.canonicalId}`;
      const modelRank = modelRankByKey.get(key) ?? poolSize;
      const spreadRank = spreadRankByKey.get(key) ?? poolSize;
      map.set(key, {
        canonicalId: side.canonicalId,
        gameId: side.gameId,
        name: side.name,
        abbreviation: side.abbreviation,
        logo: side.logo,
        spread: side.spread,
        modelProb: side.modelProb,
        spreadRank,
        modelRank,
        poolSize,
        rankDelta: modelRank - spreadRank,
      });
    }
    return map;
  }, [boardEntries]);

  const spreadRankEntries = useMemo(
    () => [...spreadRankMap.values()].sort((a, b) => Math.abs(b.rankDelta) - Math.abs(a.rankDelta)),
    [spreadRankMap],
  );

  const displayGroups = useMemo(() => {
    const allSorted = sortEntries(boardEntries, sortMode, spreadRankMap);

    // Only show date group headers when sorting by game time
    if (sortMode === "game-time") {
      const byDate = new Map<string, BettingBoardEntry[]>();
      for (const entry of allSorted) {
        const dateKey = new Date(entry.game.date).toDateString();
        if (!byDate.has(dateKey)) byDate.set(dateKey, []);
        byDate.get(dateKey)!.push(entry);
      }
      return Array.from(byDate.entries())
        .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
        .map(([dateKey, entries]) => ({
          label: getDateGroupLabel(dateKey) as string | null,
          entries,
        }));
    }

    // All other modes: global flat list, no date group headers
    return [{ label: null as string | null, entries: allSorted }];
  }, [boardEntries, sortMode, spreadRankMap]);

  const handleWeightChange = (key: string, value: number) => {
    setWeights((current) => current.map((weight) => (weight.key === key ? { ...weight, weight: value } : weight)));
    setSelectedPreset("default");
  };

  const applyPreset = (preset: "default" | "elite") => {
    setSelectedPreset(preset);
    setWeights(preset === "elite" ? ELITE_8_PRESET_WEIGHTS : DEFAULT_STAT_WEIGHTS);
  };

  return (
    <SiteShell>
      <div className="site-container space-y-5 py-6">
        <div>
          <h1 className="page-title text-foreground">Betting Edge</h1>
          <p className="mt-3 max-w-3xl page-copy text-sm">
            Compare model probabilities against live Vegas implied odds across all current matchups. Adjust sliders and
            presets to see the board reorder in real time.
          </p>
        </div>

        <section className="surface-card sticky top-[73px] z-40 p-3 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Tabs value={selectedPreset} onValueChange={(value) => applyPreset(value as "default" | "elite")}>
                <TabsList className="h-auto rounded-xl bg-secondary/80 p-1">
                  <TabsTrigger value="default">Default Model</TabsTrigger>
                  <TabsTrigger value="elite">2025 Elite 8 Team Rank Preset</TabsTrigger>
                </TabsList>
              </Tabs>
              <button
                onClick={() => setShowControls((current) => !current)}
                className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary/70"
              >
                {showControls ? "Hide" : "Show"} Sliders <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>

            {pageTab === "edge-board" && (
              <label className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground">
                <ArrowUpDown className="h-3.5 w-3.5" />
                Sort
                <select
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as SortMode)}
                  className="bg-transparent text-foreground outline-none"
                >
                  <option value="top-edge">Top edge</option>
                  <option value="smallest-edge">Smallest edge</option>
                  <option value="game-time">Game time</option>
                  <option value="model-favorite">Model favorite</option>
                  <option value="spread-rank">Spread vs. Model</option>
                </select>
              </label>
            )}
          </div>

          {showControls ? (
            <div className="mt-3">
              <StatSliders weights={weights} onWeightChange={handleWeightChange} compact />
            </div>
          ) : null}
        </section>

        {/* Page-level tab bar */}
        <div className="surface-card p-1">
          <Tabs value={pageTab} onValueChange={(v) => setPageTab(v as typeof pageTab)}>
            <TabsList className="h-auto w-full rounded-xl bg-transparent p-0">
              <TabsTrigger value="edge-board" className="flex-1">Edge Board</TabsTrigger>
              <TabsTrigger value="top-delta" className="flex-1">Top Delta Rank</TabsTrigger>
              <TabsTrigger value="mismatch" className="flex-1">Mismatch Specials</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {pageTab === "top-delta" && (
          <TopDeltaRankTable entries={spreadRankEntries} boardEntries={boardEntries} />
        )}

        {pageTab === "mismatch" && (
          <MismatchSpecialsTab boardEntries={boardEntries} />
        )}

        {pageTab === "edge-board" && <>

        {spreadRankEntries.length > 0 && (
          <section className="rounded-2xl border border-border bg-card/95 p-4 shadow-sm">
            <button
              onClick={() => setShowSpreadRankings((v) => !v)}
              className="flex w-full items-center justify-between"
            >
              <div className="text-left">
                <h2 className="text-lg font-semibold text-foreground">Spread vs. Model Rankings</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Vegas spread rank vs. model win probability rank — {spreadRankEntries[0]?.poolSize ?? spreadRankEntries.length} sides with active lines
                </p>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 ${showSpreadRankings ? "rotate-180" : ""}`}
              />
            </button>
            {showSpreadRankings && (
              <div className="mt-4">
                <SpreadRankingsTable entries={spreadRankEntries} />
              </div>
            )}
          </section>
        )}

        <section className="rounded-2xl border border-border bg-card/95 p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Upcoming NCAA Edge Board</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Ranked by strongest model edge against live Vegas implied probability.
              </p>
            </div>
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
              {boardEntries.length} games
            </span>
          </div>

          {boardEntries.length > 0 ? (
            <div className="mb-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-xs font-medium text-primary">
              Click on any game to use custom sliders and see updated model projections.
            </div>
          ) : null}

          <div className="mb-2 hidden grid-cols-[minmax(0,2.2fr),minmax(0,1fr),minmax(0,1fr),minmax(0,1fr),minmax(0,0.9fr),auto] gap-3 px-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground md:grid">
            <span>Matchup</span>
            <span>Model</span>
            <span>Vegas</span>
            <span>Edge</span>
            <span>Line</span>
            <span className="text-right">Time</span>
          </div>

          <div className="space-y-2">
            {isLoading ? (
              <div className="rounded-2xl border border-border bg-secondary/45 px-4 py-8 text-center text-sm text-muted-foreground">
                Loading upcoming games...
              </div>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-border bg-secondary/45 px-4 py-8 text-center text-sm text-muted-foreground">
                Live games are temporarily unavailable.
              </div>
            ) : null}

            {!isLoading && !error && boardEntries.length === 0 ? (
              <div className="rounded-2xl border border-border bg-secondary/45 px-4 py-8 text-center text-sm text-muted-foreground">
                No upcoming games found for the next 7 days. Check back closer to game time.
              </div>
            ) : null}

            {displayGroups.map(({ label, entries }, groupIdx) => (
              <div key={label ?? groupIdx}>
                {label && (
                  <div className="mb-2 mt-4 first:mt-0 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                    {label}
                  </div>
                )}
                <div className="space-y-2">
                  {entries.map((entry) => (
                    <BettingBoardRow key={entry.game.id} entry={entry} spreadRankMap={spreadRankMap} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        </>}

        <SeoFooterBlock />
      </div>
    </SiteShell>
  );
}
