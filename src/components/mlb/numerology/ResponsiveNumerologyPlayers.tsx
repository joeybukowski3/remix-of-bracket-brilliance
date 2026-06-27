import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { NumerologyAuditCard, safe, type NumerologyCardPlayer } from "./NumerologyAuditCard";

const LARGE_CARD_THRESHOLD = 20;

function CompactPlayerRow({ player, kind }: { player: NumerologyCardPlayer; kind: "exact" | "root" }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-[#1c223d] bg-[rgba(18,22,38,.72)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <p className="truncate font-semibold text-[#e2e1ee]">{player.playerName}</p>
          <p className="truncate text-xs text-[#958ea0]">{player.team} vs {player.opponent}</p>
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
  const featured = players.filter((player) => Number(player.numerologyScore) >= LARGE_CARD_THRESHOLD);
  const compact = players.filter((player) => Number(player.numerologyScore) < LARGE_CARD_THRESHOLD);

  return (
    <>
      <div className="hidden gap-5 md:grid md:grid-cols-2 xl:grid-cols-3">
        {players.map((player) => <NumerologyAuditCard key={`${player.playerName}-${player.team}`} player={player} kind={kind} />)}
      </div>
      <div className="space-y-4 md:hidden">
        {featured.map((player) => <NumerologyAuditCard key={`${player.playerName}-${player.team}`} player={player} kind={kind} />)}
        {compact.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1 pt-2">
              <p className="text-xs font-bold uppercase tracking-[.1em] text-[#958ea0]">Scores below 20</p>
              <p className="text-xs text-[#958ea0]">Tap to expand</p>
            </div>
            {compact.map((player) => <CompactPlayerRow key={`${player.playerName}-${player.team}`} player={player} kind={kind} />)}
          </div>
        )}
      </div>
    </>
  );
}
