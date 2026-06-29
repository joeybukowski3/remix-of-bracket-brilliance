import { Fragment, useState } from "react";
import { ChevronDown } from "lucide-react";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
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

export function ExplorerTable({ rows }: { rows: ExplorerRow[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <>
      {/* Mobile cards */}
      <div className="space-y-1.5 px-3 pb-3 md:hidden">
        {rows.map((player) => {
          const key = `${player.playerName}-${player.team}`;
          const open = openKey === key;
          return (
            <article key={key} className="overflow-hidden rounded-xl border border-[#2a304d] bg-[#10131f]">
              <button type="button" onClick={() => setOpenKey(open ? null : key)} aria-expanded={open} className="w-full p-2.5 text-left">
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
                    <div><p className="font-mono text-base font-bold text-[#d0bcff]">{safe(player.numerologyScore)}</p><p className="text-[10px] uppercase tracking-wide text-[#958ea0]">Num.</p></div>
                    <ChevronDown className={`h-4 w-4 text-[#958ea0] transition-transform ${open ? "rotate-180" : ""}`} />
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                  <span className="rounded-full border border-[#494454] px-2 py-0.5 text-[10px] text-[#cbc3d7]">{player.matchType}</span>
                  <span className="text-[11px] text-[#89ceff]">Model {safe(player.baseballScore)}</span>
                </div>
                <div className="mt-2"><SignalChips player={player} limit={3} /></div>
              </button>
              {open && <div className="border-t border-[#2a304d] p-3"><NumerologyAuditCard player={player} kind={player.matchType === "Exact Match" ? "exact" : "root"} /></div>}
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
              <th className="w-[80px] px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((player) => {
              const key = `${player.playerName}-${player.team}`;
              const open = openKey === key;
              return (
                <Fragment key={key}>
                  <tr className="hover:bg-[#171925]">
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
                      <button type="button" onClick={() => setOpenKey(open ? null : key)} aria-expanded={open} className="inline-flex items-center gap-1 rounded border border-[#494454] px-2 py-1 text-[11px] hover:bg-[#282a32]">
                        Details <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
                      </button>
                    </td>
                  </tr>
                  {open && <tr><td colSpan={6} className="border-b border-[#494454]/30 bg-[#0c0e16] p-3"><NumerologyAuditCard player={player} kind={player.matchType === "Exact Match" ? "exact" : "root"} /></td></tr>}
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
