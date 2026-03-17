import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import TeamLogo from "@/components/TeamLogo";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  computeHomeInflationMetrics,
  computeQuadRecord,
  formatStat,
  getTop50AvgDropOff,
  hasStat,
  type StatWeight,
  type Team,
} from "@/data/ncaaTeams";
import { cn } from "@/lib/utils";
import {
  computePathDifficulty,
  rankTeamsInRegion,
  type PathDifficulty,
  type ResolvedBracketRegion,
} from "@/lib/bracket";

// ── helpers ──────────────────────────────────────────────────────────────────

function difficultyTone(tier: PathDifficulty["tier"]) {
  if (tier === "Brutal") return "bg-destructive/16 text-destructive border-destructive/25";
  if (tier === "Hard") return "bg-primary/16 text-primary border-primary/25";
  if (tier === "Medium") return "bg-secondary text-secondary-foreground border-white/10";
  return "bg-emerald-500/14 text-emerald-300 border-emerald-500/20";
}

function difficultyWidth(score: number) {
  return `${Math.max(14, Math.min(100, score))}%`;
}

type SortKey =
  | "rank"
  | "seed"
  | "team"
  | "conf"
  | "rec"
  | "power"
  | "off"
  | "def"
  | "pace"
  | "sos"
  | "netEff"
  | "dropOff"
  | "inflScore"
  | "q1wins"
  | "q2wins";

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ChevronsUpDown className="inline-block h-3 w-3 ml-0.5 text-muted-foreground/50" />;
  return dir === "asc" ? (
    <ChevronUp className="inline-block h-3 w-3 ml-0.5 text-primary" />
  ) : (
    <ChevronDown className="inline-block h-3 w-3 ml-0.5 text-primary" />
  );
}

// ── main component ───────────────────────────────────────────────────────────

export default function RegionalRankingsTable({
  region,
  weights,
  teamPool,
}: {
  region: ResolvedBracketRegion;
  weights: StatWeight[];
  teamPool?: Team[];
}) {
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const rankedTeams = useMemo(() => rankTeamsInRegion(region, weights), [region, weights]);

  // avg drop-off for inflation metrics
  const avgDropOff = useMemo(() => {
    const pool = teamPool && teamPool.length > 0 ? teamPool : region.teams;
    return getTop50AvgDropOff(pool);
  }, [teamPool, region.teams]);

  // Enrich each entry with derived metrics
  const enriched = useMemo(() => {
    const total = rankedTeams.length;
    return rankedTeams.map(({ team, score, path }, index) => {
      const rank = index + 1;
      const inf = computeHomeInflationMetrics(team, avgDropOff);
      const quad = computeQuadRecord(team, rank, total);
      const netEff =
        hasStat(team.stats.adjOE) && hasStat(team.stats.adjDE)
          ? team.stats.adjOE - team.stats.adjDE
          : null;
      return { team, score, path, rank, inf, quad, netEff };
    });
  }, [rankedTeams, avgDropOff]);

  // Sort enriched rows
  const sortedRows = useMemo(() => {
    const rows = [...enriched];
    rows.sort((a, b) => {
      let va: number | string = 0;
      let vb: number | string = 0;
      switch (sortKey) {
        case "rank": va = a.rank; vb = b.rank; break;
        case "seed": va = a.team.seed ?? 99; vb = b.team.seed ?? 99; break;
        case "team": va = a.team.name; vb = b.team.name; break;
        case "conf": va = a.team.conference ?? ""; vb = b.team.conference ?? ""; break;
        case "rec": va = a.team.record ?? ""; vb = b.team.record ?? ""; break;
        case "power": va = a.score; vb = b.score; break;
        case "off": va = a.team.stats.adjOE ?? -999; vb = b.team.stats.adjOE ?? -999; break;
        case "def": va = a.team.stats.adjDE ?? 999; vb = b.team.stats.adjDE ?? 999; break;
        case "pace": va = a.team.stats.tempo ?? -999; vb = b.team.stats.tempo ?? -999; break;
        case "sos": va = a.team.stats.sos ?? -999; vb = b.team.stats.sos ?? -999; break;
        case "netEff": va = a.netEff ?? -999; vb = b.netEff ?? -999; break;
        case "dropOff": va = a.inf.dropOff ?? 999; vb = b.inf.dropOff ?? 999; break;
        case "inflScore": va = a.inf.homeInflationScore ?? 999; vb = b.inf.homeInflationScore ?? 999; break;
        case "q1wins": va = a.quad.q1.wins; vb = b.quad.q1.wins; break;
        case "q2wins": va = a.quad.q2.wins; vb = b.quad.q2.wins; break;
      }
      if (typeof va === "string" && typeof vb === "string") {
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return rows;
  }, [enriched, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Default direction: asc for rank/seed/name, desc for numeric stats
      const ascByDefault: SortKey[] = ["rank", "seed", "team", "conf", "rec", "def", "dropOff", "inflScore"];
      setSortDir(ascByDefault.includes(key) ? "asc" : "desc");
    }
  }

  function Th({
    col,
    children,
    className,
  }: {
    col: SortKey;
    children: React.ReactNode;
    className?: string;
  }) {
    return (
      <TableHead
        className={cn("h-10 cursor-pointer select-none hover:text-foreground whitespace-nowrap", className)}
        onClick={() => handleSort(col)}
      >
        {children}
        <SortIcon active={sortKey === col} dir={sortDir} />
      </TableHead>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-white/12 bg-card/95 shadow-[0_16px_34px_hsl(var(--background)/0.24)]">
      <div className="overflow-x-auto">
        <Table className="min-w-[1280px] text-[13px]">
          <TableHeader className="bg-background/85">
            <TableRow className="border-white/10 hover:bg-transparent">
              <Th col="rank" className="w-10 px-3 text-left">Rk</Th>
              <Th col="seed" className="w-12 px-2 text-center">Seed</Th>
              <Th col="team" className="px-3 min-w-[160px]">Team</Th>
              <Th col="conf" className="px-2">Conf</Th>
              <Th col="rec" className="px-2">Rec</Th>
              <Th col="power" className="px-2 text-right">Power</Th>
              <Th col="off" className="px-2 text-right">Off</Th>
              <Th col="def" className="px-2 text-right">Def</Th>
              <Th col="pace" className="px-2 text-right">Pace</Th>
              <Th col="sos" className="px-2 text-right">SOS</Th>
              <Th col="netEff" className="px-2 text-right">Net Eff</Th>
              <Th col="dropOff" className="px-2 text-right">Drop-Off</Th>
              <Th col="inflScore" className="px-2 text-right">Infl. Score</Th>
              <Th col="q1wins" className="px-2 text-center">Q1</Th>
              <Th col="q2wins" className="px-2 text-center">Q2</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map(({ team, score, path, rank, inf, quad, netEff }) => {
              const isExpanded = expandedTeamId === team.canonicalId;
              const fmtSigned = (v: number | null) => {
                if (v === null || v === undefined) return "—";
                return `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
              };
              return (
                <Fragment key={team.canonicalId}>
                  <TableRow
                    className={cn(
                      "cursor-pointer border-white/10 bg-background/44 hover:bg-background/72",
                      isExpanded && "bg-primary/10 hover:bg-primary/12",
                    )}
                    onClick={() =>
                      setExpandedTeamId((prev) => (prev === team.canonicalId ? null : team.canonicalId))
                    }
                  >
                    <TableCell className="px-3 py-2.5 font-semibold text-primary">{rank}</TableCell>
                    <TableCell className="px-2 py-2.5 text-center">
                      <Badge
                        variant="secondary"
                        className="min-w-8 justify-center rounded-md border-white/10 px-2 py-1 text-[11px] font-bold"
                      >
                        {team.seed ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <TeamLogo name={team.name} logo={team.logo} className="h-7 w-7 shrink-0" />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-foreground">{team.name}</div>
                          <div className="truncate text-[11px] text-muted-foreground">{team.abbreviation}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-2 py-2.5 text-muted-foreground">{team.conference}</TableCell>
                    <TableCell className="px-2 py-2.5 text-muted-foreground">{team.record || "N/A"}</TableCell>
                    <TableCell className="px-2 py-2.5 text-right font-semibold tabular-nums text-foreground">
                      {score.toFixed(1)}
                    </TableCell>
                    <TableCell className="px-2 py-2.5 text-right tabular-nums text-foreground">
                      {formatStat(team.stats.adjOE)}
                    </TableCell>
                    <TableCell className="px-2 py-2.5 text-right tabular-nums text-foreground">
                      {formatStat(team.stats.adjDE)}
                    </TableCell>
                    <TableCell className="px-2 py-2.5 text-right tabular-nums text-foreground">
                      {formatStat(team.stats.tempo)}
                    </TableCell>
                    <TableCell className="px-2 py-2.5 text-right tabular-nums text-foreground">
                      {formatStat(team.stats.sos)}
                    </TableCell>
                    <TableCell className="px-2 py-2.5 text-right tabular-nums text-foreground">
                      {netEff !== null ? fmtSigned(netEff) : "—"}
                    </TableCell>
                    <TableCell className="px-2 py-2.5 text-right tabular-nums text-foreground">
                      {inf.dropOff !== null ? fmtSigned(inf.dropOff) : "—"}
                    </TableCell>
                    <TableCell className="px-2 py-2.5 text-right tabular-nums text-foreground">
                      {inf.homeInflationScore !== null ? fmtSigned(inf.homeInflationScore) : "—"}
                    </TableCell>
                    <TableCell className="px-2 py-2.5 text-center tabular-nums">
                      <span className="text-yellow-400 font-semibold">{quad.q1.wins}</span>
                      <span className="text-muted-foreground">-{quad.q1.losses}</span>
                    </TableCell>
                    <TableCell className="px-2 py-2.5 text-center tabular-nums text-muted-foreground">
                      {quad.q2.wins}-{quad.q2.losses}
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow className="border-white/10 bg-secondary/42 hover:bg-secondary/42">
                      <TableCell colSpan={15} className="px-4 py-4">
                        <ExpandedTeamDetails region={region} teamId={team.canonicalId} weights={weights} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

// ── expanded row ─────────────────────────────────────────────────────────────

function ExpandedTeamDetails({
  region,
  teamId,
  weights,
}: {
  region: ResolvedBracketRegion;
  teamId: string;
  weights: StatWeight[];
}) {
  const team = region.teams.find((entry) => entry.canonicalId === teamId);
  if (!team) return null;

  const path = computePathDifficulty(team, region, weights);
  const shootingSplit =
    team.stats.fgPct && team.stats.threePct
      ? `${formatStat(team.stats.fgPct)} FG / ${formatStat(team.stats.threePct)} 3P`
      : "Partial shooting coverage";
  const reboundSplit = team.stats.rpg ? `${formatStat(team.stats.rpg)} RPG` : "Rebounding unavailable";
  const confidence = Math.max(0, Math.min(99, Math.round((100 - path.score) * 1.05)));

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr,0.9fr]">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Strength of schedule" value={formatStat(team.stats.sos)} />
        <StatTile label="Shooting split" value={shootingSplit} />
        <StatTile label="Rebounding" value={reboundSplit} />
        <StatTile label="Model confidence" value={`${confidence}%`} highlight />
      </div>
      <div className="grid gap-3 rounded-xl border border-white/10 bg-background/70 p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Likeliest path</p>
          <Badge className={cn("rounded-md border px-2 py-1 text-[10px] font-semibold", difficultyTone(path.tier))}>
            {path.tier}
          </Badge>
        </div>
        <div className="grid gap-2">
          {path.likelyOpponents.map((opponent) => (
            <div
              key={opponent.round}
              className="grid grid-cols-[96px,1fr,auto] items-center gap-2 rounded-lg border border-white/8 bg-card/85 px-2.5 py-2"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {opponent.round}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">
                  {opponent.team?.name ?? "TBD"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {opponent.team
                    ? `${opponent.team.seed ?? "—"} seed | ${opponent.team.conference}`
                    : "Awaiting likely opponent"}
                </div>
              </div>
              <span className="text-xs font-semibold tabular-nums text-foreground">
                {opponent.strength.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[11px] leading-5 text-muted-foreground">
          Path difficulty combines projected opponent quality across all four region rounds, weighted toward
          later-round strength.
        </p>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5",
        highlight ? "border-primary/20 bg-primary/10" : "border-white/10 bg-card/85",
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-sm font-semibold", highlight ? "text-primary" : "text-foreground")}>
        {value}
      </p>
    </div>
  );
}
