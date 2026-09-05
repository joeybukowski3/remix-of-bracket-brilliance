import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { PitcherVenueSplit, StrikeoutPropDetail } from "@/hooks/useMlbStrikeoutPropDetails";
import type { KPropsV2ShadowArtifact, KPropsV2ShadowRow } from "@/hooks/useMlbKPropsV2Shadow";
import type { PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import { mlbInningsToOuts, outsToMlbInnings } from "@/lib/mlb/baseballInnings";
import { cn } from "@/lib/utils";
import { formatRankOrdinal, rankHeatValueClass } from "@/lib/mlb/rankPresentation";
import { splitDisplayName } from "@/components/mlb/props-mobile/PropsMobileTablePrimitives";

const DASH = "N/A";

type CompactAccordionTone = "emerald" | "blue" | "sky" | "amber" | "violet" | "slate";

const compactAccordionToneClasses: Record<CompactAccordionTone, string> = {
  emerald: "border-emerald-200 bg-emerald-50/80 text-emerald-900 hover:bg-emerald-100/80",
  blue: "border-indigo-200 bg-indigo-50/80 text-indigo-900 hover:bg-indigo-100/80",
  sky: "border-sky-200 bg-sky-50/80 text-sky-900 hover:bg-sky-100/80",
  amber: "border-amber-200 bg-amber-50/80 text-amber-900 hover:bg-amber-100/80",
  violet: "border-violet-200 bg-violet-50/80 text-violet-900 hover:bg-violet-100/80",
  slate: "border-slate-200 bg-slate-100/80 text-slate-800 hover:bg-slate-200/70",
};

export function MlbStrikeoutCompactAccordion({
  id,
  title,
  tone,
  children,
}: {
  id: string;
  title: string;
  tone: CompactAccordionTone;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = `${id}-panel`;

  return (
    <section className="min-w-0">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((current) => !current)}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-[11px] font-black uppercase tracking-wide transition-colors",
          compactAccordionToneClasses[tone],
        )}
      >
        <span>{title}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform duration-150", isOpen && "rotate-180")} aria-hidden="true" />
      </button>
      {isOpen && (
        <div id={panelId} className="min-w-0 pt-2">
          {children}
        </div>
      )}
    </section>
  );
}

function fmtText(value: string | null | undefined) {
  return value && value.trim() ? value : DASH;
}
function fmtNumber(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? DASH : String(value);
}
function fmtFixed(value: number | null | undefined, digits = 1) {
  return value == null || !Number.isFinite(value) ? DASH : value.toFixed(digits);
}
function RankHeatValue({ rank }: { rank: number | null | undefined }) {
  return <span data-testid="mlb-rank-heat" className={rankHeatValueClass(rank)}>{formatRankOrdinal(rank)}</span>;
}
function fmtRate(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return DASH;
  return `${(value > 1 ? value : value * 100).toFixed(1)}%`;
}
function fmtIp(value: number | string | null | undefined) {
  return value == null || value === "" ? DASH : String(value);
}
function fmtOutsIp(outs: number | null | undefined) {
  const display = outsToMlbInnings(outs);
  return display ?? DASH;
}
type KLineResult = "over" | "under" | "push" | "neutral";

function resolveKLineResult(strikeouts: number | null | undefined, currentKLine: number | null | undefined): KLineResult {
  if (strikeouts == null || !Number.isFinite(strikeouts) || currentKLine == null || !Number.isFinite(currentKLine) || currentKLine <= 0) return "neutral";
  if (strikeouts > currentKLine) return "over";
  if (strikeouts < currentKLine) return "under";
  return "push";
}

function StrikeoutsVsCurrentLine({ strikeouts, currentKLine, suffix = "" }: { strikeouts: number | null | undefined; currentKLine: number | null | undefined; suffix?: string }) {
  const result = resolveKLineResult(strikeouts, currentKLine);
  const tone = result === "over"
    ? "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200"
    : result === "under"
      ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
      : result === "push"
        ? "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200"
        : "text-slate-700";
  return (
    <span data-testid="historical-k-vs-current-line" data-line-result={result} className={cn("inline-block rounded-md px-1.5 py-0.5 font-black tabular-nums", tone)}>
      {fmtNumber(strikeouts)}{strikeouts == null ? "" : suffix}
    </span>
  );
}
function fmtDate(value: string | null | undefined) {
  if (!value) return DASH;
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function TeamCell({ team }: { team: string | null }) {
  if (!team) return <span>{DASH}</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <MlbTeamLogo team={team} size={14} />
      {team}
    </span>
  );
}

/**
 * Mobile collapsed-row team cell for "Opponent Last 10 Games vs SP" --
 * stacks the opposing starter's last name above the team abbreviation so the
 * matchup is identifiable without expanding the row. `starterName` comes
 * straight from the history record's own `opposingStartingPitcher` field
 * (see opponentSource below); when that field is missing, falls back to the
 * plain team-only cell rather than fabricating a name.
 */
function OpponentGameTeamCell({ team, starterName }: { team: string | null; starterName: string | null }) {
  if (!team) return <span>{DASH}</span>;
  if (!starterName) return <TeamCell team={team} />;
  return (
    <span className="flex min-w-0 items-center gap-1">
      <MlbTeamLogo team={team} size={14} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate font-semibold text-slate-700">{splitDisplayName(starterName).last}</span>
        <span className="block truncate text-[9px] font-medium text-slate-400">{team}</span>
      </span>
    </span>
  );
}

/** One game's mobile row: a compact collapsed summary (date, opponent, one headline stat) that expands to reveal the rest of that game's stats. */
interface CollapsibleGameRow {
  key: string;
  date: ReactNode;
  team: ReactNode;
  primaryValue: ReactNode;
  details: { label: string; value: ReactNode }[];
}

function CollapsibleGameRowCard({ row }: { row: CollapsibleGameRow }) {
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg border border-slate-100 bg-white">
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((current) => !current)}
        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="w-11 shrink-0 text-[11px] font-semibold text-slate-500">{row.date}</span>
          <span className="min-w-0 truncate text-[11px] font-semibold text-slate-700">{row.team}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="text-[12px] font-black text-slate-900">{row.primaryValue}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition-transform", isExpanded && "rotate-180")} />
        </span>
      </button>
      {isExpanded && (
        <div className="grid gap-1 border-t border-slate-100 bg-slate-50/60 px-2 py-1.5">
          {row.details.map((detail) => (
            <div key={detail.label} className="flex min-w-0 items-center justify-between gap-2 text-[11px]">
              <span className="shrink-0 font-black uppercase tracking-wide text-slate-400">{detail.label}</span>
              <span className="min-w-0 text-right font-semibold text-slate-700">{detail.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniTable({
  title,
  columns,
  rows,
  emptyMessage,
  footRows = [],
  columnWidths,
  headerGroups,
  leadingUngroupedColumns = 0,
  mobileLabels,
  mobileCollapsibleRows,
  rowClassNames,
  columnAlignments,
  centerHeaderGroups = false,
  boldRows,
}: {
  title: string;
  columns: string[];
  rows: ReactNode[][];
  emptyMessage: string;
  footRows?: ReactNode[][];
  columnWidths?: string[];
  /** Optional second-tier group labels (e.g. "Season", "Last 5 at Site") spanning the columns after leadingUngroupedColumns. */
  headerGroups?: { label: string; span: number }[];
  /** Number of leading columns (e.g. "Site") that sit outside any group and span both header rows. */
  leadingUngroupedColumns?: number;
  /** Mobile card field labels, when the desktop column headers (e.g. grouped "IP"/"IP") are ambiguous without their group context. Defaults to `columns`. */
  mobileLabels?: string[];
  /** When provided, mobile renders one compact per-game row (date/opponent/headline stat) that expands independently, instead of the default always-expanded field list. Desktop is unaffected. */
  mobileCollapsibleRows?: CollapsibleGameRow[];
  /** Optional per-row emphasis shared by the desktop table and mobile cards. */
  rowClassNames?: string[];
  /** Per-column alignment used when a compact comparison table mixes identity and numeric columns. */
  columnAlignments?: Array<"left" | "center">;
  /** Centers grouped headings over their exact column spans. */
  centerHeaderGroups?: boolean;
  /** Applies emphasis to every value in selected comparison rows, including mobile cards. */
  boldRows?: boolean[];
}) {
  const cardLabels = mobileLabels ?? columns;
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500">
        {title}
      </div>
      <div className="hidden sm:block">
        <table className="w-full table-fixed text-[11px]">
          {columnWidths && (
            <colgroup>
              {columnWidths.map((width, index) => (
                <col key={`col-${index}`} style={{ width }} />
              ))}
            </colgroup>
          )}
          <thead>
            {headerGroups && (
              <tr className="text-[9px] uppercase tracking-wide text-slate-400">
                {columns.slice(0, leadingUngroupedColumns).map((column, index) => (
                  <th key={`lead-${index}`} rowSpan={2} className="border-b border-slate-100 px-2 py-1.5 text-left align-middle font-bold">
                    {column}
                  </th>
                ))}
                {headerGroups.map((group, index) => (
                  <th key={`group-${index}`} colSpan={group.span} className={cn("border-b border-slate-100 px-2 py-1.5 align-middle font-bold", centerHeaderGroups ? "text-center" : "text-left")}>
                    {group.label}
                  </th>
                ))}
              </tr>
            )}
            <tr className="text-[9px] uppercase tracking-wide text-slate-400">
              {columns.slice(headerGroups ? leadingUngroupedColumns : 0).map((column, index) => {
                const columnIndex = index + (headerGroups ? leadingUngroupedColumns : 0);
                return (
                <th key={`col-${index}`} className={cn("border-b border-slate-100 px-2 py-1.5 align-middle font-bold leading-tight", columnAlignments?.[columnIndex] === "center" ? "text-center" : "text-left")}>
                  {column}
                </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row, index) => (
                <tr key={index} className={cn(rowClassNames?.[index] ?? (index % 2 === 0 ? "bg-white" : "bg-slate-50/70"), boldRows?.[index] && "font-bold")}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className={cn("break-words border-b border-slate-50 px-2 py-1.5 align-middle tabular-nums text-slate-700", columnAlignments?.[cellIndex] === "center" ? "text-center" : "text-left")}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-2 py-3 text-center text-slate-400">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
          {footRows.length > 0 && (
            <tfoot>
              {footRows.map((row, index) => (
                <tr key={`foot-${index}`} className="bg-slate-100 font-black text-slate-800">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className={cn("break-words border-t border-slate-200 px-2 py-1.5 tabular-nums", columnAlignments?.[cellIndex] === "center" ? "text-center" : "text-left")}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>
      <div className="grid gap-1.5 p-2 sm:hidden">
        {mobileCollapsibleRows ? (
          mobileCollapsibleRows.length ? (
            mobileCollapsibleRows.map((row) => <CollapsibleGameRowCard key={row.key} row={row} />)
          ) : (
            <div className="px-2 py-3 text-center text-xs text-slate-400">{emptyMessage}</div>
          )
        ) : rows.length ? rows.map((row, index) => (
          <div key={index} className={cn("rounded-lg border p-2", rowClassNames?.[index] ?? "border-slate-100 bg-white", boldRows?.[index] && "font-bold")}>
            {cardLabels.map((label, cellIndex) => (
              <div key={`${label}-${cellIndex}`} className="flex min-w-0 items-start justify-between gap-2 py-0.5 text-[11px]">
                <span className="shrink-0 font-black uppercase tracking-wide text-slate-400">{label}</span>
                <span className={cn("min-w-0 text-right text-slate-700", boldRows?.[index] ? "font-bold" : "font-semibold")}>{row[cellIndex]}</span>
              </div>
            ))}
          </div>
        )) : (
          <div className="px-2 py-3 text-center text-xs text-slate-400">{emptyMessage}</div>
        )}
        {footRows.map((row, index) => (
          <div key={`foot-card-${index}`} data-testid="strikeout-recent-avg-row" className="rounded-lg border border-slate-200 bg-slate-100 p-2">
            {cardLabels.map((label, cellIndex) => (
              <div key={`${label}-${cellIndex}`} className="flex min-w-0 items-start justify-between gap-2 py-0.5 text-[11px]">
                <span className="shrink-0 font-black uppercase tracking-wide text-slate-500">{cellIndex === 0 ? String(row[cellIndex]) : label}</span>
                {cellIndex > 0 && <span className="min-w-0 text-right font-black text-slate-800">{row[cellIndex]}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MlbStrikeoutPropRowDetailLoading() {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-400">
      Loading recent strikeout details…
    </div>
  );
}

export function MlbStrikeoutPropRowDetailUnavailable({ pitcher }: { pitcher: string }) {
  return (
    <div
      data-testid="strikeout-prop-detail-unavailable"
      className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-400"
    >
      Recent strikeout details are not available for {pitcher} right now.
    </div>
  );
}

/**
 * Shown per-row instead of MlbStrikeoutPropRowDetailUnavailable when the
 * details file's own slate date doesn't match the page's current slate
 * date. Deliberately does not say "not available for {pitcher}" -- that
 * phrasing reads as a per-pitcher data gap when the real cause is a global
 * stale file, which the banner above the table already explains.
 */
export function MlbStrikeoutPropRowDetailStale() {
  return (
    <div
      data-testid="strikeout-prop-detail-stale"
      className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3 text-center text-xs text-amber-700"
    >
      Detail data is out of date for the current slate — see the notice above.
    </div>
  );
}

/** Global banner shown once above the table when the details file's slate date doesn't match the page's current slate date. */
export function MlbStrikeoutPropDetailsStaleBanner({ detailsDate, slateDate }: { detailsDate: string | null; slateDate: string | null }) {
  return (
    <div
      data-testid="strikeout-prop-details-stale-warning"
      role="alert"
      className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800"
    >
      Strikeout detail data is out of date (showing {detailsDate ?? "an earlier slate"}, current slate is {slateDate ?? "today"}). Row
      detail panels are temporarily unavailable until the data refreshes. Base rankings above are unaffected.
    </div>
  );
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getNestedRecord(source: Record<string, unknown>, path: string[]) {
  let current: Record<string, unknown> | null = source;
  for (const part of path) {
    current = getRecord(current?.[part]);
    if (!current) return null;
  }
  return current;
}

function getNumber(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getString(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function getArray(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key];
  return Array.isArray(value) ? value : [];
}

function formatAverageIp(summary: Record<string, unknown> | null, totalOutsKey: string, gamesUsedKey = "gamesUsed") {
  const totalOuts = getNumber(summary, totalOutsKey);
  const gamesUsed = getNumber(summary, gamesUsedKey);
  if (totalOuts == null || gamesUsed == null || gamesUsed <= 0) return DASH;
  return fmtOutsIp(Math.round(totalOuts / gamesUsed));
}

/** "N used" only when a valid (possibly zero) games-used count exists; DASH when the summary itself is missing -- never "N/A used". */
function formatGamesUsedLabel(summary: Record<string, unknown> | null, gamesUsedKey = "gamesUsed") {
  const gamesUsed = getNumber(summary, gamesUsedKey);
  return gamesUsed == null ? DASH : `${gamesUsed} used`;
}

function formatVenueInnings(totals: PitcherVenueSplit["season"] | undefined) {
  if (!totals) return DASH;
  const innings = totals.totalOuts != null ? fmtOutsIp(totals.totalOuts) : fmtIp(totals.inningsPitched);
  if (innings === DASH) return DASH;
  return `${innings} (${totals.gamesUsed} ${totals.gamesUsed === 1 ? "start" : "starts"})`;
}

function ratePerNine(total: number | null | undefined, outs: number | null | undefined) {
  if (total == null || outs == null || !Number.isFinite(total) || !Number.isFinite(outs) || outs <= 0) return null;
  return (total * 27) / outs;
}

function ratePerInning(total: number | null | undefined, outs: number | null | undefined) {
  if (total == null || outs == null || !Number.isFinite(total) || !Number.isFinite(outs) || outs <= 0) return null;
  return (total * 3) / outs;
}

function ratePerGame(total: number | null | undefined, games: number | null | undefined) {
  if (total == null || games == null || !Number.isFinite(total) || !Number.isFinite(games) || games <= 0) return null;
  return total / games;
}

function signedTone(value: number | null, invert = false) {
  if (value == null || !Number.isFinite(value) || Math.abs(value) < 0.0001) return "bg-slate-100 text-slate-600";
  const favorable = invert ? value < 0 : value > 0;
  return favorable ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700";
}

function DifferenceCell({ value, percent = false, invert = false }: { value: number | null; percent?: boolean; invert?: boolean }) {
  return (
    <span data-testid={invert ? "hit-difference" : "k-inning-difference"} className={cn("inline-block rounded px-1.5 py-0.5 font-black tabular-nums", signedTone(value, invert))}>
      {value == null ? DASH : `${value > 0 ? "+" : ""}${value.toFixed(percent ? 0 : 2)}${percent ? "%" : ""}`}
    </span>
  );
}

function pitcherVenueRow(split: PitcherVenueSplit, label: string, overallKPerInning: number | null, overallH9: number | null, isToday: boolean): ReactNode[] {
  const seasonKPerInning = ratePerInning(split.season.strikeouts, split.season.totalOuts);
  const seasonH9 = ratePerNine(split.season.hitsAllowed, split.season.totalOuts);
  const seasonKPerGame = ratePerGame(split.season.strikeouts, split.season.gamesUsed);
  const lastFiveKPerInning = ratePerInning(split.lastFiveAtSite.strikeouts, split.lastFiveAtSite.totalOuts);
  const lastFiveH9 = ratePerNine(split.lastFiveAtSite.hitsAllowed, split.lastFiveAtSite.totalOuts);
  const lastFiveKPerGame = ratePerGame(split.lastFiveAtSite.strikeouts, split.lastFiveAtSite.gamesUsed);
  const shortSample = split.lastFiveAtSite.gamesUsed < 5;
  return [
    <span key="site" className="flex flex-wrap items-center gap-1"><span>{label}</span>{isToday && <span className="rounded-full border border-amber-200 bg-amber-100 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-amber-800">Today</span>}</span>,
    formatVenueInnings(split.season),
    fmtFixed(seasonKPerInning, 2),
    <DifferenceCell key="season-k-diff" value={seasonKPerInning != null && overallKPerInning != null ? seasonKPerInning - overallKPerInning : null} />,
    fmtFixed(seasonKPerGame),
    <DifferenceCell key="season-hit-diff" value={seasonH9 != null && overallH9 != null && overallH9 > 0 ? ((seasonH9 - overallH9) / overallH9) * 100 : null} percent invert />,
    <span key="last-five-ip">{formatVenueInnings(split.lastFiveAtSite)}{shortSample ? <sup className="ml-0.5 font-black text-amber-700">*</sup> : null}</span>,
    fmtFixed(lastFiveKPerInning, 2),
    <DifferenceCell key="last-five-k-diff" value={lastFiveKPerInning != null && overallKPerInning != null ? lastFiveKPerInning - overallKPerInning : null} />,
    fmtFixed(lastFiveKPerGame),
    <DifferenceCell key="last-five-hit-diff" value={lastFiveH9 != null && overallH9 != null && overallH9 > 0 ? ((lastFiveH9 - overallH9) / overallH9) * 100 : null} percent invert />,
  ];
}

function PanelCard({ title, children, tone = "slate" }: { title: string; children: ReactNode; tone?: "slate" | "amber" | "sky" }) {
  const toneClass = tone === "amber" ? "border-amber-200 bg-amber-50/60" : tone === "sky" ? "border-sky-200 bg-sky-50/60" : "border-slate-200 bg-white";
  return (
    <section className={cn("min-w-0 rounded-xl border p-2.5", toneClass)}>
      <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-500">{title}</h4>
      <div className="mt-2 min-w-0">{children}</div>
    </section>
  );
}

function SummaryPills({ shadowRow, row }: { shadowRow: KPropsV2ShadowRow; row?: PitcherStrikeoutTeamRow | null }) {
  const fallbackCount = shadowRow.v2.fallbacks.length;
  const warningCount = shadowRow.v2.warnings.length;
  const source = row?.projectionSource ?? null;
  return (
    <div className="flex flex-wrap gap-1.5 text-[10px] font-black uppercase tracking-wide">
      <span
        className={cn(
          "rounded-full border px-2 py-0.5",
          source === "v2" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600",
        )}
      >
        {source ? `Source ${source}` : "Source unknown"}
      </span>
      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600">{shadowRow.v2.confidence} confidence</span>
      {(fallbackCount > 0 || warningCount > 0) && (
        <span className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-amber-800">Incomplete inputs</span>
      )}
    </div>
  );
}

function ProjectionComparison({ detail, shadowRow, row }: { detail: StrikeoutPropDetail; shadowRow: KPropsV2ShadowRow; row?: PitcherStrikeoutTeamRow | null }) {
  const legacyKRate = shadowRow.legacy.projectedKs != null && shadowRow.v2.projectedBattersFaced ? shadowRow.legacy.projectedKs / shadowRow.v2.projectedBattersFaced : null;
  const rows = [
    ["Projected Ks", fmtFixed(shadowRow.legacy.projectedKs), fmtFixed(shadowRow.v2.projectedStrikeouts)],
    ["Projected IP", fmtFixed(shadowRow.legacy.projectedIP), fmtFixed(shadowRow.v2.projectedInnings)],
    ["Projected BF", DASH, fmtFixed(shadowRow.v2.projectedBattersFaced)],
    ["K Rate", fmtRate(legacyKRate), fmtRate(shadowRow.v2.projectedKRate)],
    ["Edge vs Line", fmtFixed(shadowRow.comparison.legacyEdgeToLine), fmtFixed(shadowRow.comparison.v2EdgeToLine)],
  ];
  return (
    <PanelCard title="Projection Comparison" tone="sky">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <SummaryPills shadowRow={shadowRow} row={row} />
        <span className="text-[10px] font-semibold text-slate-500">{detail.pitcher} vs {detail.opponent}</span>
      </div>
      <div className="overflow-hidden rounded-lg border border-sky-100 bg-white">
        <table className="w-full table-fixed text-[11px]">
          <thead><tr className="bg-sky-50 text-[9px] uppercase tracking-wide text-slate-500"><th className="px-2 py-1 text-left">Metric</th><th className="px-2 py-1 text-left">Legacy</th><th className="px-2 py-1 text-left">V2</th></tr></thead>
          <tbody>{rows.map(([metric, legacy, v2]) => <tr key={metric}><td className="border-t border-slate-100 px-2 py-1 font-semibold text-slate-600">{metric}</td><td className="border-t border-slate-100 px-2 py-1 text-slate-700">{legacy}</td><td className="border-t border-slate-100 px-2 py-1 text-slate-700">{v2}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="mt-2 grid gap-1.5 text-[11px] sm:grid-cols-3">
        <div className="rounded-lg bg-white px-2 py-1"><span className="text-slate-400">Δ </span><span className="font-black text-slate-800">{fmtFixed(shadowRow.comparison.v2MinusLegacyKs)}</span></div>
        <div className="rounded-lg bg-white px-2 py-1"><span className="text-slate-400">Abs Δ </span><span className="font-black text-slate-800">{fmtFixed(Math.abs(shadowRow.comparison.v2MinusLegacyKs ?? 0))}</span></div>
        <div className="rounded-lg bg-white px-2 py-1"><span className="text-slate-400">Version </span><span className="font-black text-slate-800">{shadowRow.v2.modelVersion}</span></div>
        <div className="rounded-lg bg-white px-2 py-1"><span className="text-slate-400">Fallbacks </span><span className="font-black text-slate-800">{shadowRow.v2.fallbacks.length}</span></div>
        <div className="rounded-lg bg-white px-2 py-1"><span className="text-slate-400">Warnings </span><span className="font-black text-slate-800">{shadowRow.v2.warnings.length}</span></div>
      </div>
      <div data-testid="k-v2-resolved-production" className="mt-2 grid gap-1.5 text-[11px] sm:grid-cols-3">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-2 py-1"><span className="text-slate-500">Public resolved </span><span className="font-black text-slate-900">{fmtFixed(row?.projectedKs ?? null)}</span></div>
        <div className="rounded-lg bg-white px-2 py-1"><span className="text-slate-400">Source </span><span className="font-black text-slate-800">{row?.projectionSource ?? DASH}</span></div>
        <div className="rounded-lg bg-white px-2 py-1"><span className="text-slate-400">Fallback reason </span><span className="font-black text-slate-800">{row?.projectionFallbackReason ?? DASH}</span></div>
        <div className="rounded-lg bg-white px-2 py-1"><span className="text-slate-400">Legacy </span><span className="font-black text-slate-800">{fmtFixed(row?.legacyProjectedKs ?? shadowRow.legacy.projectedKs)}</span></div>
        <div className="rounded-lg bg-white px-2 py-1"><span className="text-slate-400">Raw V2 </span><span className="font-black text-slate-800">{fmtFixed(shadowRow.v2.projectedStrikeouts)}</span></div>
        <div className="rounded-lg bg-white px-2 py-1"><span className="text-slate-400">Confidence </span><span className="font-black text-slate-800">{row?.v2Confidence ?? shadowRow.v2.confidence}</span></div>
      </div>
      <p className="mt-2 text-[10px] font-semibold text-slate-500">Legacy remains stored as the deterministic fail-safe fallback and as this comparison value. The two projections are never blended.</p>
    </PanelCard>
  );
}

function ModelBreakdown({ shadowRow }: { shadowRow: KPropsV2ShadowRow }) {
  const groups = new Map<string, KPropsV2ShadowRow["v2"]["components"]>();
  for (const component of shadowRow.v2.components) {
    const key = component.group || "other";
    groups.set(key, [...(groups.get(key) ?? []), component]);
  }
  return (
    <PanelCard title="V2 Model Breakdown">
      <div className="grid gap-2">
        {Array.from(groups.entries()).map(([group, components]) => (
          <div key={group} className="min-w-0 overflow-hidden rounded-lg border border-slate-100 bg-white">
            <div className="border-b border-slate-100 bg-slate-50 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-500">{group}</div>
            <table className="w-full table-fixed text-[10px]">
              <thead><tr className="text-[8px] uppercase tracking-wide text-slate-400"><th className="px-2 py-1 text-left">Component</th><th className="px-2 py-1 text-left">Source Value</th><th className="px-2 py-1 text-left">Weight</th><th className="px-2 py-1 text-left">Norm</th><th className="px-2 py-1 text-left">Contribution</th><th className="px-2 py-1 text-left">Source</th><th className="px-2 py-1 text-left">Fallback</th></tr></thead>
              <tbody>{components.map((component) => (
                <tr key={component.key}>
                  <td className="break-words border-t border-slate-50 px-2 py-1 font-semibold text-slate-700">{component.label}</td>
                  <td className="border-t border-slate-50 px-2 py-1 text-slate-600">{fmtFixed(component.value, 3)}</td>
                  <td className="border-t border-slate-50 px-2 py-1 text-slate-600">{fmtFixed(component.weight, 2)}</td>
                  <td className="border-t border-slate-50 px-2 py-1 text-slate-600">{fmtFixed(component.normalizedWeight, 2)}</td>
                  <td className="border-t border-slate-50 px-2 py-1 text-slate-600">{fmtFixed(component.contribution, 3)}</td>
                  <td className="break-words border-t border-slate-50 px-2 py-1 text-slate-600">{component.source}</td>
                  <td className="border-t border-slate-50 px-2 py-1 text-slate-500">{DASH}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ))}
      </div>
      {(shadowRow.v2.fallbacks.length > 0 || shadowRow.v2.warnings.length > 0) && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-amber-100 bg-amber-50 p-2"><div className="text-[10px] font-black uppercase text-amber-800">Fallbacks</div><ul className="mt-1 space-y-1 text-[11px] text-amber-800">{shadowRow.v2.fallbacks.length ? shadowRow.v2.fallbacks.map((item) => <li key={item}>{item}</li>) : <li>{DASH}</li>}</ul></div>
          <div className="rounded-lg border border-amber-100 bg-amber-50 p-2"><div className="text-[10px] font-black uppercase text-amber-800">Warnings</div><ul className="mt-1 space-y-1 text-[11px] text-amber-800">{shadowRow.v2.warnings.length ? shadowRow.v2.warnings.map((item) => <li key={item}>{item}</li>) : <li>{DASH}</li>}</ul></div>
        </div>
      )}
    </PanelCard>
  );
}

function SplitAvailabilityPanel({ shadowRow }: { shadowRow: KPropsV2ShadowRow }) {
  const v2Input = getNestedRecord(shadowRow.inputs, ["v2Input"]);
  const pitcher = getNestedRecord(v2Input ?? {}, ["pitcher"]);
  const opponent = getNestedRecord(v2Input ?? {}, ["opponent"]);
  const rows = [
    ["Pitcher K%", fmtRate(getNumber(pitcher, "seasonKRate")), fmtRate(getNumber(pitcher, "homeKRate")), fmtRate(getNumber(pitcher, "awayKRate")), DASH, DASH, shadowRow.game.pitcherIsHome === true && getNumber(pitcher, "homeKRate") != null ? "Home" : shadowRow.game.pitcherIsHome === false && getNumber(pitcher, "awayKRate") != null ? "Away" : DASH],
    ["Pitcher Whiff%", fmtRate(getNumber(pitcher, "seasonWhiffRate")), fmtRate(getNumber(pitcher, "homeWhiffRate")), fmtRate(getNumber(pitcher, "awayWhiffRate")), DASH, DASH, shadowRow.game.pitcherIsHome === true && getNumber(pitcher, "homeWhiffRate") != null ? "Home" : shadowRow.game.pitcherIsHome === false && getNumber(pitcher, "awayWhiffRate") != null ? "Away" : DASH],
    ["Opponent K%", fmtRate(getNumber(opponent, "seasonKRate")), fmtRate(getNumber(opponent, "homeKRate")), fmtRate(getNumber(opponent, "awayKRate")), fmtRate(getNumber(opponent, "vsLhpKRate")), fmtRate(getNumber(opponent, "vsRhpKRate")), shadowRow.pitcher.handedness === "L" && getNumber(opponent, "vsLhpKRate") != null ? "vs LHP" : shadowRow.pitcher.handedness === "R" && getNumber(opponent, "vsRhpKRate") != null ? "vs RHP" : DASH],
    ["Opponent Whiff%", fmtRate(getNumber(opponent, "seasonWhiffRate")), fmtRate(getNumber(opponent, "homeWhiffRate")), fmtRate(getNumber(opponent, "awayWhiffRate")), DASH, DASH, DASH],
  ];
  return (
    <PanelCard title="Split Availability" tone="amber">
      <div className="overflow-hidden rounded-lg border border-amber-100 bg-white">
        <table className="w-full table-fixed text-[10px]">
          <thead><tr className="bg-amber-50 text-[8px] uppercase tracking-wide text-slate-500"><th className="px-2 py-1 text-left">Metric</th><th className="px-2 py-1 text-left">Overall</th><th className="px-2 py-1 text-left">Home</th><th className="px-2 py-1 text-left">Away</th><th className="px-2 py-1 text-left">vs LHB/LHP</th><th className="px-2 py-1 text-left">vs RHB/RHP</th><th className="px-2 py-1 text-left">Used Today</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row[0]}>{row.map((cell, index) => <td key={index} className="break-words border-t border-slate-50 px-2 py-1 text-slate-700">{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] font-semibold text-amber-800">Unavailable for this slate: pitcher home/away K%, pitcher home/away whiff%, opponent home/away K%, opponent home/away whiff%, opponent vs-LHP/RHP K%. Missing splits are not fabricated or marked as used.</p>
    </PanelCard>
  );
}

function SourceIntegrityPanel({ artifact, publicSlateDate }: { artifact: KPropsV2ShadowArtifact | null; publicSlateDate: string | null }) {
  if (!artifact) return null;
  const sourceWarnings = artifact.diagnostics?.warnings ?? [];
  const dateRows = Object.entries(artifact.sourceDates ?? {});
  return (
    <PanelCard title="Source Integrity">
      <div className="grid gap-1.5 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg bg-slate-50 px-2 py-1"><span className="text-slate-400">Artifact slate </span><span className="font-black text-slate-800">{artifact.slateDate}</span></div>
        <div className="rounded-lg bg-slate-50 px-2 py-1"><span className="text-slate-400">Public slate </span><span className="font-black text-slate-800">{publicSlateDate ?? DASH}</span></div>
        <div className="rounded-lg bg-slate-50 px-2 py-1"><span className="text-slate-400">Generated </span><span className="font-black text-slate-800">{artifact.generatedAt}</span></div>
        <div className="rounded-lg bg-slate-50 px-2 py-1"><span className="text-slate-400">Version </span><span className="font-black text-slate-800">{artifact.modelVersion}</span></div>
      </div>
      <div className="mt-2 rounded-lg border border-slate-100 bg-white p-2 text-[11px] text-slate-600">
        <div className="font-black uppercase tracking-wide text-slate-500">Source-date agreement</div>
        <div className="mt-1 grid gap-1 sm:grid-cols-2">
          {dateRows.map(([source, date]) => <div key={source} className="flex min-w-0 justify-between gap-2"><span className="min-w-0 break-words text-slate-500">{source}</span><span className="shrink-0 font-semibold text-slate-800">{date}</span></div>)}
        </div>
        <div className="mt-2 font-black uppercase tracking-wide text-slate-500">Source warnings</div>
        <ul className="mt-1 space-y-1">{sourceWarnings.length ? sourceWarnings.map((warning) => <li key={warning}>{warning}</li>) : <li>{DASH}</li>}</ul>
      </div>
    </PanelCard>
  );
}

export default function MlbStrikeoutPropRowDetail({ detail, shadowRow = null, shadowArtifact = null, showV2Shadow = false, publicSlateDate = null, row = null, compactLayout = false }: { detail: StrikeoutPropDetail; shadowRow?: KPropsV2ShadowRow | null; shadowArtifact?: KPropsV2ShadowArtifact | null; showV2Shadow?: boolean; publicSlateDate?: string | null; row?: PitcherStrikeoutTeamRow | null; compactLayout?: boolean }) {
  const detailsInput = getNestedRecord(shadowRow?.inputs ?? {}, ["details"]);
  const pitcherSummary = getNestedRecord(detailsInput ?? {}, ["pitcherLastFiveSummary"]);
  // Canonical summary lives on the generated detail artifact itself; the shadow debug artifact's
  // copy is a legacy fallback for older details files that predate this field, and the debug
  // artifact is only ever fetched when V2 shadow debugging is enabled (never for public users).
  const canonicalOpponentSummary = getRecord(detail.opponentLastFiveVsStartersSummary ?? null);
  const shadowOpponentSummary = getNestedRecord(detailsInput ?? {}, ["opponentLastFiveVsStartersSummary"]);
  const opponentSummary = canonicalOpponentSummary ?? shadowOpponentSummary;
  const pitcherSummaryRows = getArray(pitcherSummary, "rows").map((row) => getRecord(row)).filter((row): row is Record<string, unknown> => Boolean(row));
  const opponentSummaryRows = getArray(opponentSummary, "rows").map((row) => getRecord(row)).filter((row): row is Record<string, unknown> => Boolean(row));

  const currentKLine = row?.kLine ?? null;
  const fallbackStartSource = pitcherSummaryRows.length ? pitcherSummaryRows : detail.pitcherLastFiveStarts.map((start, index) => ({
    index,
    date: start.date,
    opponent: start.opponent,
    inningsPitched: start.inningsPitched,
    strikeouts: start.strikeouts,
    hitsAllowed: start.hitsAllowed,
    walksAllowed: start.walksAllowed,
    pitchCount: start.pitchCount,
    opponentKRateRankL30: start.opponentKRateRankL30,
    opponentKRateRankL30VsHand: start.opponentKRateRankL30VsHand,
    opponentWrcPlusRankL30: start.opponentWrcPlusRankL30,
  }));
  const fallbackStartOuts = (start: Record<string, unknown>) => getNumber(start, "outs") ?? mlbInningsToOuts(start.inningsPitched as number | string | null | undefined);
  const perInningFromRecords = (records: Record<string, unknown>[], numeratorKey: string, outsKey: string, inningsKey?: string) => {
    const eligible = records.map((record) => ({
      numerator: getNumber(record, numeratorKey),
      outs: getNumber(record, outsKey) ?? (inningsKey ? mlbInningsToOuts(record[inningsKey] as number | string | null | undefined) : null),
    })).filter((record) => record.numerator != null && record.outs != null && record.outs > 0);
    if (!eligible.length) return null;
    return ratePerInning(
      eligible.reduce((sum, record) => sum + (record.numerator ?? 0), 0),
      eligible.reduce((sum, record) => sum + (record.outs ?? 0), 0),
    );
  };
  const averageFromRecords = (records: Record<string, unknown>[], key: string) => {
    const values = records.map((record) => getNumber(record, key)).filter((value): value is number => value != null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  const fallbackStartRows: ReactNode[][] = fallbackStartSource.map((start, index) => {
    const outs = fallbackStartOuts(start);
    const strikeouts = getNumber(start, "strikeouts");
    return [
      fmtDate(start.date),
      <TeamCell key={`start-opp-${index}`} team={getString(start, "opponent")} />,
      outs != null ? fmtOutsIp(outs) : fmtIp(start.inningsPitched as number | string | null | undefined),
      <StrikeoutsVsCurrentLine key={`start-k-${index}`} strikeouts={strikeouts} currentKLine={currentKLine} />,
      fmtNumber(getNumber(start, "hitsAllowed")),
      fmtNumber(getNumber(start, "walksAllowed")),
      <RankHeatValue key={`start-k-rank-${index}`} rank={getNumber(start, "opponentKRateRankL30")} />,
      <RankHeatValue key={`start-k-hand-rank-${index}`} rank={getNumber(start, "opponentKRateRankL30VsHand")} />,
      <RankHeatValue key={`start-wrc-rank-${index}`} rank={getNumber(start, "opponentWrcPlusRankL30")} />,
      fmtNumber(getNumber(start, "pitchCount")),
    ];
  });
  const fallbackStartCollapsibleRows: CollapsibleGameRow[] = fallbackStartSource.map((start, index) => {
    const strikeouts = getNumber(start, "strikeouts");
    const outs = fallbackStartOuts(start);
    return {
      key: `pitcher-fallback-start-${index}`,
      date: fmtDate(start.date as string | null | undefined),
      team: <TeamCell team={getString(start, "opponent")} />,
      primaryValue: <StrikeoutsVsCurrentLine strikeouts={strikeouts} currentKLine={currentKLine} suffix=" K" />,
      details: [
        { label: "IP", value: outs != null ? fmtOutsIp(outs) : fmtIp(start.inningsPitched as number | string | null | undefined) },
        { label: "Hits Allowed", value: fmtNumber(getNumber(start, "hitsAllowed")) },
        { label: "BB Allowed", value: fmtNumber(getNumber(start, "walksAllowed")) },
        { label: "Opp K% Rank L30", value: <RankHeatValue rank={getNumber(start, "opponentKRateRankL30")} /> },
        { label: "Opp K% Rank L30 vs Hand", value: <RankHeatValue rank={getNumber(start, "opponentKRateRankL30VsHand")} /> },
        { label: "Opp wRC+ Rank L30", value: <RankHeatValue rank={getNumber(start, "opponentWrcPlusRankL30")} /> },
        { label: "Pitch Count", value: fmtNumber(getNumber(start, "pitchCount")) },
      ],
    };
  });

  const fallbackStartAvg: ReactNode[][] = [[
    "AVG",
    formatGamesUsedLabel(pitcherSummary),
    formatAverageIp(pitcherSummary, "totalOuts"),
    fmtFixed(getNumber(pitcherSummary, "averageStrikeouts")),
    fmtFixed(getNumber(pitcherSummary, "totalHitsAllowed") == null || getNumber(pitcherSummary, "gamesUsed") == null ? null : (getNumber(pitcherSummary, "totalHitsAllowed") ?? 0) / (getNumber(pitcherSummary, "gamesUsed") ?? 1)),
    fmtFixed(getNumber(pitcherSummary, "totalWalksAllowed") == null || getNumber(pitcherSummary, "gamesUsed") == null ? null : (getNumber(pitcherSummary, "totalWalksAllowed") ?? 0) / (getNumber(pitcherSummary, "gamesUsed") ?? 1)),
    DASH,
    DASH,
    DASH,
    fmtFixed(getNumber(pitcherSummary, "averagePitchCount")),
  ]];

  const enrichedStarts = detail.pitcherRecentStarts;
  const enrichedSummary = detail.pitcherLastFiveSummary;
  const hasEnrichedPitcherStarts = Array.isArray(enrichedStarts) && enrichedSummary != null;
  const enrichedStartRows: ReactNode[][] = (enrichedStarts ?? []).map((start, index) => {
    return [
      fmtDate(start.date),
      <TeamCell key={`pitcher-start-opp-${index}`} team={start.opponentAbbr ?? start.opponent ?? null} />,
      start.outsRecorded != null ? fmtOutsIp(start.outsRecorded) : fmtIp(start.inningsPitched),
      <StrikeoutsVsCurrentLine key={`pitcher-start-k-${index}`} strikeouts={start.strikeouts} currentKLine={currentKLine} />,
      fmtNumber(start.hitsAllowed),
      fmtNumber(start.walksAllowed),
      <RankHeatValue key={`pitcher-start-k-rank-${index}`} rank={start.opponentKRateRankL30} />,
      <RankHeatValue key={`pitcher-start-k-hand-rank-${index}`} rank={start.opponentKRateRankL30VsHand} />,
      <RankHeatValue key={`pitcher-start-wrc-rank-${index}`} rank={start.opponentWrcPlusRankL30} />,
      fmtNumber(start.pitchCount),
    ];
  });
  const enrichedStartCollapsibleRows: CollapsibleGameRow[] = (enrichedStarts ?? []).map((start, index) => {
    return {
      key: `pitcher-enriched-start-${index}`,
      date: fmtDate(start.date),
      team: <TeamCell team={start.opponentAbbr ?? start.opponent ?? null} />,
      primaryValue: <StrikeoutsVsCurrentLine strikeouts={start.strikeouts} currentKLine={currentKLine} suffix=" K" />,
      details: [
        { label: "IP", value: start.outsRecorded != null ? fmtOutsIp(start.outsRecorded) : fmtIp(start.inningsPitched) },
        { label: "Hits Allowed", value: fmtNumber(start.hitsAllowed) },
        { label: "BB Allowed", value: fmtNumber(start.walksAllowed) },
        { label: "Opp K% Rank L30", value: <RankHeatValue rank={start.opponentKRateRankL30} /> },
        { label: "Opp K% Rank L30 vs Hand", value: <RankHeatValue rank={start.opponentKRateRankL30VsHand} /> },
        { label: "Opp wRC+ Rank L30", value: <RankHeatValue rank={start.opponentWrcPlusRankL30} /> },
        { label: "Pitch Count", value: fmtNumber(start.pitchCount) },
      ],
    };
  });
  const enrichedStartAvg: ReactNode[][] = enrichedSummary ? [[
    "AVG",
    `${fmtNumber(enrichedSummary.gamesUsed)} used`,
    enrichedSummary.averageInningsOuts != null ? fmtOutsIp(Math.round(enrichedSummary.averageInningsOuts)) : DASH,
    fmtFixed(enrichedSummary.averageStrikeouts),
    fmtFixed(enrichedSummary.totalHitsAllowed == null || enrichedSummary.gamesUsed <= 0 ? null : enrichedSummary.totalHitsAllowed / enrichedSummary.gamesUsed),
    fmtFixed(enrichedSummary.totalWalksAllowed == null || enrichedSummary.gamesUsed <= 0 ? null : enrichedSummary.totalWalksAllowed / enrichedSummary.gamesUsed),
    DASH,
    DASH,
    DASH,
    fmtFixed(enrichedSummary.averagePitchCount),
  ]] : [];
  const startColumns = ["Date", "Opp", "IP", "K", "Hits Allowed", "BB Allowed", "Opp K% Rank L30", "Opp K% Rank L30 vs Hand", "Opp wRC+ Rank L30", "Pitch Count"];
  const startRows = hasEnrichedPitcherStarts ? enrichedStartRows : fallbackStartRows;
  const startAvg = hasEnrichedPitcherStarts ? enrichedStartAvg : fallbackStartAvg;
  const startCollapsibleRows = hasEnrichedPitcherStarts ? enrichedStartCollapsibleRows : fallbackStartCollapsibleRows;
  const activeSeasonSplits = detail.pitcherVenueSplits
    ? [detail.pitcherVenueSplits.home.season, detail.pitcherVenueSplits.away.season].filter((split) => split.gamesUsed > 0)
    : [];
  const combinedSeasonTotal = (key: "totalOuts" | "strikeouts" | "hitsAllowed") => {
    if (!activeSeasonSplits.length || activeSeasonSplits.some((split) => split[key] == null)) return null;
    return activeSeasonSplits.reduce((sum, split) => sum + (split[key] ?? 0), 0);
  };
  const overallSeasonOuts = combinedSeasonTotal("totalOuts");
  const overallSeasonKPerInning = ratePerInning(combinedSeasonTotal("strikeouts"), overallSeasonOuts);
  const overallSeasonH9 = ratePerNine(combinedSeasonTotal("hitsAllowed"), overallSeasonOuts);
  const [todayAwayTeam, todayHomeTeam] = String(row?.gameKey ?? "").split("@").map((team) => team.trim().toUpperCase());
  const pitcherTeam = String(row?.team ?? detail.team).trim().toUpperCase();
  const todaySite = pitcherTeam && pitcherTeam === todayHomeTeam
    ? "home"
    : pitcherTeam && pitcherTeam === todayAwayTeam
      ? "away"
      : null;
  const hasShortVenueSample = Boolean(detail.pitcherVenueSplits && (
    detail.pitcherVenueSplits.home.lastFiveAtSite.gamesUsed < 5
    || detail.pitcherVenueSplits.away.lastFiveAtSite.gamesUsed < 5
  ));
  const pitcherVenueRows = detail.pitcherVenueSplits
    ? [
      pitcherVenueRow(detail.pitcherVenueSplits.home, "Home", overallSeasonKPerInning, overallSeasonH9, todaySite === "home"),
      pitcherVenueRow(detail.pitcherVenueSplits.away, "Away", overallSeasonKPerInning, overallSeasonH9, todaySite === "away"),
    ]
    : [];
  const pitcherVenueRowClasses = detail.pitcherVenueSplits
    ? [
      todaySite === "home" ? "border-l-2 border-amber-300 bg-amber-50 text-slate-900" : "bg-white font-normal",
      todaySite === "away" ? "border-l-2 border-amber-300 bg-amber-50 text-slate-900" : "bg-white font-normal",
    ]
    : [];
  const pitcherVenueBoldRows = detail.pitcherVenueSplits
    ? [todaySite === "home", todaySite === "away"]
    : [];

  const opponentSource = detail.opponentLastFiveGames.length ? detail.opponentLastFiveGames.map((game, index) => ({
    index,
    date: game.date,
    opponent: game.opponent,
    opposingStartingPitcher: game.opposingStartingPitcher,
    opposingStarterInningsPitched: game.opposingStarterInningsPitched,
    opposingStarterStrikeouts: game.opposingStarterStrikeouts,
    opposingStarterWalks: game.opposingStarterWalks,
    opposingStarterSeasonKPerGame: game.opposingStarterSeasonKPerGame,
    opposingStarterLastFiveKPerGamePrior: game.opposingStarterLastFiveKPerGamePrior,
    teamStrikeouts: game.teamTotalStrikeouts,
  })) : opponentSummaryRows;
  const opponentRows: ReactNode[][] = opponentSource.map((game, index) => {
    const starterOuts = getNumber(game, "opposingStarterOuts") ?? mlbInningsToOuts(game.opposingStarterInningsPitched as number | string | null | undefined);
    const starterStrikeouts = getNumber(game, "opposingStarterStrikeouts");
    const teamStrikeouts = getNumber(game, "teamStrikeouts");
    return [
      fmtDate(game.date),
      <TeamCell key={`vs-opp-${index}`} team={getString(game, "opponent")} />,
      fmtText(getString(game, "opposingStartingPitcher")),
      starterOuts != null ? fmtOutsIp(starterOuts) : fmtIp(game.opposingStarterInningsPitched as number | string | null | undefined),
      <StrikeoutsVsCurrentLine key={`opponent-sp-k-${index}`} strikeouts={starterStrikeouts} currentKLine={currentKLine} />,
      fmtFixed(getNumber(game, "opposingStarterSeasonKPerGame")),
      fmtFixed(getNumber(game, "opposingStarterLastFiveKPerGamePrior")),
      fmtNumber(teamStrikeouts),
      fmtFixed(teamStrikeouts == null ? null : teamStrikeouts / 9, 2),
    ];
  });
  const opponentCollapsibleRows: CollapsibleGameRow[] = opponentSource.map((game, index) => ({
    key: `opponent-game-${index}`,
    date: fmtDate(game.date as string | null | undefined),
    team: <OpponentGameTeamCell team={getString(game, "opponent")} starterName={getString(game, "opposingStartingPitcher")} />,
    primaryValue: <StrikeoutsVsCurrentLine strikeouts={getNumber(game, "opposingStarterStrikeouts")} currentKLine={currentKLine} suffix=" K" />,
    details: [
      { label: "Opposing SP", value: fmtText(getString(game, "opposingStartingPitcher")) },
      { label: "SP IP", value: getNumber(game, "opposingStarterOuts") != null ? fmtOutsIp(getNumber(game, "opposingStarterOuts")) : fmtIp(game.opposingStarterInningsPitched as number | string | null | undefined) },
      { label: "SP K Per Game SZN", value: fmtFixed(getNumber(game, "opposingStarterSeasonKPerGame")) },
      { label: "SP K Avg Per Game L5 Prior", value: fmtFixed(getNumber(game, "opposingStarterLastFiveKPerGamePrior")) },
      { label: "Team K", value: fmtNumber(getNumber(game, "teamStrikeouts")) },
      { label: "Team K/Inning", value: fmtFixed(getNumber(game, "teamStrikeouts") == null ? null : (getNumber(game, "teamStrikeouts") ?? 0) / 9, 2) },
    ],
  }));

  const opponentAvg: ReactNode[][] = [[
    "AVG",
    formatGamesUsedLabel(opponentSummary),
    "",
    formatAverageIp(opponentSummary, "totalOpposingStarterOuts"),
    fmtFixed(getNumber(opponentSummary, "averageOpposingStarterStrikeouts")),
    fmtFixed(averageFromRecords(opponentSource, "opposingStarterSeasonKPerGame")),
    fmtFixed(averageFromRecords(opponentSource, "opposingStarterLastFiveKPerGamePrior")),
    fmtFixed(getNumber(opponentSummary, "averageTeamStrikeouts")),
    fmtFixed(getNumber(opponentSummary, "teamStrikeoutsPerInning") ?? (getNumber(opponentSummary, "averageTeamStrikeouts") == null ? null : (getNumber(opponentSummary, "averageTeamStrikeouts") ?? 0) / 9), 2),
  ]];

  const recentPerformance = (
    <MiniTable
      title={`${detail.pitcher} — Last 5 Starts`}
      columns={startColumns}
      columnAlignments={["left", "left", "center", "center", "center", "center", "center", "center", "center", "center"]}
      rows={startRows}
      footRows={startAvg}
      mobileCollapsibleRows={startCollapsibleRows}
      emptyMessage="No recent starts available."
    />
  );
  const homeAwaySplits = detail.pitcherVenueSplits ? (
    <div>
      <MiniTable
        title={`${detail.pitcher} — Home/Away Splits`}
        columns={["Site", "IP", "K/Inning", "K/Inning +/-", "K/Game", "Hit Avg +/-", "IP", "K/Inning", "K/Inning +/-", "K/Game", "Hit Avg +/-"]}
        columnWidths={["8%", "13%", "8%", "10%", "7%", "8%", "13%", "8%", "10%", "7%", "8%"]}
        headerGroups={[{ label: "Season", span: 5 }, { label: "Last 5 at Site", span: 5 }]}
        leadingUngroupedColumns={1}
        columnAlignments={["left", "center", "center", "center", "center", "center", "center", "center", "center", "center", "center"]}
        centerHeaderGroups
        mobileLabels={["Site", "Season IP", "Season K/Inning", "Season K/Inning +/-", "Season K/Game", "Season Hit Avg +/-", "Last 5 IP", "Last 5 K/Inning", "Last 5 K/Inning +/-", "Last 5 K/Game", "Last 5 Hit Avg +/-"]}
        rows={pitcherVenueRows}
        rowClassNames={pitcherVenueRowClasses}
        boldRows={pitcherVenueBoldRows}
        emptyMessage="No venue splits available."
      />
      {hasShortVenueSample && <p className="mt-1 px-1 text-[9px] font-semibold text-amber-700">* fewer than 5 starts available</p>}
    </div>
  ) : <p className="rounded-lg border border-dashed border-slate-200 bg-white p-3 text-xs text-slate-500">No venue splits available.</p>;
  const opponentLastTen = (
    <MiniTable
      title={`${detail.opponent} — Last 10 Games vs SP`}
      columns={["Date", "Opp", "Opposing SP", "SP IP", "SP K", "SP K Per Game SZN", "SP K Avg Per Game L5 Prior", "Team K", "Team K/Inning"]}
      columnWidths={["11%", "9%", "24%", "10%", "8%", "10%", "10%", "8%", "10%"]}
      columnAlignments={["left", "left", "left", "center", "center", "center", "center", "center", "center"]}
      rows={opponentRows}
      footRows={opponentAvg}
      mobileCollapsibleRows={opponentCollapsibleRows}
      emptyMessage="No recent games available."
    />
  );
  const opponentDataSources = detail.opponentContext ? (
    <div data-testid="opponent-context-source-details" className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] text-slate-600">
      <div className="grid gap-1 sm:grid-cols-2">
        <div><span className="font-black text-slate-500">K/Game:</span> {detail.opponentContext.sources?.strikeouts ?? DASH}</div>
        <div><span className="font-black text-slate-500">xBA:</span> {detail.opponentContext.sources?.xba ?? DASH}</div>
      </div>
      {detail.opponentContext.samples && Object.keys(detail.opponentContext.samples).length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-slate-500">
          {Object.entries(detail.opponentContext.samples).map(([label, value]) => <span key={label}>{label}: <strong>{value}</strong></span>)}
        </div>
      )}
      {detail.opponentContext.warnings && detail.opponentContext.warnings.length > 0 && (
        <ul className="mt-1 list-disc pl-4 font-semibold text-amber-700">
          {detail.opponentContext.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      )}
    </div>
  ) : <p className="rounded-lg border border-dashed border-slate-200 bg-white p-3 text-xs text-slate-500">No opponent source diagnostics available.</p>;

  if (compactLayout) {
    return (
      <div data-testid="strikeout-prop-detail" data-layout="compact" className="min-w-0 space-y-2">
        <MlbStrikeoutCompactAccordion id="strikeout-recent-performance" title="Recent Performance" tone="sky">
          {recentPerformance}
        </MlbStrikeoutCompactAccordion>
        <MlbStrikeoutCompactAccordion id="strikeout-home-away-splits" title="Home / Away Splits" tone="amber">
          {homeAwaySplits}
        </MlbStrikeoutCompactAccordion>
        <MlbStrikeoutCompactAccordion id="strikeout-opponent-last-ten" title="Opponent Last 10 Games vs SP" tone="violet">
          {opponentLastTen}
        </MlbStrikeoutCompactAccordion>
        <MlbStrikeoutCompactAccordion id="strikeout-opponent-data-sources" title="Opponent Data Sources" tone="slate">
          {opponentDataSources}
        </MlbStrikeoutCompactAccordion>
        {showV2Shadow && shadowRow && (
          <MlbStrikeoutCompactAccordion id="strikeout-model-debug" title="Model Debug" tone="slate">
            <div data-testid="strikeout-v2-debug-panels" className="grid min-w-0 gap-2">
              <ProjectionComparison detail={detail} shadowRow={shadowRow} row={row} />
              <ModelBreakdown shadowRow={shadowRow} />
              <SplitAvailabilityPanel shadowRow={shadowRow} />
              <SourceIntegrityPanel artifact={shadowArtifact} publicSlateDate={publicSlateDate} />
            </div>
          </MlbStrikeoutCompactAccordion>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="strikeout-prop-detail"
      className="min-w-0 space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5"
    >
      <section>
        <h3 className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-500">Recent Performance</h3>
        <div className="grid min-w-0 gap-2 lg:grid-cols-[3fr_2fr]">
          <div className="grid min-w-0 gap-2">
            {recentPerformance}
            {detail.pitcherVenueSplits && homeAwaySplits}
          </div>
          {opponentLastTen}
        </div>
      </section>
      {detail.opponentContext && (
        <details data-testid="opponent-context-source-details" className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-slate-600">
          <summary className="cursor-pointer font-black uppercase tracking-wide text-slate-500">Opponent data sources</summary>
          <div className="mt-1.5 grid gap-1 sm:grid-cols-2">
            <div><span className="font-black text-slate-500">K/Game:</span> {detail.opponentContext.sources?.strikeouts ?? DASH}</div>
            <div><span className="font-black text-slate-500">xBA:</span> {detail.opponentContext.sources?.xba ?? DASH}</div>
          </div>
          {detail.opponentContext.samples && Object.keys(detail.opponentContext.samples).length > 0 && (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-slate-500">
              {Object.entries(detail.opponentContext.samples).map(([label, value]) => <span key={label}>{label}: <strong>{value}</strong></span>)}
            </div>
          )}
          {detail.opponentContext.warnings && detail.opponentContext.warnings.length > 0 && (
            <ul className="mt-1 list-disc pl-4 font-semibold text-amber-700">
              {detail.opponentContext.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          )}
        </details>
      )}
      {showV2Shadow && shadowRow && (
        <div data-testid="strikeout-v2-debug-panels" className="grid min-w-0 gap-2">
          <ProjectionComparison detail={detail} shadowRow={shadowRow} row={row} />
          <ModelBreakdown shadowRow={shadowRow} />
          <SplitAvailabilityPanel shadowRow={shadowRow} />
          <SourceIntegrityPanel artifact={shadowArtifact} publicSlateDate={publicSlateDate} />
        </div>
      )}
    </div>
  );
}
