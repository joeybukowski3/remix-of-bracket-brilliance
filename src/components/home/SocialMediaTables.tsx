import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface HRPropRow {
  player?: string;
  team?: string;
  hrScore?: number;
  hrOddsYes?: string;
  hrOddsNo?: string;
  hrValueEdge?: number;
}

interface KPropRow {
  pitcher?: string;
  team?: string;
  strikeoutMatchupScore?: number;
  projectedK9?: number;
  projectedIP?: number;
  kOddsOver?: string;
  kOddsUnder?: string;
}

interface PgaBestBetRow {
  playerName?: string;
  playerFirstName?: string;
  playerLastName?: string;
  rank?: number;
  total?: number;
  courseHealPoints?: number;
  edge?: number;
}

/**
 * Display top 3 HR prop picks as a small table
 */
export function HRPropsTable({ picks }: { picks: HRPropRow[] }) {
  if (!picks || picks.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Top HR Props</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {picks.slice(0, 3).map((pick, idx) => (
            <div key={idx} className="flex items-start justify-between gap-2 text-sm pb-2 border-b last:border-0">
              <div className="flex-1">
                <div className="font-semibold">{idx + 1}. {pick.player} <span className="text-slate-500 font-normal text-xs">({pick.team})</span></div>
                <div className="text-xs text-slate-600">Score: {pick.hrScore?.toFixed(1)}</div>
              </div>
              {pick.hrOddsYes && (
                <div className="text-right text-xs">
                  <div className={pick.hrValueEdge && pick.hrValueEdge > 1.05 ? "text-emerald-600 font-bold" : "text-slate-600"}>
                    {pick.hrOddsYes}
                  </div>
                  {pick.hrValueEdge && pick.hrValueEdge > 1.05 && (
                    <div className="text-emerald-600 text-[10px] font-bold">VAL✓</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Display top 3 K prop picks as a small table
 */
export function KPropsTable({ picks }: { picks: KPropRow[] }) {
  if (!picks || picks.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Top K Props</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {picks.slice(0, 3).map((pick, idx) => (
            <div key={idx} className="flex items-start justify-between gap-2 text-sm pb-2 border-b last:border-0">
              <div className="flex-1">
                <div className="font-semibold">{idx + 1}. {pick.pitcher} <span className="text-slate-500 font-normal text-xs">({pick.team})</span></div>
                <div className="text-xs text-slate-600">Score: {pick.strikeoutMatchupScore?.toFixed(1)} · K/9: {pick.projectedK9?.toFixed(1)} · IP: {pick.projectedIP?.toFixed(1)}</div>
              </div>
              {pick.kOddsOver && (
                <div className="text-right text-xs">
                  <div className="text-slate-600">O {pick.kOddsOver}</div>
                  <div className="text-slate-500 text-[10px]">U {pick.kOddsUnder}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Display top 5 PGA picks from best bets
 */
export function PgaTop5Table({ picks }: { picks: PgaBestBetRow[] }) {
  if (!picks || picks.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Top 5 Picks</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {picks.slice(0, 5).map((pick, idx) => (
            <div key={idx} className="flex items-center justify-between gap-2 text-sm pb-2 border-b last:border-0">
              <div className="flex-1">
                <div className="font-semibold">{idx + 1}. {pick.playerName || `${pick.playerFirstName} ${pick.playerLastName}`}</div>
              </div>
              {pick.edge && (
                <div className="text-right text-xs">
                  <Badge variant={pick.edge > 1.05 ? "default" : "secondary"} className="text-[10px]">
                    {(pick.edge * 100 - 100).toFixed(1)}%
                  </Badge>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Display top 10 PGA picks from best bets
 */
export function PgaTop10Table({ picks }: { picks: PgaBestBetRow[] }) {
  if (!picks || picks.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Top 10 Picks</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {picks.slice(0, 10).map((pick, idx) => (
            <div key={idx} className="flex items-center justify-between gap-2 text-xs pb-1.5 border-b last:border-0">
              <div className="flex-1">
                <span className="font-semibold">{idx + 1}.</span> {pick.playerName || `${pick.playerFirstName} ${pick.playerLastName}`}
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
