import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface HRPropRow {
  player?: string;
  team?: string;
  opponent?: string;
  hrScore?: number;
  barrelRate?: number;
  hardHitRate?: number;
  last7HR?: number;
  last30HR?: number;
  opposingPitcherHrVs?: number;
  pitcherXera?: number;
  hrOddsYes?: string;
  hrValueEdge?: number;
}

interface KPropRow {
  pitcher?: string;
  team?: string;
  opponent?: string;
  strikeoutMatchupScore?: number;
  projectedK9?: number;
  projectedIP?: number;
  kRate?: number;
  whiffRate?: number;
  kOddsOver?: string;
  kOddsUnder?: string;
  kLine?: number;
}

interface PgaBestBetRow {
  playerName?: string;
  playerFirstName?: string;
  playerLastName?: string;
  rank?: number;
  edge?: number;
}

function formatPercent(value?: number) {
  if (!value && value !== 0) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value?: number, decimals = 1) {
  if (!value && value !== 0) return "—";
  return value.toFixed(decimals);
}

/**
 * Display top 8 HR prop picks as a rich table (matches MLB page styling)
 */
export function HRPropsTable({ picks }: { picks: HRPropRow[] }) {
  if (!picks || picks.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-950">
      <div className="min-w-full">
        <div className="px-6 py-4 border-b border-slate-800">
          <h3 className="text-lg font-bold text-white">⚾ MLB HR PROPS</h3>
          <p className="text-xs text-slate-400 mt-1">Top 8 Home Run Edges • Today's Slate</p>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-slate-900 border-b border-slate-800 sticky top-0">
            <tr className="text-slate-300 uppercase tracking-wider">
              <th className="px-6 py-3 text-left font-semibold">Player</th>
              <th className="px-4 py-3 text-center font-semibold">Score</th>
              <th className="px-4 py-3 text-center font-semibold">Line</th>
              <th className="px-4 py-3 text-center font-semibold">Barrel%</th>
              <th className="px-4 py-3 text-center font-semibold">HH%</th>
              <th className="px-4 py-3 text-center font-semibold">L7</th>
              <th className="px-4 py-3 text-center font-semibold">L30</th>
            </tr>
          </thead>
          <tbody>
            {picks.slice(0, 8).map((pick, idx) => (
              <tr 
                key={idx} 
                className="border-b border-slate-800 hover:bg-slate-900/50 transition"
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400 font-semibold w-6">{idx + 1}</span>
                    <div>
                      <div className="font-semibold text-white">{pick.player}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        vs {pick.opponent}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 text-center">
                  <span className={`inline-block rounded-lg px-3 py-1.5 font-bold ${
                    (pick.hrScore ?? 0) > 70 ? 'bg-emerald-600 text-white' : 'bg-emerald-500/20 text-emerald-300'
                  }`}>
                    {pick.hrScore?.toFixed(1)}
                  </span>
                </td>
                <td className="px-4 py-4 text-center">
                  {pick.hrOddsYes ? (
                    <span className="font-bold text-amber-400">{pick.hrOddsYes}</span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
                <td className="px-4 py-4 text-center text-slate-300">
                  {formatPercent(pick.barrelRate)}
                </td>
                <td className="px-4 py-4 text-center text-slate-300">
                  {formatPercent(pick.hardHitRate)}
                </td>
                <td className="px-4 py-4 text-center">
                  <span className="text-slate-400">{pick.last7HR ?? "—"}</span>
                </td>
                <td className="px-4 py-4 text-center">
                  <span className="text-slate-400 font-semibold">{pick.last30HR ?? "—"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-6 py-3 bg-slate-900/50 border-t border-slate-800 text-[11px] text-slate-500 flex gap-4">
          <span>⭐ Barrel ≥18%</span>
          <span>💥 HH ≥55%</span>
          <span>📊 L7 ≥3</span>
          <span>👑 L30 ≥8</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Display top 8 K prop picks as a rich table
 */
export function KPropsTable({ picks }: { picks: KPropRow[] }) {
  if (!picks || picks.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-950">
      <div className="min-w-full">
        <div className="px-6 py-4 border-b border-slate-800">
          <h3 className="text-lg font-bold text-white">🎯 MLB K PROPS</h3>
          <p className="text-xs text-slate-400 mt-1">Top 8 Strikeout Matchups • Today's Slate</p>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-slate-900 border-b border-slate-800 sticky top-0">
            <tr className="text-slate-300 uppercase tracking-wider">
              <th className="px-6 py-3 text-left font-semibold">Pitcher</th>
              <th className="px-4 py-3 text-center font-semibold">Score</th>
              <th className="px-4 py-3 text-center font-semibold">Line</th>
              <th className="px-4 py-3 text-center font-semibold">K%</th>
              <th className="px-4 py-3 text-center font-semibold">Whiff%</th>
              <th className="px-4 py-3 text-center font-semibold">Opp K%</th>
            </tr>
          </thead>
          <tbody>
            {picks.slice(0, 8).map((pick, idx) => (
              <tr 
                key={idx} 
                className="border-b border-slate-800 hover:bg-slate-900/50 transition"
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400 font-semibold w-6">{idx + 1}</span>
                    <div>
                      <div className="font-semibold text-white">{pick.pitcher}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        vs {pick.opponent}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 text-center">
                  <span className={`inline-block rounded-lg px-3 py-1.5 font-bold ${
                    (pick.strikeoutMatchupScore ?? 0) > 60 ? 'bg-purple-600 text-white' : 'bg-purple-500/20 text-purple-300'
                  }`}>
                    {pick.strikeoutMatchupScore?.toFixed(1)}
                  </span>
                </td>
                <td className="px-4 py-4 text-center">
                  {pick.kLine != null ? (
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="font-bold text-amber-400">o{pick.kLine}</span>
                      {pick.kOddsOver && <span className="text-[10px] text-slate-400">{pick.kOddsOver}</span>}
                    </div>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
                <td className="px-4 py-4 text-center text-slate-300">
                  {formatPercent(pick.kRate)}
                </td>
                <td className="px-4 py-4 text-center text-slate-300">
                  {formatPercent(pick.whiffRate)}
                </td>
                <td className="px-4 py-4 text-center text-slate-300">
                  {/* oppKRate not in type yet — show placeholder */}
                  <span className="text-slate-600">—</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-6 py-3 bg-slate-900/50 border-t border-slate-800 text-[11px] text-slate-500 flex gap-4">
          <span>🔥 K% High</span>
          <span>😵 Whiff High</span>
          <span>📈 Score ≥60</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Display top 5 PGA picks
 */
export function PgaTop5Table({ picks }: { picks: PgaBestBetRow[] }) {
  if (!picks || picks.length === 0) return null;

  return (
    <Card className="bg-white">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Top 5 Picks</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {picks.slice(0, 5).map((pick, idx) => (
            <div key={idx} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
              <div className="flex-1">
                <span className="font-semibold text-sm">{idx + 1}. {pick.playerName || `${pick.playerFirstName} ${pick.playerLastName}`}</span>
              </div>
              {pick.edge && (
                <Badge variant={pick.edge > 1.05 ? "default" : "secondary"} className="text-[11px]">
                  {(pick.edge * 100 - 100).toFixed(1)}%
                </Badge>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Display top 10 PGA picks
 */
export function PgaTop10Table({ picks }: { picks: PgaBestBetRow[] }) {
  if (!picks || picks.length === 0) return null;

  return (
    <Card className="bg-white">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Top 10 Picks</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {picks.slice(0, 10).map((pick, idx) => (
            <div key={idx} className="flex items-center justify-between gap-3 py-1.5 border-b last:border-0">
              <div className="flex-1">
                <span className="text-xs"><span className="font-semibold">{idx + 1}.</span> {pick.playerName || `${pick.playerFirstName} ${pick.playerLastName}`}</span>
              </div>
              {pick.edge && (
                <Badge variant={pick.edge > 1.05 ? "default" : "secondary"} className="text-[9px] px-1.5">
                  {(pick.edge * 100 - 100).toFixed(0)}%
                </Badge>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
