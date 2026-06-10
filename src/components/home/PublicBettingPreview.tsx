import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

interface BettingSide {
  id: string;
  sport: string;
  sportKey: string;
  awayAbbr: string;
  homeAbbr: string;
  betType: "ML" | "Spread";
  teamAbbr: string;
  publicBetPct: number | null;
  publicMoneyPct: number | null;
  line: string | null;
  result: "win" | "loss" | "push" | null;
  highPublic: boolean;
  gameKey: string;
}

function SportDot({ sport }: { sport: string }) {
  const colors: Record<string, string> = {
    MLB:        "bg-blue-500",
    NBA:        "bg-purple-500",
    NFL:        "bg-green-600",
    "World Cup":"bg-amber-500",
  };
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${colors[sport] ?? "bg-slate-400"}`} />;
}

function ResultDot({ result }: { result: BettingSide["result"] }) {
  if (!result) return <span className="text-slate-300 text-xs">•</span>;
  const map = { win: "text-emerald-500", loss: "text-rose-500", push: "text-slate-400" };
  const label = { win: "W", loss: "L", push: "P" };
  return <span className={`text-xs font-bold ${map[result]}`}>{label[result]}</span>;
}

export function PublicBettingPreview() {
  const [sides, setSides] = useState<BettingSide[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/data/betting-splits/today.json", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.sides) {
          // Only show high-public sides (≥75%), top 6
          setSides(data.sides.filter((s: BettingSide) => s.highPublic).slice(0, 6));
          setDate(data.date);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Don't render the section at all if no high-public sides
  if (!loading && sides.length === 0) return null;

  return (
    <section className="border-t border-black/6 bg-white">
      <div className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400 mb-1">
              Public Betting
            </div>
            <h2 className="text-[26px] font-bold tracking-[-0.02em] text-[#111111]">
              Today's Most Backed Sides
            </h2>
            {date && (
              <p className="mt-1 text-sm text-slate-500">
                Sides with ≥75% public backing — {date}
              </p>
            )}
          </div>
          <Link
            to="/public-betting"
            className="shrink-0 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:border-slate-300"
          >
            Full tracker →
          </Link>
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sides.map(side => (
              <div
                key={side.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
              >
                {/* Left: sport dot + matchup + type */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <SportDot sport={side.sport} />
                    <span className="text-xs text-slate-500">{side.sport}</span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                      {side.betType}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900">
                    {side.sportKey === "mlb" ? (
                      <Link to={`/mlb#game-${side.gameKey}`} className="hover:text-sky-700 hover:underline">
                        {side.awayAbbr} @ {side.homeAbbr}
                      </Link>
                    ) : (
                      `${side.awayAbbr} @ ${side.homeAbbr}`
                    )}
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    <span className="font-semibold text-slate-800">{side.teamAbbr}</span>
                    {side.line && <span className="ml-1 text-slate-400">{side.line}</span>}
                  </div>
                </div>

                {/* Right: pct + result */}
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <span className={`text-base font-bold ${
                    (side.publicBetPct ?? 0) >= 80 ? "text-rose-600" : "text-orange-500"
                  }`}>
                    {side.publicBetPct != null ? `${side.publicBetPct}%` : "—"}
                  </span>
                  <span className="text-[10px] text-slate-400">public</span>
                  <ResultDot result={side.result} />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 text-center">
          <Link
            to="/public-betting"
            className="text-sm font-semibold text-sky-700 hover:underline"
          >
            View full slate with ML/spread, money%, and historical results →
          </Link>
        </div>
      </div>
    </section>
  );
}
