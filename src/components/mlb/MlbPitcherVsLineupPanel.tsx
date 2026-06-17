import { getMlbTeamColors } from "@/lib/mlbTeamColors";
import { computeHr9, computeK9, computePercent, formatAvgLike, formatDecimal } from "@/lib/mlb/mlbFormatters";
import { getBarScalePosition, type MlbScaleKey } from "@/lib/mlb/mlbBarScale";
import type { MlbLineupSummary, MlbOpponentSplit, MlbStarterProfile } from "@/lib/mlb/mlbTypes";
import type { PitcherPercentileEntry } from "@/hooks/usePitcherPercentiles";

type EdgeResult = "pitcher" | "lineup" | "even";

function colorsTooSimilar(c1: string, c2: string): boolean {
  const parse = (h: string) => { const s = h.replace("#",""); return [parseInt(s.slice(0,2),16),parseInt(s.slice(2,4),16),parseInt(s.slice(4,6),16)]; };
  try { const [r1,g1,b1]=parse(c1); const [r2,g2,b2]=parse(c2); return Math.sqrt((r1-r2)**2+(g1-g2)**2+(b1-b2)**2)<80; } catch { return false; }
}

function getEdge(pitcherVal: number | null, lineupVal: number | null, category: string): EdgeResult {
  if (pitcherVal == null || lineupVal == null) return "even";
  if (category === "k9") return "pitcher";
  if (category === "bb") return pitcherVal <= 7 ? "pitcher" : lineupVal >= 0.32 ? "lineup" : "even";
  if (category === "hr9") return pitcherVal <= 0.9 ? "pitcher" : pitcherVal >= 1.2 ? "lineup" : "even";
  if (category === "era") return pitcherVal <= 3.5 ? "pitcher" : pitcherVal >= 5.0 ? "lineup" : "even";
  return "even";
}

// Raw-scale fallback (used for lineup bars which don't have true percentiles)
function rawPercentile(value: number | null, scaleKey: MlbScaleKey, higherIsBetter: boolean) {
  if (value == null) return 0;
  const raw = getBarScalePosition(value, scaleKey);
  return Math.max(1, Math.min(99, Math.round(higherIsBetter ? raw : 100 - raw)));
}

function CompactBar({
  label, value, barPct, color, showPct,
}: {
  label: string; value: string; barPct: number; color: string; showPct?: number | null;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="w-14 shrink-0 truncate text-right text-[10px] font-bold text-muted-foreground">{label}</span>
      <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
        <span className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-amber-400" style={{ left: "50%" }} />
        <span className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${barPct}%`, backgroundColor: color }} />
        {showPct != null && barPct > 20 && (
          <span className="absolute inset-y-0 left-1.5 flex items-center text-[8px] font-black text-white/90 z-10 leading-none">
            {showPct}th
          </span>
        )}
      </div>
      <span className="w-14 shrink-0 text-[10px] font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function buildRows(
  pitcher: MlbStarterProfile,
  split: MlbOpponentSplit,
  lineupSummary: MlbLineupSummary,
  pitcherPcts: PitcherPercentileEntry | null,
) {
  const k9Val  = computeK9(pitcher.strikeOuts, pitcher.inningsPitched);
  const bbVal  = computePercent(pitcher.baseOnBalls, pitcher.battersFaced);
  const hr9Val = computeHr9(pitcher.homeRuns, pitcher.inningsPitched);
  const eraVal = pitcher.era != null ? Number(pitcher.era) : null;
  const lineupKVal = computePercent(split?.strikeOuts ?? null, split?.plateAppearances ?? null);
  const obpVal = split?.obp ?? lineupSummary.obp ?? null;
  const slgVal = split?.slg ?? lineupSummary.slg ?? null;
  const opsVal = split?.ops ?? lineupSummary.ops ?? null;

  // True percentiles from the daily data file, with raw-scale fallback
  const k9Pct  = pitcherPcts?.k9Pct  ?? rawPercentile(k9Val,  "k9",        true);
  const bbPct  = pitcherPcts?.bbPctPct ?? rawPercentile(bbVal,  "bbPercent", false);
  const hr9Pct = pitcherPcts?.hr9Pct  ?? rawPercentile(hr9Val, "hr9",       false);
  const eraPct = pitcherPcts?.eraPct  ?? rawPercentile(eraVal, "era",       false);

  return [
    {
      category: "K/9 / K%", edgeKey: "k9",
      pitcherStat: `${k9Val?.toFixed(1) ?? "-"} K/9`,  pitcherVal: k9Val,  pitcherPct: k9Pct,
      lineupStat:  `${lineupKVal?.toFixed(1) ?? "-"}% K`, lineupVal: lineupKVal,
      lineupPct:   rawPercentile(lineupKVal, "percent", false),
    },
    {
      category: "BB% / OBP", edgeKey: "bb",
      pitcherStat: `${bbVal?.toFixed(1) ?? "-"}% BB`,  pitcherVal: bbVal,  pitcherPct: bbPct,
      lineupStat:  formatAvgLike(obpVal),               lineupVal: obpVal != null ? Number(obpVal) : null,
      lineupPct:   rawPercentile(obpVal != null ? Number(obpVal) : null, "obp", true),
    },
    {
      category: "HR/9 / SLG", edgeKey: "hr9",
      pitcherStat: `${hr9Val?.toFixed(2) ?? "-"} HR/9`, pitcherVal: hr9Val, pitcherPct: hr9Pct,
      lineupStat:  formatAvgLike(slgVal),                lineupVal: slgVal != null ? Number(slgVal) : null,
      lineupPct:   rawPercentile(slgVal != null ? Number(slgVal) : null, "slg", true),
    },
    {
      category: "ERA / OPS", edgeKey: "era",
      pitcherStat: formatDecimal(pitcher.era, 2), pitcherVal: eraVal, pitcherPct: eraPct,
      lineupStat:  formatAvgLike(opsVal),         lineupVal: opsVal != null ? Number(opsVal) : null,
      lineupPct:   rawPercentile(opsVal != null ? Number(opsVal) : null, "ops", true),
    },
  ];
}

export default function MlbPitcherVsLineupPanel({
  awayPitcher, homePitcher,
  awaySplit, homeSplit,
  awayLineupSummary, homeLineupSummary,
  awayAbbreviation, homeAbbreviation,
  getPercentiles,
}: {
  awayPitcher: MlbStarterProfile; homePitcher: MlbStarterProfile;
  awaySplit: MlbOpponentSplit; homeSplit: MlbOpponentSplit;
  awayLineupSummary: MlbLineupSummary; homeLineupSummary: MlbLineupSummary;
  awayAbbreviation: string; homeAbbreviation: string;
  getPercentiles?: (id: number | null | undefined) => PitcherPercentileEntry | null;
}) {
  const rawAway = getMlbTeamColors(awayAbbreviation).primary;
  const rawHome = getMlbTeamColors(homeAbbreviation).primary;
  const awayColor = colorsTooSimilar(rawAway, rawHome) ? "#374151" : rawAway;
  const homeColor = rawHome;
  const awayLastName = awayPitcher.name.split(" ").pop() ?? awayPitcher.name;
  const homeLastName = homePitcher.name.split(" ").pop() ?? homePitcher.name;

  const awayPcts = getPercentiles?.(awayPitcher.id) ?? null;
  const homePcts = getPercentiles?.(homePitcher.id) ?? null;

  const homeRows = buildRows(homePitcher, awaySplit, awayLineupSummary, homePcts);
  const awayRows = buildRows(awayPitcher, homeSplit, homeLineupSummary, awayPcts);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-end gap-1 pr-1 text-[9px] text-muted-foreground">
        <span className="inline-block h-2.5 w-0.5 rounded-full bg-amber-400" />
        Avg = 50th pctl
      </div>
      {homeRows.map((homeRow, i) => {
        const awayRow = awayRows[i];
        const homeEdge = getEdge(homeRow.pitcherVal, homeRow.lineupVal, homeRow.edgeKey);
        const awayEdge = getEdge(awayRow.pitcherVal, awayRow.lineupVal, awayRow.edgeKey);
        const homeEdgeTeam = homeEdge === "pitcher" ? homeAbbreviation : homeEdge === "lineup" ? awayAbbreviation : null;
        const awayEdgeTeam = awayEdge === "pitcher" ? awayAbbreviation : awayEdge === "lineup" ? homeAbbreviation : null;
        return (
          <div key={homeRow.category} className="space-y-0.5 rounded-md bg-secondary/30 px-2 py-1.5">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{homeRow.category}</span>
              <div className="flex gap-1">
                <span className="rounded-full px-2 py-0.5 text-[9px] font-bold text-white" style={{ backgroundColor: homeEdgeTeam ? getMlbTeamColors(homeEdgeTeam).primary : "#94a3b8" }}>
                  {homeEdge === "pitcher" ? homeAbbreviation : homeEdge === "lineup" ? awayAbbreviation : "Even"}
                </span>
                <span className="rounded-full px-2 py-0.5 text-[9px] font-bold text-white" style={{ backgroundColor: awayEdgeTeam ? getMlbTeamColors(awayEdgeTeam).primary : "#94a3b8" }}>
                  {awayEdge === "pitcher" ? awayAbbreviation : awayEdge === "lineup" ? homeAbbreviation : "Even"}
                </span>
              </div>
            </div>
            {/* Home pitcher vs Away lineup */}
            <CompactBar label={homeLastName} value={homeRow.pitcherStat} barPct={homeRow.pitcherPct} color={homeColor} showPct={homePcts ? homeRow.pitcherPct : null} />
            <CompactBar label={awayAbbreviation} value={homeRow.lineupStat} barPct={homeRow.lineupPct} color={awayColor} />
            {/* Away pitcher vs Home lineup */}
            <CompactBar label={awayLastName} value={awayRow.pitcherStat} barPct={awayRow.pitcherPct} color={awayColor} showPct={awayPcts ? awayRow.pitcherPct : null} />
            <CompactBar label={homeAbbreviation} value={awayRow.lineupStat} barPct={awayRow.lineupPct} color={homeColor} />
          </div>
        );
      })}
    </div>
  );
}
