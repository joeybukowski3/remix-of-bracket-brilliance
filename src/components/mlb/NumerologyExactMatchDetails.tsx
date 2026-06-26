import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import MlbPlayerHeadshot from "@/components/mlb/MlbPlayerHeadshot";

type MatchReason = {
  field: string;
  value: number;
  root?: number;
  label: string;
};

type ExactPlayer = {
  playerId?: number | null;
  playerName: string;
  team: string;
  opponent: string;
  opposingPitcher?: string | null;
  jerseyNumber?: number | null;
  battingOrder?: number | null;
  lineupStatus?: string;
  numerologyScore: number;
  baseballScore?: number | null;
  matches: MatchReason[];
  recentActivity?: {
    source?: string;
    previousThreeGameAtBats?: number | null;
  };
};

type HrBatter = {
  player: string;
  team: string;
  opponent?: string;
  opposingPitcher?: string;
  position?: string;
  ballpark?: string;
  parkFactor?: number | null;
  barrelRate?: number | null;
  hardHitRate?: number | null;
  exitVelo?: number | null;
  iso?: number | null;
  hrFBRatio?: number | null;
  pullRate?: number | null;
  last7HR?: number | null;
  last30HR?: number | null;
  hrScore?: number | null;
  hrScoreRank?: number | null;
  opposingPitcherHrVs?: number | null;
  pitcherXera?: number | null;
  pitcherFlyBallRate?: number | null;
  angleTags?: string[];
};

function normalize(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function formatValue(value: number | null | undefined, kind: "number" | "percent" | "decimal" = "number") {
  if (value == null || !Number.isFinite(Number(value))) return "N/A";
  if (kind === "percent") return `${Number(value).toFixed(1)}%`;
  if (kind === "decimal") return Number(value).toFixed(3);
  return Number(value).toFixed(Number(value) % 1 === 0 ? 0 : 1);
}

function DetailTable({ batter }: { batter: HrBatter | null }) {
  const rows = [
    ["HR Score", batter?.hrScore, "number"],
    ["HR Rank", batter?.hrScoreRank, "number"],
    ["Barrel %", batter?.barrelRate, "percent"],
    ["Hard Hit %", batter?.hardHitRate, "percent"],
    ["Exit Velocity", batter?.exitVelo, "number"],
    ["ISO", batter?.iso, "decimal"],
    ["HR/FB %", batter?.hrFBRatio, "percent"],
    ["Pull %", batter?.pullRate, "percent"],
    ["Last 7 HR", batter?.last7HR, "number"],
    ["Last 30 HR", batter?.last30HR, "number"],
    ["Pitcher HR Matchup", batter?.opposingPitcherHrVs, "number"],
    ["Pitcher xERA", batter?.pitcherXera, "number"],
    ["Pitcher FB %", batter?.pitcherFlyBallRate, "percent"],
    ["Park Factor", batter?.parkFactor, "number"],
  ] as const;

  return (
    <div className="overflow-hidden rounded-xl border border-[#494454]/45">
      <table className="w-full text-left text-sm">
        <thead className="bg-[#282a32]">
          <tr>
            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-[#cbc3d7]/55">HR table metric</th>
            <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-[#cbc3d7]/55">Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#494454]/25 bg-[#11131b]">
          {rows.map(([label, value, kind]) => (
            <tr key={label}>
              <td className="px-3 py-2 text-[#cbc3d7]/70">{label}</td>
              <td className="px-3 py-2 text-right font-mono font-semibold text-[#89ceff]">{formatValue(value, kind)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function NumerologyExactMatchDetails() {
  const [players, setPlayers] = useState<ExactPlayer[]>([]);
  const [batters, setBatters] = useState<HrBatter[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (window.location.pathname !== "/mlb/numerology") return;
    let cancelled = false;
    Promise.all([
      fetch("/data/mlb/numerology-daily.json", { cache: "no-store" }).then((response) => response.json()),
      fetch("/data/mlb/hr-props-raw.json", { cache: "no-store" }).then((response) => response.json()),
    ]).then(([numerology, hr]) => {
      if (cancelled) return;
      setPlayers(numerology?.exactNumberMatches ?? []);
      setBatters(hr?.batters ?? []);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (players.length === 0 || window.location.pathname !== "/mlb/numerology") return;
    const cleanups: Array<() => void> = [];

    const bind = () => {
      cleanups.splice(0).forEach((cleanup) => cleanup());
      const cards = Array.from(document.querySelectorAll<HTMLElement>("#exact-matches article"));
      cards.forEach((card, index) => {
        if (!players[index]) return;
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
        card.setAttribute("aria-label", `View numerology and baseball details for ${players[index].playerName}`);
        card.classList.add("cursor-pointer", "transition", "hover:-translate-y-0.5", "focus-visible:outline-none", "focus-visible:ring-2", "focus-visible:ring-[#e9c349]");
        const open = () => setSelectedIndex(index);
        const keydown = (event: KeyboardEvent) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            open();
          }
        };
        card.addEventListener("click", open);
        card.addEventListener("keydown", keydown);
        cleanups.push(() => {
          card.removeEventListener("click", open);
          card.removeEventListener("keydown", keydown);
        });
      });
    };

    bind();
    const observer = new MutationObserver(bind);
    const section = document.querySelector("#exact-matches");
    if (section) observer.observe(section, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [players]);

  const selected = selectedIndex == null ? null : players[selectedIndex] ?? null;
  const hrBatter = useMemo(() => {
    if (!selected) return null;
    return batters.find((batter) => normalize(batter.player) === normalize(selected.playerName) && batter.team === selected.team) ?? null;
  }, [batters, selected]);

  useEffect(() => {
    if (!selected) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSelectedIndex(null); };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
    };
  }, [selected]);

  if (!selected || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedIndex(null); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="numerology-player-detail-title" className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-[#494454] bg-[#0c0e16] text-[#e2e1ee] shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-[#494454]/45 bg-[#11131b]/95 p-5 backdrop-blur-xl">
          {selected.playerId != null && <MlbPlayerHeadshot playerId={selected.playerId} name={selected.playerName} teamAbbreviation={selected.team} size={56} />}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#e9c349]">Exact number match details</p>
            <h2 id="numerology-player-detail-title" className="mt-1 text-2xl font-semibold">{selected.playerName}</h2>
            <p className="mt-1 text-sm text-[#cbc3d7]/65">{selected.team} vs {selected.opponent}{selected.opposingPitcher ? ` · ${selected.opposingPitcher}` : ""}</p>
          </div>
          <button type="button" onClick={() => setSelectedIndex(null)} aria-label="Close player details" className="flex h-11 w-11 items-center justify-center rounded-full border border-[#494454] text-[#cbc3d7] transition hover:bg-[#282a32] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d0bcff]"><X className="h-5 w-5" /></button>
        </header>

        <div className="grid gap-6 p-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-5">
            <div className="rounded-xl border border-[#e9c349]/20 bg-[#e9c349]/5 p-4">
              <div className="flex items-end justify-between gap-3">
                <div><p className="text-[10px] font-bold uppercase tracking-wide text-[#e9c349]">Numerology alignment</p><p className="mt-1 font-mono text-4xl font-bold text-[#d0bcff]">{selected.numerologyScore}</p></div>
                <div className="text-right text-xs text-[#cbc3d7]/55">{selected.jerseyNumber != null && <div>Jersey #{selected.jerseyNumber}</div>}{selected.battingOrder != null && <div>Batting #{selected.battingOrder}</div>}</div>
              </div>
              <div className="mt-4 space-y-2">{selected.matches.map((match) => <div key={`${match.field}-${match.label}`} className="rounded-lg border border-[#e9c349]/15 bg-[#11131b] p-3"><p className="font-semibold text-[#ffe088]">{match.label}</p><p className="mt-1 text-xs text-[#cbc3d7]/55">Exact match through {match.field.replace(/([A-Z])/g, " $1").toLowerCase()}.</p></div>)}</div>
            </div>

            <div className="rounded-xl border border-[#89ceff]/15 bg-[#89ceff]/5 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#89ceff]">Baseball context</p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-[#cbc3d7]/45">HR model score</p><p className="mt-1 font-mono text-xl font-bold text-[#89ceff]">{hrBatter?.hrScore ?? selected.baseballScore ?? "N/A"}</p></div>
                <div><p className="text-[#cbc3d7]/45">HR model rank</p><p className="mt-1 font-mono text-xl font-bold text-[#89ceff]">{hrBatter?.hrScoreRank ?? "N/A"}</p></div>
                <div><p className="text-[#cbc3d7]/45">Ballpark</p><p className="mt-1 text-[#e2e1ee]">{hrBatter?.ballpark ?? "N/A"}</p></div>
                <div><p className="text-[#cbc3d7]/45">Position</p><p className="mt-1 text-[#e2e1ee]">{hrBatter?.position ?? "N/A"}</p></div>
              </div>
              {hrBatter?.angleTags?.length ? <div className="mt-4 flex flex-wrap gap-2">{hrBatter.angleTags.map((tag) => <span key={tag} className="rounded-full bg-[#89ceff]/10 px-2.5 py-1 text-[10px] font-semibold text-[#89ceff]">{tag}</span>)}</div> : null}
            </div>

            <div className="rounded-xl border border-[#494454]/45 bg-[#11131b] p-4 text-sm text-[#cbc3d7]/65">
              <p className="font-semibold text-[#e2e1ee]">Playing-likelihood check</p>
              <p className="mt-2">{selected.recentActivity?.source === "active_lineup" ? "Listed in today’s active lineup." : selected.recentActivity?.source === "previous_three_games" ? `${selected.recentActivity.previousThreeGameAtBats ?? 0} at-bats across the previous three completed games because an active lineup was not available.` : "Activity verification will appear after the next numerology generation."}</p>
            </div>
          </div>

          <div>
            <div className="mb-3"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#89ceff]">Joe Knows Ball HR table</p><p className="mt-1 text-sm text-[#cbc3d7]/55">The same supporting data shown on the HR props page. These metrics are context only and do not change the numerology ranking.</p></div>
            <DetailTable batter={hrBatter} />
            {!hrBatter && <p className="mt-3 rounded-lg border border-amber-400/15 bg-amber-400/5 p-3 text-xs text-amber-200/70">This player is not currently present in the HR props table, so HR model metrics are shown as N/A.</p>}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
