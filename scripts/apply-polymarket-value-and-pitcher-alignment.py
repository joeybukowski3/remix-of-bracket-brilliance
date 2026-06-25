from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "src/pages/MlbGameDetail.tsx"
PANEL = ROOT / "src/components/mlb/MlbPolymarketMoneylinePanel.tsx"


def sub_once(pattern: str, replacement: str, text: str, label: str, flags: int = 0) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"Expected one replacement for {label}, found {count}")
    return updated


page = PAGE.read_text()

page = sub_once(
    r"  function getPolymarketEdge\(gamePk: number, mlEdge: any\) \{.*?\n  \}\n  const \{ getTeam \} = useTeamWrc\(\);",
    '''  function getPolymarketEdge(gamePk: number, mlEdge: any) {
    if (!polymarketData || !mlEdge) return null;

    const game = polymarketData.games.find(g => g.gamePk === gamePk);
    if (!game || !game.matched) return null;

    const confidence = mlEdge.confidence / 100;
    const awayModelProb = mlEdge.pick === "away" ? confidence : mlEdge.pick === "home" ? 1 - confidence : 0.5;
    const homeModelProb = 1 - awayModelProb;
    const candidates: Array<{ team: string; edge: number; polyProb: number }> = [];

    if (game.away.yesPrice != null) {
      candidates.push({
        team: game.away.abbreviation,
        edge: Math.round((awayModelProb - game.away.yesPrice) * 1000) / 10,
        polyProb: game.away.yesPrice,
      });
    }
    if (game.home.yesPrice != null) {
      candidates.push({
        team: game.home.abbreviation,
        edge: Math.round((homeModelProb - game.home.yesPrice) * 1000) / 10,
        polyProb: game.home.yesPrice,
      });
    }
    if (!candidates.length) return null;

    const best = candidates.sort((a, b) => b.edge - a.edge)[0];
    if (best.edge <= 0) {
      return { team: null, edge: 0, sign: "", polyProb: best.polyProb, isEven: true };
    }

    return { team: best.team, edge: best.edge, sign: "+", polyProb: best.polyProb, isEven: false };
  }
  const { getTeam } = useTeamWrc();''',
    page,
    "matchup-card Polymarket value helper",
    re.S,
)

page = sub_once(
    r'''                  const PitcherPills = \(\{ pi \}: \{ pi: ReturnType<typeof getPInfo> \}\) => \(.*?\n                  \);\n\n                  return \(''',
    '''                  const PitcherPills = ({ pi, align = "left" }: { pi: ReturnType<typeof getPInfo>; align?: "left" | "right" }) => {
                    const metric = pi.xera != null
                      ? { label: `${pi.xera.toFixed(2)} xERA`, style: xeraStyle(pi.xera) }
                      : pi.xfipFallback != null
                        ? { label: `${pi.xfipFallback.toFixed(2)} xFIP`, style: { bg: "#f1f5f9", text: "#64748b" } }
                        : null;

                    return (
                      <div className={cn(
                        "grid h-5 grid-cols-[60px_70px] items-center gap-1",
                        align === "right" ? "justify-end" : "justify-start",
                      )}>
                        {metric ? (
                          <span
                            className="inline-flex h-5 w-[60px] items-center justify-center whitespace-nowrap rounded px-1 text-[9px] font-bold tabular-nums"
                            style={{ backgroundColor: metric.style.bg, color: metric.style.text }}
                          >
                            {metric.label}
                          </span>
                        ) : (
                          <span aria-hidden="true" className="invisible h-5 w-[60px]">—</span>
                        )}
                        {pi.pill && pi.s != null ? (
                          <span
                            className="inline-flex h-5 w-[70px] items-center justify-center whitespace-nowrap rounded px-1 text-[9px] font-bold tabular-nums"
                            style={{ backgroundColor: pi.pill.bg, color: pi.pill.color }}
                          >
                            {pi.s > 0 ? "+" : ""}{pi.s} {pi.shortLabel}
                          </span>
                        ) : (
                          <span aria-hidden="true" className="invisible h-5 w-[70px]">—</span>
                        )}
                      </div>
                    );
                  };

                  return (''',
    page,
    "fixed-size pitcher pill component",
    re.S,
)

page = sub_once(
    r'''                      \{/\* ── Pitcher headers: Home LEFT, Away RIGHT ── \*/\}.*?                      \{/\* ── Stat comparison: Season block then L14 block ── \*/\}''',
    '''                      {/* ── Pitcher headers: Home LEFT, Away RIGHT ── */}
                      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 border-b border-slate-100 pb-2.5">
                        {/* Home LEFT */}
                        <div className="grid min-w-0 grid-rows-[28px_18px_16px_20px] gap-0.5">
                          <div className="flex h-7 items-center gap-1.5 overflow-hidden">
                            <MlbTeamLogo team={game.home.abbreviation} size={28} />
                            <span className="text-[15px] font-extrabold text-slate-950">{game.home.abbreviation}</span>
                            <span className="truncate text-[11px] font-semibold text-slate-400">{game.home.record}</span>
                            {showScore && <span className="text-[18px] font-extrabold text-slate-900">{homeScore}</span>}
                          </div>
                          <span className="block h-[18px] truncate text-[12px] font-semibold leading-[18px] text-[#031635]" title={homePitcherName || "TBD"}>
                            {homePitcherName || "TBD"}
                          </span>
                          <span className="block h-4 text-[11px] leading-4 text-slate-400">
                            {detail?.starters.home.record || "\u00A0"}
                          </span>
                          <PitcherPills pi={homePI} align="left" />
                        </div>
                        <div className="self-center px-1 pt-7 text-[11px] font-bold text-slate-300">vs</div>
                        {/* Away RIGHT */}
                        <div className="grid min-w-0 grid-rows-[28px_18px_16px_20px] justify-items-end gap-0.5 text-right">
                          <div className="flex h-7 max-w-full flex-row-reverse items-center gap-1.5 overflow-hidden">
                            <MlbTeamLogo team={game.away.abbreviation} size={28} />
                            <span className="text-[15px] font-extrabold text-slate-950">{game.away.abbreviation}</span>
                            <span className="truncate text-[11px] font-semibold text-slate-400">{game.away.record}</span>
                            {showScore && <span className="text-[18px] font-extrabold text-slate-900">{awayScore}</span>}
                          </div>
                          <span className="block h-[18px] max-w-full truncate text-[12px] font-semibold leading-[18px] text-[#031635]" title={awayPitcherName || "TBD"}>
                            {awayPitcherName || "TBD"}
                          </span>
                          <span className="block h-4 text-[11px] leading-4 text-slate-400">
                            {detail?.starters.away.record || "\u00A0"}
                          </span>
                          <PitcherPills pi={awayPI} align="right" />
                        </div>
                      </div>

                      {/* ── Stat comparison: Season block then L14 block ── */}''',
    page,
    "fixed-height pitcher header layout",
    re.S,
)

page = sub_once(
    r'''                                    \{pmEdge \? \(\n                                      <span className=\{cn\(.*?\n                                      </span>\n                                    \) : \(''',
    '''                                    {pmEdge ? (
                                      <span className={cn(
                                        "rounded-full px-2.5 py-1 text-[9px] font-extrabold",
                                        pmEdge.isEven
                                          ? "bg-slate-200 text-slate-600"
                                          : pmEdge.edge >= 2
                                            ? "bg-emerald-100 text-emerald-700"
                                            : "bg-sky-100 text-sky-700",
                                      )}>
                                        {pmEdge.isEven ? "Even" : `${pmEdge.team} +${pmEdge.edge.toFixed(1)}%`}
                                      </span>
                                    ) : (''',
    page,
    "non-negative matchup-card Polymarket badge",
    re.S,
)

page = sub_once(
    r'''  const mlEdges = useMemo<Record<number, PanelMlEdge>>\(\(\) => \{.*?  \}, \[detailPreviews, polymarketData\]\);''',
    '''  const mlEdges = useMemo<Record<number, PanelMlEdge>>(() => {
    if (!polymarketData?.games?.length) return {};
    const map: Record<number, PanelMlEdge> = {};
    for (const pmGame of polymarketData.games) {
      if (!pmGame.matched) continue;
      const detail = detailPreviews[pmGame.gamePk];
      if (!detail) continue;
      const edge = computeModelEdge(detail);
      if (edge.pick === "push") continue;

      const pickIsAway = edge.pick === "away";
      const pickAbbr = pickIsAway ? pmGame.away.abbreviation : pmGame.home.abbreviation;
      const confidence = edge.confidence / 100;
      const awayModelProb = pickIsAway ? confidence : 1 - confidence;
      const homeModelProb = 1 - awayModelProb;
      const candidates: Array<{ valueAbbr: string; valueEdge: number }> = [];

      if (pmGame.away.yesPrice != null) {
        candidates.push({
          valueAbbr: pmGame.away.abbreviation,
          valueEdge: Math.round((awayModelProb - pmGame.away.yesPrice) * 1000) / 10,
        });
      }
      if (pmGame.home.yesPrice != null) {
        candidates.push({
          valueAbbr: pmGame.home.abbreviation,
          valueEdge: Math.round((homeModelProb - pmGame.home.yesPrice) * 1000) / 10,
        });
      }

      const best = candidates.sort((a, b) => b.valueEdge - a.valueEdge)[0] ?? null;
      const valueEdge = best && best.valueEdge > 0 ? best.valueEdge : best ? 0 : null;
      const valueAbbr = valueEdge != null && valueEdge > 0 ? best!.valueAbbr : null;

      map[pmGame.gamePk] = { pickAbbr, confidence: edge.confidence, valueAbbr, valueEdge };
    }
    return map;
  }, [detailPreviews, polymarketData]);''',
    page,
    "Polymarket panel value-side calculation",
    re.S,
)

PAGE.write_text(page)

panel = PANEL.read_text()
panel = panel.replace(
    '''export type PanelMlEdge = {
  pickAbbr: string;          // e.g. "NYY"
  confidence: number;        // 50–82, model win probability %
  valueEdge: number | null;  // confidence - polymarket implied prob, in percentage points
};''',
    '''export type PanelMlEdge = {
  pickAbbr: string;          // model lean, e.g. "NYY"
  confidence: number;        // 50–82 confidence index
  valueAbbr: string | null;  // side with positive Polymarket value; null means Even
  valueEdge: number | null;  // always non-negative; 0 means Even
};''',
)

panel = sub_once(
    r'''  // Edge badge styling\n  const edgeBadge = mlEdge && mlEdge.valueEdge != null \? \(\(\) => \{.*?  \} : null;''',
    '''  // Edge badge styling — always show positive value on the correct side, or Even.
  const edgeBadge = mlEdge && mlEdge.valueEdge != null ? (() => {
    const v = mlEdge.valueEdge;
    if (v <= 0 || !mlEdge.valueAbbr) return { bg: "bg-slate-100 text-slate-600", label: "Even" };
    if (v >= 8) return { bg: "bg-emerald-600 text-white", label: `${mlEdge.valueAbbr} +${v.toFixed(1)}%` };
    if (v >= 4) return { bg: "bg-emerald-100 text-emerald-800", label: `${mlEdge.valueAbbr} +${v.toFixed(1)}%` };
    return { bg: "bg-sky-100 text-sky-800", label: `${mlEdge.valueAbbr} +${v.toFixed(1)}%` };
  })() : mlEdge ? {
    // confidence only, no Polymarket price to compare against
    bg: "bg-slate-100 text-slate-600",
    label: `${mlEdge.pickAbbr} model ${mlEdge.confidence}`,
  } : null;''',
    panel,
    "Polymarket panel badge",
    re.S,
)

panel = sub_once(
    r'''      <div className="min-w-0">\n        \{team.probablePitcher \? \(.*?      </div>\n\n      <PriceChip''',
    '''      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_58px] items-center gap-1">
        {team.probablePitcher ? (
          <span
            className="block truncate whitespace-nowrap text-[9.5px] font-medium leading-tight text-slate-400"
            title={pitcherTitle}
          >
            {team.probablePitcher}
          </span>
        ) : (
          <span className="block truncate text-[9px] text-slate-300">—</span>
        )}
        {pitcherXera != null ? (
          <span
            className="inline-flex h-5 w-[58px] items-center justify-center whitespace-nowrap rounded bg-slate-100 px-1 text-[9px] font-semibold tabular-nums text-slate-600"
            title={`${pitcherXera.toFixed(2)} expected ERA`}
          >
            {pitcherXera.toFixed(2)} xERA
          </span>
        ) : (
          <span aria-hidden="true" className="invisible h-5 w-[58px]">—</span>
        )}
      </div>

      <PriceChip''',
    panel,
    "aligned Polymarket pitcher name and metric pill",
    re.S,
)

PANEL.write_text(panel)
print("Applied positive Polymarket value logic and pitcher alignment updates.")
