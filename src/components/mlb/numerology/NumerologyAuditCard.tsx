import { useState } from "react";
import { ChevronDown } from "lucide-react";
import MlbPlayerHeadshot from "@/components/mlb/MlbPlayerHeadshot";
import type { NumerologyScoreBreakdown, NumerologySignal } from "@/types/mlbNumerology";

export type NumerologyMatch = { field: string; value: number; root?: number; label: string };
export type NumerologyCardPlayer = {
  playerId?: string | number | null;
  personId?: string | number | null;
  playerName: string;
  team: string;
  opponent: string;
  lineupStatus?: string;
  battingOrder?: number | null;
  jerseyNumber?: number | null;
  numerologyScore: number;
  /** Original stored score from the daily JSON, preserved when v3 candidate overwrites numerologyScore */
  legacyNumerologyScore?: number;
  baseballScore?: number | null;
  matches?: NumerologyMatch[];
  scoreBreakdown?: NumerologyScoreBreakdown;
};

export const panel = "rounded-xl border border-[#1c223d] bg-[rgba(18,22,38,.72)] backdrop-blur-xl";
export const cap = "text-[11px] font-bold uppercase tracking-[.1em]";
export const safe = (v: number | null | undefined) => v == null || !Number.isFinite(Number(v)) ? "N/A" : Number(v).toFixed(Number(v) % 1 === 0 ? 0 : 1);
export const signalCategory = (s: NumerologySignal) => s.type === "countercurrent" ? "countercurrent" : s.type === "family_support" ? "family" : s.type === "contextual_echo" ? "context" : s.type.includes("exact") ? "exact" : "root";
export const signalTone = (s: NumerologySignal) => s.points < 0 ? "border-[#ffb4ab]/25 bg-[#93000a]/15 text-[#ffdad6]" : signalCategory(s) === "exact" ? "border-[#e9c349]/25 bg-[#e9c349]/10 text-[#f6dc71]" : signalCategory(s) === "family" ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-[#d0bcff]/20 bg-[#d0bcff]/10 text-[#d0bcff]";

function lineupLabel(player: NumerologyCardPlayer) {
  if (player.battingOrder != null) return `Batting ${player.battingOrder}`;
  if (player.lineupStatus === "confirmed") return "Confirmed lineup";
  if (player.lineupStatus === "projected" || player.lineupStatus === "morning_projected") return "Projected lineup";
  return "Lineup unavailable";
}

export function NumerologyAuditCard({ player, kind }: { player: NumerologyCardPlayer; kind: "exact" | "root" }) {
  const [open, setOpen] = useState(false);
  const id = Number(player.playerId ?? player.personId);
  const breakdown = player.scoreBreakdown;
  const signals = breakdown?.signals ?? [];
  const lineupKnown = player.battingOrder != null || player.lineupStatus === "confirmed" || player.lineupStatus === "projected" || player.lineupStatus === "morning_projected";

  return (
    <article className={`${panel} p-6 ${kind === "exact" ? "border-l-4 border-l-[#e9c349]" : "border-t border-t-[#d0bcff]/30"}`}>
      <div className="flex gap-4">
        <div className="h-14 w-14 overflow-hidden rounded-xl border border-[#494454] bg-[#0c0e16]">
          {Number.isFinite(id) && id > 0 ? <MlbPlayerHeadshot playerId={id} playerName={player.playerName} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center font-bold text-[#d0bcff]">{player.team.slice(0, 2)}</div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate font-serif text-2xl font-semibold">{player.playerName}</h3>
              <p className="text-sm text-[#cbc3d7]">{player.team} vs {player.opponent}</p>
              <span className={`mt-2 inline-flex rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${lineupKnown ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-[#494454] bg-[#191b24] text-[#958ea0]"}`}>
                {lineupLabel(player)}
              </span>
            </div>
            <span className={`h-fit rounded px-2 py-1 ${cap} ${kind === "exact" ? "bg-[#af8d11] text-[#342800]" : "bg-[#d0bcff]/15 text-[#d0bcff]"}`}>{player.matches?.[0]?.label ?? (kind === "exact" ? "Exact Match" : "Root Match")}</span>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="rounded-lg border border-[#d0bcff]/20 bg-[#d0bcff]/10 p-4 text-left">
          <span className="flex justify-between"><span className={`${cap} text-[#d0bcff]`}>Numerology</span><ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} /></span>
          <span className="mt-2 block font-mono text-xl text-[#d0bcff]">{safe(player.numerologyScore)}</span>
        </button>
        <div className="rounded-lg border border-[#89ceff]/20 bg-[#89ceff]/10 p-4"><p className={`${cap} text-[#89ceff]`}>Model Rating</p><p className="mt-2 font-mono text-xl text-[#89ceff]">{safe(player.baseballScore)}</p></div>
      </div>

      {open && (
        <div className="mt-3 space-y-4 rounded-lg border border-[#494454]/60 bg-[#0c0e16] p-4">
          <div className="grid gap-2 sm:grid-cols-2">{Object.entries(breakdown?.profile ?? {}).map(([key, value]) => <div key={key} className="flex justify-between rounded bg-[#191b24] px-3 py-2 text-xs"><span className="capitalize text-[#958ea0]">{key.replace(/([A-Z])/g, " $1")}</span><span className="font-mono">{value ?? "Unavailable"}</span></div>)}</div>
          <div><p className={`${cap} mb-2 text-[#d0bcff]`}>Qualifying signals</p><div className="space-y-2">{signals.filter((signal) => signal.points > 0).map((signal, index) => <div key={`${signal.field}-${index}`} className={`rounded-lg border p-3 ${signalTone(signal)}`}><div className="flex justify-between gap-3"><div><p className="text-sm font-semibold">{signal.label}</p><p className="mt-1 text-xs opacity-75">{signal.description}</p></div><span className="font-mono font-bold">+{signal.points}</span></div></div>)}</div></div>
          {signals.some((signal) => signal.points < 0) && <div><p className={`${cap} mb-2 text-[#ffb4ab]`}>Countercurrent penalties</p>{signals.filter((signal) => signal.points < 0).map((signal, index) => <div key={`${signal.field}-${index}`} className={`mb-2 rounded-lg border p-3 ${signalTone(signal)}`}><div className="flex justify-between"><span>{signal.label}</span><span className="font-mono font-bold">{signal.points}</span></div><p className="mt-1 text-xs opacity-75">{signal.description}</p></div>)}</div>}
          <div className="grid grid-cols-3 gap-2 border-t border-[#494454]/40 pt-3 text-xs"><div>Positive<br /><b>+{breakdown?.positiveTotal ?? 0}</b></div><div>Penalties<br /><b>-{breakdown?.countercurrentTotal ?? 0}</b></div><div>Bonus<br /><b>+{breakdown?.convergenceBonus ?? 0}</b></div><div>Raw<br /><b>{breakdown?.rawNumerology ?? 0}</b></div><div>Ceiling<br /><b>{breakdown?.normCeiling ?? 0}</b></div><div>Final<br /><b>{breakdown?.calculatedScore ?? player.numerologyScore}/100</b></div></div>
          <p className={`text-xs ${breakdown?.scoreVerified ? "text-emerald-300" : "text-amber-300"}`}>{breakdown?.scoreVerified ? "✓ Calculation verified against the published score." : `⚠ Calculated ${breakdown?.calculatedScore}, published ${player.numerologyScore}.`}</p>
        </div>
      )}
    </article>
  );
}
