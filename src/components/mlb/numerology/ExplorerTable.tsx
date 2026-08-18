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
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+(jr\.?|sr\.?|ii|iii|iv)$/i, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchHrBatter(player: ExplorerRow, batters: HrDashboardBatter[]): HrDashboardBatter | null {
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
  wide: _wide = false,
}: {
  label: string;
  value: React.ReactNode;
  tone?: Tone;
  wide?: boolean;
}) {
  return (
    <div className={`min-w-0 rounded border px-2 py-2 text-center ${TONE_CLASSES[tone]}`}>
      <p className="break-words text-[10px] font-bold uppercase tracking-wide opacity-70 sm:text-[11px]">{label}</p>
      <p className="mt-0.5 break-words font-mono text-[13px] font-bold tabular-nums sm:text-[14px]">{value ?? em}</p>
    </div>
  );
}

// ── Signal chips in collapsed row ─────────────────────────────────────────────

function SignalChips({ player, limit }: { player: ExplorerRow; limit?: number }) {
  const signals = (player.scoreBreakdown?.signals ?? []).filter(s => s.field !== "age");
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
  const signals = (breakdown?.signals ?? []).filter(s => s.field !== "age");
  const posSignals = signals.filter(s => s.points > 0);
  const negSignals = signals.filter(s => s.points < 0);
  const profile = breakdown?.profile;

  const angleText = hrBatter?.angleTags && hrBatter.angleTags.length > 0
    ? hrBatter.angleTags.join(", ")
    : em;

  const sectionHead = "text-[10px] font-bold uppercase tracking-wide sm:text-xs";

  return (
    <div className="overflow-x-hidden border-t border-[#2a304d] bg-[#0c0e16] p-3">
      {/* ── Top zone ── */}
      <div className="flex flex-col gap-3 sm:flex-row">

        {/* LEFT — headshot + score tiles */}
        <div className="flex w-full shrink-0 flex-row items-start gap-2 sm:w-[130px] sm:flex-col">
          {/* Circular headshot */}
          <div className="relative h-[64px] w-[64px] shrink-0 overflow-hidden rounded-full border border-[#494454] bg-[#1d1f28] sm:h-[76px] sm:w-[76px] sm:self-center">
            {hasHeadshot
              ? <MlbPlayerHeadshot playerId={id} playerName={player.playerName} className="absolute inset-0 h-full w-full object-cover" />
              : <div className="grid h-full place-items-center font-bold text-xl text-[#d0bcff]">{player.team?.slice(0, 2)}</div>
            }
          </div>

          <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:flex sm:flex-col">
          {/* Numerology tile */}
          <div className={`rounded border px-2.5 py-2 text-center ${TONE_CLASSES.purple}`}>
            <p className="text-[11px] font-bold uppercase tracking-wide opacity-70">Numerology</p>
            <p className="mt-1 font-mono text-xl font-bold tabular-nums">{safe(player.numerologyScore)}</p>
            {(breakdown?.exactPrimaryCount ?? 0) > 0 && (
              <p className="mt-0.5 text-[10px] text-[#e9c349]">{breakdown!.exactPrimaryCount} exact primary</p>
            )}
            {player.legacyNumerologyScore != null && player.legacyNumerologyScore !== player.numerologyScore && (
              <div className="mt-1.5 border-t border-[#d0bcff]/20 pt-1.5 text-center">
                <p className="text-[10px] text-[#958ea0]">Previous v2 Score</p>
                <p className="font-mono text-sm text-[#958ea0]">
                  {safe(player.legacyNumerologyScore)}
                  <span className={`ml-1 text-[10px] font-bold ${player.numerologyScore - player.legacyNumerologyScore >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    {player.numerologyScore - player.legacyNumerologyScore >= 0 ? "+" : ""}{Math.round(player.numerologyScore - player.legacyNumerologyScore)}
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* Model Rating tile */}
          <div className={`rounded border px-2.5 py-2 text-center ${TONE_CLASSES.blue}`}>
            <p className="text-[11px] font-bold uppercase tracking-wide opacity-70">Model Rating</p>
            <p className="mt-1 font-mono text-xl font-bold tabular-nums">{safe(player.baseballScore)}</p>
          </div>
          </div>
        </div>

        {/* RIGHT — profile + stats + signals + summary */}
        <div className="min-w-0 flex-1 space-y-3 overflow-x-hidden">

          {/* Player profile tiles */}
          {profile && (
            <div>
              <p className={`mb-2 ${sectionHead} text-[#e9c349]`}>Profile</p>
              <div className="grid grid-cols-2 gap-1.5 xs:grid-cols-3 sm:grid-cols-3 md:grid-cols-6">
                {[
                  ["Personal Day", profile.personalDay],
                  ["Jersey", profile.jersey],
                  ["Life Path", profile.lifePath],
                  ["Birth Day", profile.birthDay],
                  ["Age", profile.age],
                  ["Expression", profile.expression],
                ].map(([label, value]) => (
                  <Tile key={label as string} label={label as string} value={value ?? em} tone="purple" />
                ))}
              </div>
            </div>
          )}

          {/* HR Model stats */}
          <div>
            <p className={`mb-2 ${sectionHead} text-[#89ceff]`}>HR Model Stats</p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-6">
              <Tile label="HR Odds" value={hrBatter?.hrOddsYes ?? em} tone="gold" />
              <Tile label="HR Score" value={hrBatter ? num(hrBatter.hrScore, 1) : em} tone="blue" />
              <Tile label="Barrel%" value={hrBatter ? pct(hrBatter.barrelRate) : em} tone="green" />
              <Tile label="Hard Hit%" value={hrBatter ? pct(hrBatter.hardHitRate) : em} tone="green" />
              <Tile label="L7 HR" value={hrBatter?.last7HR != null ? String(hrBatter.last7HR) : em} tone="green" />
              <Tile label="L30 HR" value={hrBatter?.last30HR != null ? String(hrBatter.last30HR) : em} tone="green" />
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-6">
              <Tile label="Ptch HR VS" value={hrBatter ? num(hrBatter.opposingPitcherHrVs, 1) : em} tone="red" />
              <Tile label="xERA" value={hrBatter ? num(hrBatter.pitcherXera, 2) : em} tone="red" />
              <Tile label="FB%" value={hrBatter ? pct(hrBatter.pitcherFlyBallRate) : em} tone="red" />
              <Tile label="Regr" value={hrBatter ? num(hrBatter.pitcherRegressionScore, 1) : em} />
              <Tile label="Angle" value={angleText} />
              <Tile label="Park" value={hrBatter ? num(hrBatter.parkFactor, 0) : em} tone="green" />
            </div>
          </div>

          {/* Positive signals */}
          {posSignals.length > 0 && (
            <div>
              <p className={`mb-2 ${sectionHead} text-[#d0bcff]`}>Signals</p>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {posSignals.map((s, i) => (
                  <div key={`${s.field}-${i}`} className={`flex items-start justify-between gap-2 rounded border px-2 py-1 text-[11px] ${signalTone(s)}`}>
                    <span className="min-w-0 break-words pr-2">{s.label}</span>
                    <span className="font-mono font-bold shrink-0">+{s.points}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Countercurrent penalties */}
          {negSignals.length > 0 && (
            <div>
              <p className={`mb-2 ${sectionHead} text-[#ffb4ab]`}>Penalties</p>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {negSignals.map((s, i) => (
                  <div key={`${s.field}-${i}`} className={`flex items-start justify-between gap-2 rounded border px-2 py-1 text-[11px] ${signalTone(s)}`}>
                    <span className="min-w-0 break-words pr-2">{s.label}</span>
                    <span className="font-mono font-bold shrink-0">{s.points}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {breakdown?.sinCity && (
            <div>
              <p className={`mb-2 ${sectionHead} text-[#e9c349]`}>Sin City Masonic Symbols</p>
              {breakdown.sinCity.included ? (
                <>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-5">
                    {(breakdown.sinCity.matches.length > 0 ? breakdown.sinCity.matches : []).map((match) => (
                      <Tile
                        key={match.field}
                        label={match.field === "currentHrCount" ? "Current HR Count" : match.field === "battingOrder" ? "Lineup Spot" : match.field === "birthDay" ? "Birthday" : match.field === "lifePath" ? "Life Path" : "Jersey #"}
                        value={match.value ?? (match.matchKind === "missing" ? "—" : match.matchKind)}
                        tone={match.points > 0 ? "gold" : "default"}
                      />
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-[#958ea0]">
                    {breakdown.sinCity.matchCount} of {breakdown.sinCity.matches.length || 5} symbols aligned · contribution +{breakdown.sinCity.bonus}
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-[#958ea0]">Sin City excluded from this score.</p>
              )}
            </div>
          )}

          {/* Score summary */}
          {breakdown && (
            <div className="border-t border-[#494454]/40 pt-2 space-y-1.5">
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-6">
                {[
                  { label: "Positive", val: `+${breakdown.positiveTotal}`, cls: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" },
                  { label: "Penalty", val: `-${breakdown.countercurrentTotal}`, cls: "border-red-400/20 bg-red-400/10 text-red-300" },
                  { label: "Synergy", val: `+${breakdown.exactComboBonus ?? 0}`, cls: "border-[#d0bcff]/25 bg-[#d0bcff]/10 text-[#d0bcff]" },
                  { label: "Bonus", val: `+${breakdown.convergenceBonus}`, cls: "border-[#e9c349]/25 bg-[#e9c349]/10 text-[#f6dc71]" },
                  { label: "Raw", val: String(breakdown.rawNumerology), cls: "border-[#89ceff]/25 bg-[#89ceff]/10 text-[#89ceff]" },
                  { label: "Score", val: `${breakdown.calculatedScore}/100`, cls: "border-[#e9c349]/40 bg-[#e9c349]/15 text-[#f6dc71]" },
                ].map(({ label, val, cls }) => (
                  <div key={label} className={`rounded border px-1.5 py-1.5 text-center ${cls}`}>
                    <p className="text-[9px] font-bold uppercase tracking-wide opacity-70 sm:text-[10px]">{label}</p>
                    <p className="font-mono text-[12px] font-bold tabular-nums sm:text-[13px]">{val}</p>
                  </div>
                ))}
              </div>
              {breakdown.modelVersion && (
                <p className="text-right text-[9px] text-[#494454]">Model {breakdown.modelVersion}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sorting ──────────────────────────────────────────────────────────────────

export type SortField = "numerologyScore" | "baseballScore";
export type SortDirection = "desc" | "asc";
export type SortState = { field: SortField; direction: SortDirection } | null;

/** Cycle order: unsorted -> descending -> ascending -> unsorted */
export function nextSortState(current: SortState, field: SortField): SortState {
  if (!current || current.field !== field) return { field, direction: "desc" };
  if (current.direction === "desc") return { field, direction: "asc" };
  return null;
}

/**
 * Deterministic comparator: primary field (per direction) -> other score
 * descending -> player name A-Z. Direction only flips the primary field;
 * the secondary/tertiary tie-breakers always favor higher score / earlier
 * alphabetically, matching the brief's example exactly.
 */
export function compareRowsByNumerologyScore(a: ExplorerRow, b: ExplorerRow): number {
  const aScore = a.numerologyScore ?? 0;
  const bScore = b.numerologyScore ?? 0;
  if (bScore !== aScore) return bScore - aScore;
  const aModel = a.baseballScore ?? 0;
  const bModel = b.baseballScore ?? 0;
  if (bModel !== aModel) return bModel - aModel;
  return a.playerName.localeCompare(b.playerName);
}

export function compareRowsBySort(a: ExplorerRow, b: ExplorerRow, sort: SortState): number {
  if (!sort) return compareRowsByNumerologyScore(a, b);
  const { field, direction } = sort;
  const otherField: SortField = field === "numerologyScore" ? "baseballScore" : "numerologyScore";

  const aPrimary = a[field] ?? 0;
  const bPrimary = b[field] ?? 0;
  if (aPrimary !== bPrimary) {
    return direction === "desc" ? bPrimary - aPrimary : aPrimary - bPrimary;
  }

  const aOther = a[otherField] ?? 0;
  const bOther = b[otherField] ?? 0;
  if (aOther !== bOther) return bOther - aOther;

  return a.playerName.localeCompare(b.playerName);
}

// ── ExplorerTable ─────────────────────────────────────────────────────────────

export function ExplorerTable({ rows, hrBatters = [], sort = null }: { rows: ExplorerRow[]; hrBatters?: HrDashboardBatter[]; sort?: SortState; onSort?: (field: SortField) => void }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const toggle = (key: string) => setOpenKey(prev => prev === key ? null : key);
  const sortedRows = [...rows].sort((a, b) => sort ? compareRowsBySort(a, b, sort) : compareRowsByNumerologyScore(a, b));

  return (
    <>
      {/* Mobile cards */}
      <div className="space-y-1.5 overflow-x-hidden px-3 pb-3 md:hidden">
        {sortedRows.map((player) => {
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
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <MlbTeamLogo team={player.team} size={38} />
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold leading-tight text-[#e2e1ee]">{player.playerName}</p>
                      <p className="break-words text-xs text-[#958ea0]">{player.team} vs {player.opponent}</p>
                      <p className="text-[10px] text-[#958ea0]">AB: {player.recentActivity?.atBatsPrevious2 ?? 0}/2g · {player.recentActivity?.atBatsPrevious5 ?? 0}/5g</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-start gap-2 text-right">
                    <div className="min-w-[52px]">
                      <p className="font-mono text-base font-bold tabular-nums text-[#d0bcff]">{safe(player.numerologyScore)}</p>
                      <p className="text-[10px] uppercase tracking-wide text-[#958ea0]">Num.</p>
                    </div>
                    <div className="min-w-[52px]">
                      <p className="font-mono text-base font-bold tabular-nums text-[#89ceff]">{safe(player.baseballScore)}</p>
                      <p className="text-[10px] uppercase tracking-wide text-[#958ea0]">Model</p>
                    </div>
                    <ChevronDown className={`mt-1 h-4 w-4 text-[#958ea0] transition-transform ${open ? "rotate-180" : ""}`} />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full border border-[#494454] px-2 py-0.5 text-[10px] text-[#cbc3d7]">{player.matchType}</span>
                </div>
                <div className="mt-2"><SignalChips player={player} /></div>
              </button>
              {open && <ExpandedDetail player={player} hrBatter={hrBatter} />}
            </article>
          );
        })}
        {sortedRows.length === 0 && <div className="p-6 text-center text-sm text-[#958ea0]">No players match the selected filters.</div>}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <table className="w-full table-fixed text-left text-sm">
          <thead>
            <tr className="border-b border-[#494454] text-[11px] uppercase tracking-wide text-[#958ea0]">
              <th className="w-[260px] px-3 py-2 font-medium">Player</th>
              <th className="w-[110px] px-3 py-2 font-medium">Match Type</th>
              <th className="px-3 py-2 font-medium">Signals</th>
              <th
                scope="col"
                aria-sort="descending"
                className="w-[110px] px-3 py-2 font-medium tabular-nums text-[#d0bcff]"
              >
                Numerology Score
              </th>
              <th scope="col" aria-sort="none" className="w-[110px] px-3 py-2 font-medium tabular-nums text-[#958ea0]">
                Model Rating
              </th>
              <th className="w-[40px] px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((player) => {
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
            {sortedRows.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-[#958ea0]">No players match the selected filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
