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
        <span key={`${signal.field}-${index}`} className={`rounded border px-2 py-1 text-[10px] ${signalTone(signal)}`}>
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
      <div className="space-y-2 px-3 pb-4 md:hidden">
        {rows.map((player) => {
          const key = `${player.playerName}-${player.team}`;
          const open = openKey === key;
          return (
            <article key={key} className="overflow-hidden rounded-xl border border-[#2a304d] bg-[#10131f]">
              <button type="button" onClick={() => setOpenKey(open ? null : key)} aria-expanded={open} className="w-full p-3 text-left">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <MlbTeamLogo team={player.team} size={46} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#e2e1ee]">{player.playerName}</p>
                      <p className="truncate text-xs text-[#958ea0]">{player.team} vs {player.opponent}</p>
                      <p className="mt-1 text-[10px] text-[#958ea0]">AB: {player.recentActivity?.atBatsPrevious2 ?? 0} in previous 2 · {player.recentActivity?.atBatsPrevious5 ?? 0} in previous 5</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-right">
                    <div><p className="font-mono text-lg font-bold text-[#d0bcff]">{safe(player.numerologyScore)}</p><p className="text-[10px] uppercase tracking-wide text-[#958ea0]">Numerology</p></div>
                    <ChevronDown className={`h-4 w-4 text-[#958ea0] transition-transform ${open ? "rotate-180" : ""}`} />
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                  <span className="rounded-full border border-[#494454] px-2 py-1 text-[#cbc3d7]">{player.matchType}</span>
                  <span className="text-[#89ceff]">Model {safe(player.baseballScore)}</span>
                </div>
                <div className="mt-3"><SignalChips player={player} limit={3} /></div>
              </button>
              {open && <div className="border-t border-[#2a304d] p-3"><NumerologyAuditCard player={player} kind={player.matchType === "Exact Match" ? "exact" : "root"} /></div>}
            </article>
          );
        })}
        {rows.length === 0 && <div className="p-8 text-center text-sm text-[#958ea0]">No players match the selected filters.</div>}
      </div>

      <div className="hidden md:block">
        <table className="w-full table-fixed text-left">
          <thead><tr>{["Player", "Match Type", "Signals", "Numerology", "Model Rating", ""].map((heading, index) => <th key={`${heading}-${index}`} className="border-b border-[#494454] p-4">{heading}</th>)}</tr></thead>
          <tbody>
            {rows.map((player) => {
              const key = `${player.playerName}-${player.team}`;
              const open = openKey === key;
              return (
                <Fragment key={key}>
                  <tr className="hover:bg-[#171925]">
                    <td className="border-b border-[#494454]/30 p-4">
                      <div className="flex items-center gap-3">
                        <MlbTeamLogo team={player.team} size={52} />
                        <div className="min-w-0"><b className="block truncate">{player.playerName}</b><div className="text-sm text-[#cbc3d7]">{player.team} vs {player.opponent}</div><div className="text-[10px] text-[#958ea0]">AB: {player.recentActivity?.atBatsPrevious2 ?? 0} in previous 2 · {player.recentActivity?.atBatsPrevious5 ?? 0} in previous 5</div></div>
                      </div>
                    </td>
                    <td className="border-b border-[#494454]/30 p-4">{player.matchType}</td>
                    <td className="border-b border-[#494454]/30 p-4"><SignalChips player={player} limit={4} /></td>
                    <td className="border-b border-[#494454]/30 p-4 font-mono">{player.numerologyScore}</td>
                    <td className="border-b border-[#494454]/30 p-4 font-mono">{safe(player.baseballScore)}</td>
                    <td className="border-b border-[#494454]/30 p-4 text-right"><button type="button" onClick={() => setOpenKey(open ? null : key)} aria-expanded={open} className="inline-flex items-center gap-1 rounded border border-[#494454] px-3 py-2 text-xs">Details <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} /></button></td>
                  </tr>
                  {open && <tr><td colSpan={6} className="border-b border-[#494454]/30 bg-[#0c0e16] p-4"><NumerologyAuditCard player={player} kind={player.matchType === "Exact Match" ? "exact" : "root"} /></td></tr>}
                </Fragment>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-[#958ea0]">No players match the selected filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
