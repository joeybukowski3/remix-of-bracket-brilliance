import { ChevronDown, ChevronUp } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import TeamLogo from "@/components/TeamLogo";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatStat, type StatWeight } from "@/data/ncaaTeams";
import { cn } from "@/lib/utils";
import {
  computePathDifficulty,
  rankTeamsInRegion,
  type PathDifficulty,
  type ResolvedBracketRegion,
} from "@/lib/bracket";

function difficultyTone(tier: PathDifficulty["tier"]) {
  if (tier === "Brutal") return "bg-destructive/16 text-destructive border-destructive/25";
  if (tier === "Hard") return "bg-primary/16 text-primary border-primary/25";
  if (tier === "Medium") return "bg-secondary text-secondary-foreground border-white/10";
  return "bg-emerald-500/14 text-emerald-300 border-emerald-500/20";
}

function difficultyWidth(score: number) {
  return `${Math.max(14, Math.min(100, score))}%`;
}

export default function RegionalRankingsTable({
  region,
  weights,
}: {
  region: ResolvedBracketRegion;
  weights: StatWeight[];
}) {
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const rankedTeams = useMemo(() => rankTeamsInRegion(region, weights), [region, weights]);

  return (
    <section className="overflow-hidden rounded-2xl border border-white/12 bg-card/95 shadow-[0_16px_34px_hsl(var(--background)/0.24)]">
      <div className="border-b border-white/10 bg-secondary/65 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">{region.name} Region</h3>
            <p className="text-xs text-muted-foreground">{region.teams.length} teams ranked live from the current model weights.</p>
          </div>
          <Badge variant="outline" className="border-white/10 bg-background/60 text-foreground">
            Dynamic table
          </Badge>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table className="min-w-[880px] text-[13px]">
          <TableHeader className="bg-background/85">
            <TableRow className="border-white/10 hover:bg-transparent">
              <TableHead className="h-10 w-12 px-3">Rk</TableHead>
              <TableHead className="h-10 px-3">Team</TableHead>
              <TableHead className="h-10 px-2">Conf</TableHead>
              <TableHead className="h-10 px-2">Rec</TableHead>
              <TableHead className="h-10 px-2 text-right">Power</TableHead>
              <TableHead className="h-10 px-2 text-right">Off</TableHead>
              <TableHead className="h-10 px-2 text-right">Def</TableHead>
              <TableHead className="h-10 px-2 text-right">Pace</TableHead>
              <TableHead className="h-10 px-2 text-right">Shoot</TableHead>
              <TableHead className="h-10 px-3">Path</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rankedTeams.map(({ team, score, path }, index) => {
              const isExpanded = expandedTeamId === team.canonicalId;
              const shootingMetric = team.stats.threePct ?? team.stats.fgPct ?? team.stats.ftPct;
              return (
                <Fragment key={team.canonicalId}>
                  <TableRow
                    className={cn(
                      "cursor-pointer border-white/10 bg-background/44 hover:bg-background/72",
                      isExpanded && "bg-primary/10 hover:bg-primary/12",
                    )}
                    onClick={() => setExpandedTeamId((prev) => (prev === team.canonicalId ? null : team.canonicalId))}
                  >
                    <TableCell className="px-3 py-2.5 font-semibold text-primary">{index + 1}</TableCell>
                    <TableCell className="px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Badge variant="secondary" className="min-w-8 justify-center rounded-md border-white/10 px-2 py-1 text-[11px] font-bold">
                          {team.seed ?? "-"}
                        </Badge>
                        <TeamLogo name={team.name} logo={team.logo} className="h-7 w-7" />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-foreground">{team.name}</div>
                          <div className="truncate text-[11px] text-muted-foreground">{team.abbreviation}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-2 py-2.5 text-muted-foreground">{team.conference}</TableCell>
                    <TableCell className="px-2 py-2.5 text-muted-foreground">{team.record || "N/A"}</TableCell>
                    <TableCell className="px-2 py-2.5 text-right font-semibold tabular-nums text-foreground">{score.toFixed(1)}</TableCell>
                    <TableCell className="px-2 py-2.5 text-right tabular-nums text-foreground">{formatStat(team.stats.adjOE)}</TableCell>
                    <TableCell className="px-2 py-2.5 text-right tabular-nums text-foreground">{formatStat(team.stats.adjDE)}</TableCell>
                    <TableCell className="px-2 py-2.5 text-right tabular-nums text-foreground">{formatStat(team.stats.tempo)}</TableCell>
                    <TableCell className="px-2 py-2.5 text-right tabular-nums text-foreground">{formatStat(shootingMetric)}</TableCell>
                    <TableCell className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Badge className={cn("rounded-md border px-2 py-1 text-[10px] font-semibold", difficultyTone(path.tier))}>
                          {path.tier}
                        </Badge>
                        <div className="w-16">
                          <div className="h-1.5 rounded-full bg-white/8">
                            <div className="h-1.5 rounded-full bg-primary" style={{ width: difficultyWidth(path.score) }} />
                          </div>
                          <div className="mt-1 text-[10px] tabular-nums text-muted-foreground">{path.score.toFixed(1)}</div>
                        </div>
                        {isExpanded ? <ChevronUp className="ml-auto h-4 w-4 text-muted-foreground" /> : <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />}
                      </div>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow className="border-white/10 bg-secondary/42 hover:bg-secondary/42">
                      <TableCell colSpan={10} className="px-4 py-4">
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
  const shootingSplit = team.stats.fgPct && team.stats.threePct ? `${formatStat(team.stats.fgPct)} FG / ${formatStat(team.stats.threePct)} 3P` : "Partial shooting coverage";
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
            <div key={opponent.round} className="grid grid-cols-[96px,1fr,auto] items-center gap-2 rounded-lg border border-white/8 bg-card/85 px-2.5 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{opponent.round}</span>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{opponent.team?.name ?? "TBD"}</div>
                <div className="text-[11px] text-muted-foreground">
                  {opponent.team ? `${opponent.team.seed ?? "-"} seed | ${opponent.team.conference}` : "Awaiting likely opponent"}
                </div>
              </div>
              <span className="text-xs font-semibold tabular-nums text-foreground">{opponent.strength.toFixed(1)}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] leading-5 text-muted-foreground">
          Path difficulty combines projected opponent quality across all four region rounds, weighted toward later-round strength.
        </p>
      </div>
    </div>
  );
}

function StatTile({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-xl border px-3 py-2.5", highlight ? "border-primary/20 bg-primary/10" : "border-white/10 bg-card/85")}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-sm font-semibold", highlight ? "text-primary" : "text-foreground")}>{value}</p>
    </div>
  );
}
