import { Fragment, useState } from "react";
import { ChevronDown } from "lucide-react";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import MlbPlayerHeadshot from "@/components/mlb/MlbPlayerHeadshot";
import { safe, signalTone, type NumerologyCardPlayer } from "./NumerologyAuditCard";
import type { HrDashboardBatter } from "@/pages/MlbHrProps";

export type ExplorerRecentActivity = {
  atBatsPrevious2?: number;
  atBatsPrevious5?: number;
  qualifiesDefault?: boolean;
  qualifiesBroad?: boolean;
};

export type ExplorerRow = NumerologyCardPlayer & {
  matchType: "Exact Match" | "Root Match";
  recentActivity?: ExplorerRecentActivity;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalize player name for matching: remove punctuation, suffixes, lowercase */
function normName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+(jr\.?|sr\.?|ii|iii|iv)$/i, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchHrBatter(player: ExplorerRow, batters: HrDashboardBatter[]): HrDashboardBatter | null {
  const pn = normName(player.playerName);
  const pt = player.team?.toUpperCase();
  // Try exact name + team match first
  let found = batters.find(b => normName(b.player) === pn && b.team?.toUpperCase() === pt);
  // Fallback: name only
  if (!found) found = batters.find(b => normName(b.player) === pn);
  return found ?? null;
}

const em = "—";

function pct(v: number | null | undefined, decimals = 1): string {
  if (v == null || !Number.isFinite(Number(v))) return em;
  return `${Number(v).toFixed(decimals)}%`;
}

function num(v: number | null | undefined, decimals = 1): string {
  if (v == null || !Number.isFinite(Number(v))) return em;
  return Number(v).toFixed(decimals);
}

// ── CompactStatTile ───────────────────────────────────────────────────────────

type Tone = "default" | "purple" | "blue" | "gold" | "green" | "red";
const TONE_CLASSES: Record<Tone, string> = {
  default: "border-[#2a304d] bg-[#191b24] text-[#e2e1ee]",
  purple:  "border-[#d0bcff]/25 bg-[#d0bcff]/10 text-[#d0bcff]",
  blue:    "border-[#89ceff]/25 bg-[#89ceff]/10 text-[#89ceff]",
  gold:    "border-[#e9c349]/25 bg-[#e9c349]/10 text-[#f6dc71]",
  green:   "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  red:     "border-red-400/20 bg-red-400/10 text-red-300",
};

function Tile({
  label,
  value,
  tone = "default",
  wide = false,
}: {
  label: string;
  value: React.ReactNode;
  tone?: Tone;
  wide?: boolean;
}) {
  return (
    <div className={`rounded border px-2 py-1.5 ${TONE_CLASSES[tone]} ${wide ? "" : ""}`}>
      <p className="text-[9px] font-bold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-0.5 font-mono text-[13px] font-bold tabular-nums">{value ?? em}</p>
    </div>
  );
}

// ── Signal chips in collapsed row ─────────────────────────────────────────────

function SignalChips({ player, limit }: { player: ExplorerRow; limit?: number }) {
  const signals = player.scoreBreakdown?.signals ?? [];
  const visible = limit ? signals.slice(0, limit) : signals;
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((signal, index) => (
        <span key={`${signal.field}-${index}`} className={`rounded border px-1.5 py-0.5 text-[10px] ${signalTone(signal)}`}>
          {signal.label} {signal.points > 0 ? "+" : ""}{signal.points}
        </span>
      ))}
    </div>
  );
}

// ── Expanded detail panel ─────────────────────────────────────────────────────

function ExpandedDetail({ player, hrBatter }: { player: ExplorerRow; hrBatter: HrDashboardBatter | null }) {
  const breakdown = player.scoreBreakdown;
  const id = Number(player.playerId ?? player.personId);
  const hasHeadshot = Number.isFinite(id) && id > 0;
  const signals = breakdown?.signals ?? [];
  const posSignals = signals.filter(s => s.points > 0);
  const negSignals = signals.filter(s => s.points < 0);
  const profile = breakdown?.profile;

  const angleText = hrBatter?.angleTags && hrBatter.angleTags.length > 0
    ? hrBatter.angleTags.join(", ")
    : em;

  return (
    <div className="border-t border-[#2a304d] bg-[#0c0e16] p-3">
      {/* ── Top zone: 3 columns ── */}
      <div className="flex gap-3">

        {/* LEFT — headshot + score tiles */}
        <div className="flex w-[120px] shrink-0 flex-col gap-1.5">
          {/* Headshot */}
          <div className="relative h-[72px] w-[72px] overflow-hidden rounded-xl border border-[#494454] bg-[#1d1f28] self-center">
            {hasHeadshot
              ? <MlbPlayerHeadshot playerId={id} playerName={player.playerName} className="absolute inset-0 h-full w-full object-cover object-top" />
              : <div className="grid h-full place-items-center font-bold text-xl text-[#d0bcff]">{player.team?.slice(0, 2)}</div>
            }
          </div>
          {/* Numerology tile */}
          <div className={`rounded border px-2 py-1.5 ${TONE_CLASSES.purple}`}>
            <p className="text-[9px] font-bold uppercase tracking-wide opacity-70">Numerology</p>
            <p className="mt-0.5 font-mono text-lg font-bold tabular-nums">{safe(player.numerologyScore)}</p>
            {(breakdown?.exactPrimaryCount ?? 0) > 0 && (
              <p className="text-[9px] text-[#e9c349]">{breakdown!.exactPrimaryCount} exact primary</p>
            )}
          </div>
          {/* Model Rating tile */}
          <div className={`rounded border px-2 py-1.5 ${TONE_CLASSES.blue}`}>
            <p className="text-[9px] font-bold uppercase tracking-wide opacity-70">Model Rating</p>
            <p className="mt-0.5 font-mono text-lg font-bold tabular-nums">{safe(player.baseballScore)}</p>
          </div>
        </div>

        {/* CENTER + RIGHT — profile + stats */}
        <div className="min-w-0 flex-1 space-y-2">
          {/* Player profile tiles */}
          {profile && (
            <div>
              <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-[#e9c349]">Profile</p>
              <div className="grid grid-cols-3 gap-1 sm:grid-cols-6">
                {[
                  ["Personal Day", profile.personalDay],
                  ["Jersey", profile.jersey],
                  ["Life Path", profile.lifePath],
                  ["Birth Day", profile.birthDay],
                  ["Age", profile.age],
                  ["Expression", profile.expression],
                ].map(([label, value]) => (
                  <Tile key={label as string} label={label as string} value={value ?? em} />
                ))}
              </div>
            </div>
          )}

          {/* HR Model stats */}
          <div>
            <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-[#89ceff]">HR Model Stats</p>
            <div className="grid grid-cols-3 gap-1 sm:grid-cols-6">
              <Tile label="HR Odds" value={hrBatter?.hrOddsYes ?? em} tone="gold" />
              <Tile label="HR Score" value={hrBatter ? num(hrBatter.hrScore, 1) : em} tone="blue" />
              <Tile label="Barrel%" value={hrBatter ? pct(hrBatter.barrelRate) : em} />
              <Tile label="Hard Hit%" value={hrBatter ? pct(hrBatter.hardHitRate) : em} />
              <Tile label="L7 HR" value={hrBatter?.last7HR != null ? String(hrBatter.last7HR) : em} />
              <Tile label="L30 HR" value={hrBatter?.last30HR != null ? String(hrBatter.last30HR) : em} />
            </div>
            <div className="mt-1 grid grid-cols-3 gap-1 sm:grid-cols-6">
              <Tile label="Ptch HR VS" value={hrBatter ? num(hrBatter.opposingPitcherHrVs, 1) : em} />
              <Tile label="xERA" value={hrBatter ? num(hrBatter.pitcherXera, 2) : em} />
              <Tile label="FB%" value={hrBatter ? pct(hrBatter.pitcherFlyBallRate) : em} />
              <Tile label="Regr" value={hrBatter ? num(hrBatter.pitcherRegressionScore, 1) : em} />
              <Tile label="Angle" value={angleText} wide />
              <Tile label="Park" value={hrBatter ? num(hrBatter.parkFactor, 0) : em} />
            </div>
          </div>

          {/* Signals */}
          {posSignals.length > 0 && (
            <div>
              <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-[#d0bcff]">Signals</p>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {posSignals.map((s, i) => (
                  <div key={`${s.field}-${i}`} className={`flex items-center justify-between rounded border px-2 py-1 text-[11px] ${signalTone(s)}`}>
                    <span className="truncate pr-2">{s.label}</span>
                    <span className="font-mono font-bold shrink-0">+{s.points}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {negSignals.length > 0 && (
            <div>
              <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-[#ffb4ab]">Penalties</p>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {negSignals.map((s, i) => (
                  <div key={`${s.field}-${i}`} className={`flex items-center justify-between rounded border px-2 py-1 text-[11px] ${signalTone(s)}`}>
                    <span className="truncate pr-2">{s.label}</span>
                    <span className="font-mono font-bold shrink-0">{s.points}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Score summary */}
          {breakdown && (
            <div className="grid grid-cols-6 gap-1 border-t border-[#494454]/40 pt-1.5">
              {[
                ["Positive", `+${breakdown.positiveTotal}`],
                ["Penalty", `-${breakdown.countercurrentTotal}`],
                ["Combo", `+${breakdown.exactComboBonus ?? 0}`],
                ["Bonus", `+${breakdown.convergenceBonus}`],
                ["Raw", String(breakdown.rawNumerology)],
                ["Score", `${breakdown.calculatedScore}/100`],
              ].map(([label, val]) => (
                <div key={label} className="rounded bg-[#191b24] px-1.5 py-1 text-center">
                  <p className="text-[8px] uppercase tracking-wide text-[#958ea0]">{label}</p>
                  <p className="font-mono text-[11px] font-bold">{val}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ExplorerTable ─────────────────────────────────────────────────────────────

export function ExplorerTable({ rows, hrBatters = [] }: { rows: ExplorerRow[]; hrBatters?: HrDashboardBatter[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const toggle = (key: string) => setOpenKey(prev => prev === key ? null : key);

  return (
    <>
      {/* Mobile cards */}
      <div className="space-y-1.5 px-3 pb-3 md:hidden">
        {rows.map((player) => {
          const key = `${player.playerName}-${player.team}`;
          const open = openKey === key;
          const hrBatter = matchHrBatter(player, hrBatters);
          return (
            <article key={key} className="overflow-hidden rounded-xl border border-[#2a304d] bg-[#10131f]">
              <button
                type="button"
                onClick={() => toggle(key)}
                aria-expanded={open}
                className="w-full p-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a078ff]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <MlbTeamLogo team={player.team} size={38} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#e2e1ee]">{player.playerName}</p>
                      <p className="truncate text-xs text-[#958ea0]">{player.team} vs {player.opponent}</p>
                      <p className="text-[10px] text-[#958ea0]">AB: {player.recentActivity?.atBatsPrevious2 ?? 0}/2g · {player.recentActivity?.atBatsPrevious5 ?? 0}/5g</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-right">
                    <div>
                      <p className="font-mono text-base font-bold text-[#d0bcff]">{safe(player.numerologyScore)}</p>
                      <p className="text-[10px] uppercase tracking-wide text-[#958ea0]">Num.</p>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-[#958ea0] transition-transform ${open ? "rotate-180" : ""}`} />
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                  <span className="rounded-full border border-[#494454] px-2 py-0.5 text-[10px] text-[#cbc3d7]">{player.matchType}</span>
                  <span className="text-[11px] text-[#89ceff]">Model {safe(player.baseballScore)}</span>
                </div>
                <div className="mt-2"><SignalChips player={player} limit={3} /></div>
              </button>
              {open && <ExpandedDetail player={player} hrBatter={hrBatter} />}
            </article>
          );
        })}
        {rows.length === 0 && <div className="p-6 text-center text-sm text-[#958ea0]">No players match the selected filters.</div>}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <table className="w-full table-fixed text-left text-sm">
          <thead>
            <tr className="border-b border-[#494454] text-[11px] uppercase tracking-wide text-[#958ea0]">
              <th className="w-[260px] px-3 py-2 font-medium">Player</th>
              <th className="w-[110px] px-3 py-2 font-medium">Match Type</th>
              <th className="px-3 py-2 font-medium">Signals</th>
              <th className="w-[90px] px-3 py-2 font-medium tabular-nums">Numerology</th>
              <th className="w-[100px] px-3 py-2 font-medium tabular-nums">Model Rating</th>
              <th className="w-[40px] px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((player) => {
              const key = `${player.playerName}-${player.team}`;
              const open = openKey === key;
              const hrBatter = matchHrBatter(player, hrBatters);
              return (
                <Fragment key={key}>
                  <tr
                    onClick={() => toggle(key)}
                    className="cursor-pointer hover:bg-[#171925] focus-within:bg-[#171925]"
                  >
                    <td className="border-b border-[#494454]/30 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <MlbTeamLogo team={player.team} size={36} />
                        <div className="min-w-0">
                          <b className="block truncate text-sm">{player.playerName}</b>
                          <div className="text-[11px] text-[#cbc3d7]">{player.team} vs {player.opponent}</div>
                          <div className="text-[10px] text-[#958ea0]">AB: {player.recentActivity?.atBatsPrevious2 ?? 0}/2g · {player.recentActivity?.atBatsPrevious5 ?? 0}/5g</div>
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-[#494454]/30 px-3 py-2 text-xs">{player.matchType}</td>
                    <td className="border-b border-[#494454]/30 px-3 py-2"><SignalChips player={player} limit={4} /></td>
                    <td className="border-b border-[#494454]/30 px-3 py-2 font-mono text-sm tabular-nums">{player.numerologyScore}</td>
                    <td className="border-b border-[#494454]/30 px-3 py-2 font-mono text-sm tabular-nums">{safe(player.baseballScore)}</td>
                    <td className="border-b border-[#494454]/30 px-3 py-2 text-right">
                      <ChevronDown className={`h-4 w-4 text-[#958ea0] transition-transform ${open ? "rotate-180" : ""}`} />
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={6} className="border-b border-[#494454]/30 p-0">
                        <ExpandedDetail player={player} hrBatter={hrBatter} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-[#958ea0]">No players match the selected filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
