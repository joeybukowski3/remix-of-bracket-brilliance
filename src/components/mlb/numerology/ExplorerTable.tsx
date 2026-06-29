import { Fragment, useState } from "react";
import { ChevronDown } from "lucide-react";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import MlbPlayerHeadshot from "@/components/mlb/MlbPlayerHeadshot";
import { NumerologyAuditCard, safe, signalTone, type NumerologyCardPlayer } from "./NumerologyAuditCard";

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

/** Compact expanded detail panel: score tiles left, stats right */
function ExpandedDetail({ player }: { player: ExplorerRow }) {
  const breakdown = player.scoreBreakdown;
  const id = Number(player.playerId ?? player.personId);
  const hasHeadshot = Number.isFinite(id) && id > 0;
  const signals = breakdown?.signals ?? [];
  const posSignals = signals.filter(s => s.points > 0);
  const negSignals = signals.filter(s => s.points < 0);

  return (
    <div className="border-t border-[#2a304d] bg-[#0c0e16] p-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        {/* ── Left column: headshot + score tiles ── */}
        <div className="flex shrink-0 flex-row gap-2 sm:flex-col sm:w-32">
          {/* Headshot */}
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-[#494454] bg-[#1d1f28] sm:h-28 sm:w-28">
            {hasHeadshot
              ? <MlbPlayerHeadshot playerId={id} playerName={player.playerName} className="absolute inset-0 h-full w-full object-cover object-top" />
              : <div className="grid h-full place-items-center font-bold text-xl text-[#d0bcff]">{player.team.slice(0, 2)}</div>
            }
          </div>
          {/* Score tiles */}
          <div className="flex flex-col gap-1.5 flex-1 sm:flex-none">
            <div className="rounded-lg border border-[#d0bcff]/25 bg-[#d0bcff]/10 px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-wide text-[#d0bcff]">Numerology</p>
              <p className="mt-0.5 font-mono text-xl font-bold text-[#d0bcff]">{safe(player.numerologyScore)}</p>
              {(breakdown?.exactPrimaryCount ?? 0) > 0 && (
                <p className="text-[9px] text-[#e9c349]">{breakdown!.exactPrimaryCount} exact primary</p>
              )}
            </div>
            <div className="rounded-lg border border-[#89ceff]/25 bg-[#89ceff]/10 px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-wide text-[#89ceff]">Model Rating</p>
              <p className="mt-0.5 font-mono text-xl font-bold text-[#89ceff]">{safe(player.baseballScore)}</p>
            </div>
          </div>
        </div>

        {/* ── Right column: profile stats + signals ── */}
        <div className="min-w-0 flex-1 space-y-2">
          {/* Profile stats table */}
          {breakdown?.profile && (
            <div>
              <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-[#e9c349]">Player Profile</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] sm:grid-cols-3">
                {Object.entries(breakdown.profile)
                  .filter(([, v]) => v != null)
                  .map(([key, value]) => (
                    <div key={key} className="flex justify-between rounded bg-[#191b24] px-2 py-1">
                      <span className="capitalize text-[#958ea0]">{key.replace(/([A-Z])/g, " $1")}</span>
                      <span className="font-mono text-[#e2e1ee]">{value}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Qualifying signals */}
          {posSignals.length > 0 && (
            <div>
              <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-[#d0bcff]">Signals</p>
              <div className="space-y-1">
                {posSignals.map((s, i) => (
                  <div key={`${s.field}-${i}`} className={`flex items-center justify-between rounded border px-2 py-1 text-[11px] ${signalTone(s)}`}>
                    <span className="font-medium">{s.label}</span>
                    <span className="font-mono font-bold">+{s.points}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Countercurrents */}
          {negSignals.length > 0 && (
            <div>
              <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-[#ffb4ab]">Penalties</p>
              <div className="space-y-1">
                {negSignals.map((s, i) => (
                  <div key={`${s.field}-${i}`} className={`flex items-center justify-between rounded border px-2 py-1 text-[11px] ${signalTone(s)}`}>
                    <span>{s.label}</span>
                    <span className="font-mono font-bold">{s.points}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Score summary */}
          {breakdown && (
            <div className="grid grid-cols-3 gap-1 border-t border-[#494454]/40 pt-2 text-[10px] sm:grid-cols-6">
              {[
                ["Positive", `+${breakdown.positiveTotal}`],
                ["Penalty", `-${breakdown.countercurrentTotal}`],
                ["Combo", `+${breakdown.exactComboBonus ?? 0}`],
                ["Bonus", `+${breakdown.convergenceBonus}`],
                ["Raw", String(breakdown.rawNumerology)],
                ["Score", `${breakdown.calculatedScore}/100`],
              ].map(([label, val]) => (
                <div key={label} className="rounded bg-[#191b24] px-2 py-1 text-center">
                  <p className="text-[#958ea0]">{label}</p>
                  <p className="font-mono font-bold">{val}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ExplorerTable({ rows }: { rows: ExplorerRow[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const toggle = (key: string) => setOpenKey(prev => prev === key ? null : key);

  return (
    <>
      {/* Mobile cards */}
      <div className="space-y-1.5 px-3 pb-3 md:hidden">
        {rows.map((player) => {
          const key = `${player.playerName}-${player.team}`;
          const open = openKey === key;
          return (
            <article key={key} className="overflow-hidden rounded-xl border border-[#2a304d] bg-[#10131f]">
              {/* Clickable row header */}
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
              {open && <ExpandedDetail player={player} />}
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
              return (
                <Fragment key={key}>
                  {/* Entire row is clickable */}
                  <tr
                    onClick={() => toggle(key)}
                    className="cursor-pointer hover:bg-[#171925] focus-within:bg-[#171925]"
                    aria-expanded={open}
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
                        <ExpandedDetail player={player} />
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
