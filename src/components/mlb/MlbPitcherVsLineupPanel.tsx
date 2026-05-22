import { getBarScalePosition, type MlbScaleKey } from "@/lib/mlb/mlbBarScale";
import { getStatToneFromPercentile, getStatToneStyle } from "@/lib/mlb/mlbDisplayHelpers";
import { computeHr9, computeK9, computePercent, formatAvgLike, formatDecimal } from "@/lib/mlb/mlbFormatters";
import { getMlbTeamColors } from "@/lib/mlbTeamColors";
import type { MlbLineupSummary, MlbOpponentSplit, MlbStarterProfile } from "@/lib/mlb/mlbTypes";

type EdgeResult = "pitcher" | "lineup" | "even";

function getEdge(pitcherVal: number | null, lineupVal: number | null, category: string): EdgeResult {
  if (pitcherVal == null || lineupVal == null) return "even";
  if (category === "k9") return "pitcher";
  if (category === "bb") return pitcherVal <= 7 ? "pitcher" : lineupVal >= 0.32 ? "lineup" : "even";
  if (category === "hr9") return pitcherVal <= 0.9 ? "pitcher" : pitcherVal >= 1.2 ? "lineup" : "even";
  if (category === "era") return pitcherVal <= 3.5 ? "pitcher" : pitcherVal >= 5.0 ? "lineup" : "even";
  return "even";
}

function EdgeBadge({
  edge,
  pitcherTeam,
  lineupTeam,
}: {
  edge: EdgeResult;
  pitcherTeam: string;
  lineupTeam: string;
}) {
  const team = edge === "pitcher" ? pitcherTeam : edge === "lineup" ? lineupTeam : null;
  const colors = getMlbTeamColors(team);

  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
      style={team ? { backgroundColor: colors.primary, color: "#ffffff" } : { backgroundColor: "#e2e8f0", color: "#475569" }}
    >
      {edge === "pitcher" ? `${pitcherTeam} edge` : edge === "lineup" ? `${lineupTeam} edge` : "Even"}
    </span>
  );
}

function getNormalizedPercentile(
  value: number | null,
  scaleKey: MlbScaleKey,
  higherIsBetter: boolean,
) {
  if (value == null) return null;
  const rawPosition = getBarScalePosition(value, scaleKey);
  const score = higherIsBetter ? rawPosition : 100 - rawPosition;
  return Math.max(1, Math.min(99, Math.round(score)));
}

function getPercentileTone(percentile: number | null) {
  if (percentile == null) {
    return {
      badgeStyle: { backgroundColor: "#e2e8f0", color: "#475569", border: "1px solid #cbd5e1" },
      railStyle: { backgroundColor: "#cbd5e1" },
      textClass: "text-slate-500",
    };
  }

  const tone = getStatToneFromPercentile(percentile);
  const toneStyle = getStatToneStyle(tone);

  return {
    badgeStyle: {
      backgroundColor: toneStyle.backgroundColor,
      color: toneStyle.color,
      border: `1px solid ${toneStyle.borderColor}`,
    },
    railStyle: {
      backgroundColor: tone === "positive" ? "#dc2626" : tone === "negative" ? "#0284c7" : "#94a3b8",
    },
    textClass:
      tone === "positive" ? "text-red-800"
      : tone === "negative" ? "text-sky-800"
      : "text-slate-500",
  };
}

type MatchupRow = {
  category: string;
  description: string;
  pitcherStat: string;
  pitcherVal: number | null;
  pitcherScaleKey: MlbScaleKey;
  pitcherHigherIsBetter: boolean;
  lineupStat: string;
  lineupVal: number | null;
  lineupScaleKey: MlbScaleKey;
  lineupHigherIsBetter: boolean;
  edgeKey: string;
  pitcherPercentile: number | null;
  lineupPercentile: number | null;
};

export default function MlbPitcherVsLineupPanel({
  title,
  pitcher,
  lineupLabel,
  split,
  lineupSummary,
  pitcherTeamAbbreviation,
  lineupTeamAbbreviation,
}: {
  title: string;
  pitcher: MlbStarterProfile;
  lineupLabel: string;
  split: MlbOpponentSplit;
  lineupSummary: MlbLineupSummary;
  pitcherTeamAbbreviation: string;
  lineupTeamAbbreviation: string;
}) {
  const pitcherColors = getMlbTeamColors(pitcherTeamAbbreviation);
  const lineupColors = getMlbTeamColors(lineupTeamAbbreviation);
  const k9Val = computeK9(pitcher.strikeOuts, pitcher.inningsPitched);
  const bbVal = computePercent(pitcher.baseOnBalls, pitcher.battersFaced);
  const hr9Val = computeHr9(pitcher.homeRuns, pitcher.inningsPitched);
  const eraVal = pitcher.era != null ? Number(pitcher.era) : null;

  const lineupKVal = computePercent(split?.strikeOuts ?? null, split?.plateAppearances ?? null);
  const obpVal = split?.obp ?? lineupSummary.obp ?? null;
  const slgVal = split?.slg ?? lineupSummary.slg ?? null;
  const opsVal = split?.ops ?? lineupSummary.ops ?? null;

  const rows: MatchupRow[] = [
    {
      category: "K/9 / K%",
      description: "Miss bats vs lineup swing-and-miss",
      pitcherStat: `${k9Val?.toFixed(1) ?? "-"} K/9`,
      pitcherVal: k9Val,
      pitcherScaleKey: "k9",
      pitcherHigherIsBetter: true,
      lineupStat: `${lineupKVal?.toFixed(1) ?? "-"}% K`,
      lineupVal: lineupKVal,
      lineupScaleKey: "percent",
      lineupHigherIsBetter: false,
      edgeKey: "k9",
      pitcherPercentile: getNormalizedPercentile(k9Val, "k9", true),
      lineupPercentile: getNormalizedPercentile(lineupKVal, "percent", false),
    },
    {
      category: "BB% / OBP",
      description: "Traffic control vs on-base pressure",
      pitcherStat: `${bbVal?.toFixed(1) ?? "-"}% BB`,
      pitcherVal: bbVal,
      pitcherScaleKey: "bbPercent",
      pitcherHigherIsBetter: false,
      lineupStat: formatAvgLike(obpVal),
      lineupVal: obpVal != null ? Number(obpVal) : null,
      lineupScaleKey: "obp",
      lineupHigherIsBetter: true,
      edgeKey: "bb",
      pitcherPercentile: getNormalizedPercentile(bbVal, "bbPercent", false),
      lineupPercentile: getNormalizedPercentile(obpVal != null ? Number(obpVal) : null, "obp", true),
    },
    {
      category: "HR/9 / SLG",
      description: "Damage suppression vs lineup power",
      pitcherStat: `${hr9Val?.toFixed(2) ?? "-"} HR/9`,
      pitcherVal: hr9Val,
      pitcherScaleKey: "hr9",
      pitcherHigherIsBetter: false,
      lineupStat: formatAvgLike(slgVal),
      lineupVal: slgVal != null ? Number(slgVal) : null,
      lineupScaleKey: "slg",
      lineupHigherIsBetter: true,
      edgeKey: "hr9",
      pitcherPercentile: getNormalizedPercentile(hr9Val, "hr9", false),
      lineupPercentile: getNormalizedPercentile(slgVal != null ? Number(slgVal) : null, "slg", true),
    },
    {
      category: "ERA / OPS",
      description: "Run prevention vs full lineup production",
      pitcherStat: formatDecimal(pitcher.era, 2),
      pitcherVal: eraVal,
      pitcherScaleKey: "era",
      pitcherHigherIsBetter: false,
      lineupStat: formatAvgLike(opsVal),
      lineupVal: opsVal != null ? Number(opsVal) : null,
      lineupScaleKey: "ops",
      lineupHigherIsBetter: true,
      edgeKey: "era",
      pitcherPercentile: getNormalizedPercentile(eraVal, "era", false),
      lineupPercentile: getNormalizedPercentile(opsVal != null ? Number(opsVal) : null, "ops", true),
    },
  ];

  const pitcherEdgeCount = rows.filter((row) => getEdge(row.pitcherVal, row.lineupVal, row.edgeKey) === "pitcher").length;
  const lineupEdgeCount = rows.filter((row) => getEdge(row.pitcherVal, row.lineupVal, row.edgeKey) === "lineup").length;
  const strongestPitcherRow = [...rows]
    .filter((row) => row.pitcherPercentile != null)
    .sort((a, b) => (b.pitcherPercentile ?? 0) - (a.pitcherPercentile ?? 0))[0];
  const strongestLineupRow = [...rows]
    .filter((row) => row.lineupPercentile != null)
    .sort((a, b) => (b.lineupPercentile ?? 0) - (a.lineupPercentile ?? 0))[0];

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="text-sm" style={{ color: lineupColors.primary }}>{lineupLabel}</span>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/90 p-3 shadow-[0_14px_30px_hsl(var(--foreground)/0.04)]">
        <div className="grid gap-2.5 md:grid-cols-3">
          <div className="rounded-2xl border border-border/60 bg-secondary/35 px-3 py-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Pitcher edge count</div>
            <div className="mt-1.5 text-xl font-semibold" style={{ color: pitcherColors.primary }}>{pitcherEdgeCount}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Strongest pitcher trait: {strongestPitcherRow?.category.split("/")[0].trim() ?? "-"}
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-slate-950 px-3 py-2.5 text-white">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300">How to read it</div>
            <div className="mt-1.5 text-sm font-semibold">Matchup edge percentiles</div>
            <div className="mt-1 text-xs leading-5 text-slate-300">
              These matchup percentiles are normalized from this page&apos;s MLB comparison scales for side-by-side
              reads. They are not official Statcast or leaguewide percentiles.
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-secondary/35 px-3 py-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Lineup edge count</div>
            <div className="mt-1.5 text-xl font-semibold" style={{ color: lineupColors.primary }}>{lineupEdgeCount}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Strongest lineup trait: {strongestLineupRow?.category.split("/")[1].trim() ?? "-"}
            </div>
          </div>
        </div>

        <div className="mt-2.5 space-y-2.5">
          {rows.map((row) => {
            const edge = getEdge(row.pitcherVal, row.lineupVal, row.edgeKey);
            const pitcherTone = getPercentileTone(row.pitcherPercentile);
            const lineupTone = getPercentileTone(row.lineupPercentile);
            const pitcherLabel = row.category.split("/")[0].trim();
            const lineupLabelText = row.category.split("/")[1].trim();

            return (
              <article key={row.category} className="rounded-2xl border border-border/60 bg-white p-3">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{row.category}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{row.description}</div>
                  </div>
                  <EdgeBadge edge={edge} pitcherTeam={pitcherTeamAbbreviation} lineupTeam={lineupTeamAbbreviation} />
                </div>

                <div className="mt-2.5 grid gap-2.5 md:grid-cols-2">
                  <div className="rounded-2xl border border-border/60 bg-secondary/20 p-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{pitcherLabel}</div>
                        <div className="mt-0.5 text-sm font-semibold text-foreground">{row.pitcherStat}</div>
                      </div>
                      <div className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pitcherTone.textClass}`} style={pitcherTone.badgeStyle}>
                        Matchup Pctl {row.pitcherPercentile ?? "-"}
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${row.pitcherPercentile ?? 0}%`, ...pitcherTone.railStyle }}
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-secondary/20 p-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{lineupLabelText}</div>
                        <div className="mt-0.5 text-sm font-semibold text-foreground">{row.lineupStat}</div>
                      </div>
                      <div className={`rounded-full px-2.5 py-1 text-xs font-semibold ${lineupTone.textClass}`} style={lineupTone.badgeStyle}>
                        Matchup Pctl {row.lineupPercentile ?? "-"}
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${row.lineupPercentile ?? 0}%`, ...lineupTone.railStyle }}
                      />
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
