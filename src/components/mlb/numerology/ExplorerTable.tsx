import { safe, signalTone, type NumerologyCardPlayer } from "./NumerologyAuditCard";

export type ExplorerRow = NumerologyCardPlayer & { matchType: "Exact Match" | "Root Match" };

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
  return (
    <>
      <div className="space-y-2 px-3 pb-4 md:hidden">
        {rows.map((player) => (
          <article key={`${player.playerName}-${player.team}`} className="rounded-xl border border-[#2a304d] bg-[#10131f] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-[#e2e1ee]">{player.playerName}</p>
                <p className="truncate text-xs text-[#958ea0]">{player.team} vs {player.opponent}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-lg font-bold text-[#d0bcff]">{safe(player.numerologyScore)}</p>
                <p className="text-[10px] uppercase tracking-wide text-[#958ea0]">Numerology</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-xs">
              <span className="rounded-full border border-[#494454] px-2 py-1 text-[#cbc3d7]">{player.matchType}</span>
              <span className="text-[#89ceff]">Model {safe(player.baseballScore)}</span>
            </div>
            <div className="mt-3"><SignalChips player={player} limit={3} /></div>
          </article>
        ))}
        {rows.length === 0 && <div className="p-8 text-center text-sm text-[#958ea0]">No players match the selected signal filters.</div>}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[900px] text-left">
          <thead><tr>{["Player", "Match Type", "Signals", "Numerology", "Model Rating"].map((heading) => <th key={heading} className="border-b border-[#494454] p-5">{heading}</th>)}</tr></thead>
          <tbody>
            {rows.map((player) => (
              <tr key={`${player.playerName}-${player.team}`}>
                <td className="border-b border-[#494454]/30 p-5"><b>{player.playerName}</b><div className="text-sm text-[#cbc3d7]">{player.team} vs {player.opponent}</div></td>
                <td className="border-b border-[#494454]/30 p-5">{player.matchType}</td>
                <td className="border-b border-[#494454]/30 p-5"><div className="max-w-[360px]"><SignalChips player={player} limit={5} /></div></td>
                <td className="border-b border-[#494454]/30 p-5 font-mono">{player.numerologyScore}</td>
                <td className="border-b border-[#494454]/30 p-5 font-mono">{safe(player.baseballScore)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-[#958ea0]">No players match the selected signal filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
