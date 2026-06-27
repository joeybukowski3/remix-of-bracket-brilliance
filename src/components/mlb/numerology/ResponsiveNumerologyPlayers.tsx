import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { NumerologyAuditCard, safe, type NumerologyCardPlayer } from "./NumerologyAuditCard";

function lineupLabel(player: NumerologyCardPlayer) {
  if (player.battingOrder != null) return `Batting ${player.battingOrder}`;
  if (player.lineupStatus === "confirmed") return "Confirmed lineup";
  if (player.lineupStatus === "projected" || player.lineupStatus === "morning_projected") return "Projected lineup";
  return "Lineup unavailable";
}

function CompactPlayerRow({ player, kind }: { player: NumerologyCardPlayer; kind: "exact" | "root" }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-[#1c223d] bg-[rgba(18,22,38,.72)]">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <div className="min-w-0">
          <p className="truncate font-semibold text-[#e2e1ee]">{player.playerName}</p>
          <p className="truncate text-xs text-[#958ea0]">{player.team} vs {player.opponent} • {lineupLabel(player)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="font-mono text-lg font-bold text-[#d0bcff]">{safe(player.numerologyScore)}</span>
          <ChevronDown className={`h-4 w-4 text-[#958ea0] transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      {open && <div className="border-t border-[#1c223d] p-3"><NumerologyAuditCard player={player} kind={kind} /></div>}
    </div>
  );
}

export function ResponsiveNumerologyPlayers({ players, kind }: { players: NumerologyCardPlayer[]; kind: "exact" | "root" }) {
  if (players.length === 0) return <div className="rounded-xl border border-[#1c223d] p-5 text-sm text-[#958ea0]">No players available.</div>;
  const [first, ...rest] = players;

  return (
    <div className="space-y-4">
      <NumerologyAuditCard player={first} kind={kind} />
      {rest.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1 pt-1">
            <p className="text-xs font-bold uppercase tracking-[.1em] text-[#958ea0]">More players</p>
            <p className="text-xs text-[#958ea0]">Tap to expand</p>
          </div>
          {rest.map((player) => <CompactPlayerRow key={`${player.playerName}-${player.team}`} player={player} kind={kind} />)}
        </div>
      )}
    </div>
  );
}
