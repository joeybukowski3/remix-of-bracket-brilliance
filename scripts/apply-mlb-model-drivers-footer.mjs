#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modelPath = path.join(root, "src", "lib", "mlb", "mlbModelEdge.ts");
const pagePath = path.join(root, "src", "pages", "MlbGameDetail.tsx");

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Unable to find ${label}`);
  }
  return source.replace(before, after);
}

let model = readFileSync(modelPath, "utf8");
model = replaceOnce(
  model,
  `  weight: number;\n  description: string;`,
  `  weight: number;\n  weightedDifference: number; // exact weighted away-minus-home contribution\n  description: string;`,
  "ModelFactor type",
);

model = replaceOnce(
  model,
  `    { label: "Pitcher Quality",  awayScore: Math.round(awayPit),   homeScore: Math.round(homePit),   weight: 0.30, description: "ERA, K/9, BB%, HR/9" },\n    { label: "Matchup Edge",     awayScore: Math.round(awayMatch), homeScore: Math.round(homeMatch), weight: 0.25, description: "Lineup OPS vs pitcher hand · lineup K%" },\n    { label: "Lineup Offense",   awayScore: Math.round(awayOff),   homeScore: Math.round(homeOff),   weight: 0.20, description: "OPS, SLG, OBP" },\n    { label: "Recent Form",      awayScore: Math.round(awayForm),  homeScore: Math.round(homeForm),  weight: 0.15, description: "Last 5 games · home/away split" },\n    { label: "Season Quality",   awayScore: Math.round(awaySzn),   homeScore: Math.round(homeSzn),   weight: 0.10, description: "Season win %" },\n  ];\n\n  const top = factors.reduce((b, f) => Math.abs(f.awayScore - f.homeScore) > Math.abs(b.awayScore - b.homeScore) ? f : b);`,
  `    { label: "Pitcher Quality",  awayScore: Math.round(awayPit),   homeScore: Math.round(homePit),   weight: 0.30, weightedDifference: (awayPit - homePit) * 0.30, description: "ERA, K/9, BB%, HR/9" },\n    { label: "Matchup Edge",     awayScore: Math.round(awayMatch), homeScore: Math.round(homeMatch), weight: 0.25, weightedDifference: (awayMatch - homeMatch) * 0.25, description: "Lineup OPS vs pitcher hand · lineup K%" },\n    { label: "Lineup Offense",   awayScore: Math.round(awayOff),   homeScore: Math.round(homeOff),   weight: 0.20, weightedDifference: (awayOff - homeOff) * 0.20, description: "OPS, SLG, OBP" },\n    { label: "Recent Form",      awayScore: Math.round(awayForm),  homeScore: Math.round(homeForm),  weight: 0.15, weightedDifference: (awayForm - homeForm) * 0.15, description: "Last 5 games · home/away split" },\n    { label: "Season Quality",   awayScore: Math.round(awaySzn),   homeScore: Math.round(homeSzn),   weight: 0.10, weightedDifference: (awaySzn - homeSzn) * 0.10, description: "Season win %" },\n  ];\n\n  const top = factors.reduce((b, f) => Math.abs(f.weightedDifference) > Math.abs(b.weightedDifference) ? f : b);`,
  "weighted model factors",
);
writeFileSync(modelPath, model);

let page = readFileSync(pagePath, "utf8");
page = replaceOnce(
  page,
  `    const edge = Math.round((modelConfidence - polyProb) * 100);`,
  `    const edge = Math.round((modelConfidence - polyProb) * 1000) / 10;`,
  "Polymarket edge precision",
);

const startMarker = `                      {/* ── Footer ── */}`;
const endMarker = `\n                    </>\n                  );`;
const start = page.indexOf(startMarker);
const end = page.indexOf(endMarker, start);
if (start < 0 || end < 0) {
  throw new Error("Unable to locate matchup-card footer block");
}

const replacement = `                      {/* ── Model drivers + market summary footer ── */}
                      {(() => {
                        const driverRows = mlEdge
                          ? mlEdge.factors
                              .map((factor) => {
                                const weightedDifference = factor.weightedDifference;
                                const favoredSide = Math.abs(weightedDifference) < 0.05
                                  ? "push"
                                  : weightedDifference > 0 ? "away" : "home";
                                const favoredTeam = favoredSide === "away"
                                  ? game.away.abbreviation
                                  : favoredSide === "home" ? game.home.abbreviation : null;
                                return { ...factor, weightedDifference, favoredSide, favoredTeam };
                              })
                              .sort((a, b) => Math.abs(b.weightedDifference) - Math.abs(a.weightedDifference))
                              .slice(0, 3)
                          : [];
                        const maxContribution = Math.max(
                          ...driverRows.map((factor) => Math.abs(factor.weightedDifference)),
                          1,
                        );
                        const awayColor = getMlbTeamColors(game.away.abbreviation).primary;
                        const homeColor = getMlbTeamColors(game.home.abbreviation).primary;
                        const awayAbbr = game.away.abbreviation;
                        const homeAbbr = game.home.abbreviation;
                        const ml = mlbOdds?.moneylines?.[\\`\\${awayAbbr}@\\${homeAbbr}\\`];
                        const awayAmerican = ml?.away?.american ?? null;
                        const homeAmerican = ml?.home?.american ?? null;
                        const isRealOdds = (value: string | null) => value != null && /^[+-]\\d+$/.test(String(value).trim());
                        const bothReal = isRealOdds(awayAmerican) && isRealOdds(homeAmerican);

                        return (
                          <div className="mt-auto border-t border-slate-100 bg-slate-50/70 px-3 pb-3 pt-2.5">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.45fr)_minmax(145px,0.75fr)] sm:gap-4">
                              <div className="min-w-0">
                                <div className="mb-2 text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Top Model Drivers</div>
                                {driverRows.length ? (
                                  <div className="space-y-2">
                                    {driverRows.map((factor) => {
                                      const magnitude = Math.abs(factor.weightedDifference);
                                      const width = Math.min(50, (magnitude / maxContribution) * 50);
                                      const contributionLabel = factor.favoredTeam
                                        ? \\`\\${factor.favoredTeam} +\\${magnitude.toFixed(1)}\\`
                                        : "Even";
                                      const tooltip = \\`\\${awayAbbr} \\${factor.awayScore} − \\${homeAbbr} \\${factor.homeScore}; × \\${Math.round(factor.weight * 100)}% = \\${contributionLabel}\\`;
                                      return (
                                        <div key={factor.label} title={tooltip} className="min-w-0">
                                          <div className="mb-0.5 flex items-center justify-between gap-2">
                                            <span className="truncate text-[9px] font-semibold text-slate-500">{factor.label}</span>
                                            <span className="shrink-0 text-[9px] font-extrabold tabular-nums text-slate-700">{contributionLabel}</span>
                                          </div>
                                          <div className="grid grid-cols-[24px_minmax(0,1fr)_24px] items-center gap-1">
                                            <span className="text-[8px] font-bold text-slate-400">{awayAbbr}</span>
                                            <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-200/80">
                                              <div className="absolute inset-y-0 left-1/2 z-10 w-px bg-slate-400/80" />
                                              {factor.favoredSide === "away" && (
                                                <div
                                                  className="absolute inset-y-0 right-1/2 rounded-l-full"
                                                  style={{ width: \\`\\${width}%\\`, backgroundColor: awayColor }}
                                                />
                                              )}
                                              {factor.favoredSide === "home" && (
                                                <div
                                                  className="absolute inset-y-0 left-1/2 rounded-r-full"
                                                  style={{ width: \\`\\${width}%\\`, backgroundColor: homeColor }}
                                                />
                                              )}
                                              {factor.favoredSide === "push" && (
                                                <div className="absolute left-1/2 top-1/2 z-20 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-500" />
                                              )}
                                            </div>
                                            <span className="text-right text-[8px] font-bold text-slate-400">{homeAbbr}</span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="text-[10px] text-slate-400">Model drivers unavailable.</div>
                                )}
                              </div>

                              <div className="border-t border-slate-200 pt-2.5 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                                <div className="mb-1.5 text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Market Summary</div>
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Total</span>
                                    <span className="rounded-full bg-[#031635] px-2.5 py-1 text-[9px] font-extrabold text-white">{edges.total}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-3" title="Model confidence index, not a guaranteed win probability.">
                                    <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">ML Edge</span>
                                    {mlPickAbbr && mlPickColor ? (
                                      <span className="rounded-full px-2.5 py-1 text-[9px] font-extrabold text-white" style={{ backgroundColor: mlPickColor }}>
                                        {mlPickAbbr} {mlEdge!.confidence}
                                      </span>
                                    ) : mlEdge ? (
                                      <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[9px] font-extrabold text-slate-500">Even</span>
                                    ) : (
                                      <span className="text-[10px] font-semibold text-slate-400">—</span>
                                    )}
                                  </div>
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Polymarket Value</span>
                                    {pmEdge ? (
                                      <span className={cn(
                                        "rounded-full px-2.5 py-1 text-[9px] font-extrabold",
                                        pmEdge.edge >= 2 ? "bg-emerald-100 text-emerald-700"
                                          : pmEdge.edge > 0 ? "bg-sky-100 text-sky-700"
                                          : "bg-rose-100 text-rose-700",
                                      )}>
                                        {pmEdge.team} {pmEdge.sign}{pmEdge.edge.toFixed(1)}%
                                      </span>
                                    ) : (
                                      <span className="text-[10px] font-semibold text-slate-400">—</span>
                                    )}
                                  </div>
                                  <div className="flex items-start justify-between gap-3">
                                    <span className="pt-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400">{bothReal ? "Line" : "Win%"}</span>
                                    {awayAmerican && homeAmerican ? (
                                      <div className="text-right text-[9px] font-bold leading-4 text-slate-600">
                                        <div className={mlPickAbbr === awayAbbr ? "text-slate-900" : undefined}>{awayAbbr} {awayAmerican}</div>
                                        <div className={mlPickAbbr === homeAbbr ? "text-slate-900" : undefined}>{homeAbbr} {homeAmerican}</div>
                                      </div>
                                    ) : (
                                      <span className="text-[10px] font-semibold text-slate-400">—</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}`;

page = page.slice(0, start) + replacement + page.slice(end);
writeFileSync(pagePath, page);
console.log("Applied MLB model-driver footer redesign.");
