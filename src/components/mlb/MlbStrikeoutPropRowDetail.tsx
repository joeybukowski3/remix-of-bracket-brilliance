import type { ReactNode } from "react";
import type { PitcherVenueSplit, StrikeoutPropDetail } from "@/hooks/useMlbStrikeoutPropDetails";
import type { KPropsV2ShadowArtifact, KPropsV2ShadowRow } from "@/hooks/useMlbKPropsV2Shadow";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import { outsToMlbInnings } from "@/lib/mlb/baseballInnings";
import { cn } from "@/lib/utils";

const DASH = "N/A";

function fmtText(value: string | null | undefined) {
  return value && value.trim() ? value : DASH;
}
function fmtNumber(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? DASH : String(value);
}
function fmtFixed(value: number | null | undefined, digits = 1) {
  return value == null || !Number.isFinite(value) ? DASH : value.toFixed(digits);
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

function MiniTable({
  title,
  columns,
  rows,
  emptyMessage,
  footRows = [],
}: {
  title: string;
  columns: string[];
  rows: ReactNode[][];
  emptyMessage: string;
  footRows?: ReactNode[][];
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500">
        {title}
      </div>
      <div className="hidden sm:block">
        <table className="w-full table-fixed text-[11px]">
          <thead>
            <tr className="text-[9px] uppercase tracking-wide text-slate-400">
              {columns.map((column) => (
                <th key={column} className="border-b border-slate-100 px-2 py-1 text-left font-bold">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row, index) => (
                <tr key={index} className={index % 2 === 0 ? "bg-white" : "bg-slate-50/70"}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="break-words border-b border-slate-50 px-2 py-1 text-slate-700">
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
                    <td key={cellIndex} className="break-words border-t border-slate-200 px-2 py-1.5">
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
        {rows.length ? rows.map((row, index) => (
          <div key={index} className="rounded-lg border border-slate-100 bg-white p-2">
            {columns.map((column, cellIndex) => (
              <div key={column} className="flex min-w-0 items-start justify-between gap-2 py-0.5 text-[11px]">
                <span className="shrink-0 font-black uppercase tracking-wide text-slate-400">{column}</span>
                <span className="min-w-0 text-right font-semibold text-slate-700">{row[cellIndex]}</span>
              </div>
            ))}
          </div>
        )) : (
          <div className="px-2 py-3 text-center text-xs text-slate-400">{emptyMessage}</div>
        )}
        {footRows.map((row, index) => (
          <div key={`foot-card-${index}`} data-testid="strikeout-recent-avg-row" className="rounded-lg border border-slate-200 bg-slate-100 p-2">
            {columns.map((column, cellIndex) => (
              <div key={column} className="flex min-w-0 items-start justify-between gap-2 py-0.5 text-[11px]">
                <span className="shrink-0 font-black uppercase tracking-wide text-slate-500">{cellIndex === 0 ? String(row[cellIndex]) : column}</span>
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

function formatVenueInnings(totals: PitcherVenueSplit["season"] | undefined) {
  if (!totals) return DASH;
  const innings = totals.totalOuts != null ? fmtOutsIp(totals.totalOuts) : fmtIp(totals.inningsPitched);
  if (innings === DASH) return DASH;
  return `${innings} (${totals.gamesUsed} ${totals.gamesUsed === 1 ? "start" : "starts"})`;
}

function pitcherVenueRow(split: PitcherVenueSplit, label: string): ReactNode[] {
  return [
    label,
    formatVenueInnings(split.season),
    fmtNumber(split.season.strikeouts),
    fmtNumber(split.season.hitsAllowed),
    formatVenueInnings(split.lastFiveAtSite),
    fmtNumber(split.lastFiveAtSite.strikeouts),
    fmtNumber(split.lastFiveAtSite.hitsAllowed),
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

function SummaryPills({ shadowRow }: { shadowRow: KPropsV2ShadowRow }) {
  const fallbackCount = shadowRow.v2.fallbacks.length;
  const warningCount = shadowRow.v2.warnings.length;
  return (
    <div className="flex flex-wrap gap-1.5 text-[10px] font-black uppercase tracking-wide">
      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600">Shadow</span>
      <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-800">Experimental</span>
      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600">{shadowRow.v2.confidence} confidence</span>
      {(fallbackCount > 0 || warningCount > 0) && (
        <span className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-amber-800">Incomplete inputs</span>
      )}
    </div>
  );
}

function ProjectionComparison({ detail, shadowRow }: { detail: StrikeoutPropDetail; shadowRow: KPropsV2ShadowRow }) {
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
        <SummaryPills shadowRow={shadowRow} />
        <span className="text-[10px] font-semibold text-slate-500">{detail.pitcher} vs {detail.opponent}</span>
      </div>
      <div className="overflow-hidden rounded-lg border border-sky-100 bg-white">
        <table className="w-full table-fixed text-[11px]">
          <thead><tr className="bg-sky-50 text-[9px] uppercase tracking-wide text-slate-500"><th className="px-2 py-1 text-left">Metric</th><th className="px-2 py-1 text-left">Legacy</th><th className="px-2 py-1 text-left">V2 Shadow</th></tr></thead>
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
      <p className="mt-2 text-[10px] font-semibold text-slate-500">V2 Shadow is experimental and not historically validated. This panel does not recommend replacing the production projection.</p>
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

export default function MlbStrikeoutPropRowDetail({ detail, shadowRow = null, shadowArtifact = null, showV2Shadow = false, publicSlateDate = null }: { detail: StrikeoutPropDetail; shadowRow?: KPropsV2ShadowRow | null; shadowArtifact?: KPropsV2ShadowArtifact | null; showV2Shadow?: boolean; publicSlateDate?: string | null }) {
  const detailsInput = getNestedRecord(shadowRow?.inputs ?? {}, ["details"]);
  const pitcherSummary = getNestedRecord(detailsInput ?? {}, ["pitcherLastFiveSummary"]);
  const opponentSummary = getNestedRecord(detailsInput ?? {}, ["opponentLastFiveVsStartersSummary"]);
  const pitcherSummaryRows = getArray(pitcherSummary, "rows").map((row) => getRecord(row)).filter((row): row is Record<string, unknown> => Boolean(row));
  const opponentSummaryRows = getArray(opponentSummary, "rows").map((row) => getRecord(row)).filter((row): row is Record<string, unknown> => Boolean(row));

  const fallbackStartRows: ReactNode[][] = (pitcherSummaryRows.length ? pitcherSummaryRows : detail.pitcherLastFiveStarts.map((start, index) => ({ index, date: start.date, opponent: start.opponent, inningsPitched: start.inningsPitched, strikeouts: start.strikeouts }))).map((start, index) => [
    fmtDate(start.date),
    <TeamCell key={`start-opp-${index}`} team={getString(start, "opponent")} />,
    getNumber(start, "outs") != null ? fmtOutsIp(getNumber(start, "outs")) : fmtIp(start.inningsPitched as number | string | null | undefined),
    fmtNumber(getNumber(start, "strikeouts")),
    fmtNumber(getNumber(start, "battersFaced")),
    fmtRate(getNumber(start, "battersFaced") != null && getNumber(start, "strikeouts") != null && (getNumber(start, "battersFaced") ?? 0) > 0 ? (getNumber(start, "strikeouts") ?? 0) / (getNumber(start, "battersFaced") ?? 1) : null),
    getNumber(start, "innings") != null && getNumber(start, "strikeouts") != null && (getNumber(start, "innings") ?? 0) > 0 ? fmtFixed(((getNumber(start, "strikeouts") ?? 0) * 9) / (getNumber(start, "innings") ?? 1)) : DASH,
    fmtNumber(getNumber(start, "pitchCount")),
  ]);

  const fallbackStartAvg: ReactNode[][] = [[
    "AVG",
    `${fmtNumber(getNumber(pitcherSummary, "gamesUsed"))} used`,
    formatAverageIp(pitcherSummary, "totalOuts"),
    fmtFixed(getNumber(pitcherSummary, "averageStrikeouts")),
    fmtFixed(getNumber(pitcherSummary, "averageBattersFaced")),
    fmtRate(getNumber(pitcherSummary, "recentKRate")),
    fmtFixed(getNumber(pitcherSummary, "recentK9")),
    fmtFixed(getNumber(pitcherSummary, "averagePitchCount")),
  ]];

  const enrichedStarts = detail.pitcherRecentStarts;
  const enrichedSummary = detail.pitcherLastFiveSummary;
  const hasEnrichedPitcherStarts = Array.isArray(enrichedStarts) && enrichedSummary != null;
  const enrichedStartRows: ReactNode[][] = (enrichedStarts ?? []).map((start, index) => {
    const hitsPerNine = start.outsRecorded != null && start.outsRecorded > 0 && start.hitsAllowed != null
      ? (start.hitsAllowed * 27) / start.outsRecorded
      : null;
    const strikeoutsPerNine = start.outsRecorded != null && start.outsRecorded > 0 && start.strikeouts != null
      ? (start.strikeouts * 27) / start.outsRecorded
      : null;
    return [
      fmtDate(start.date),
      <TeamCell key={`pitcher-start-opp-${index}`} team={start.opponentAbbr ?? start.opponent ?? null} />,
      start.outsRecorded != null ? fmtOutsIp(start.outsRecorded) : fmtIp(start.inningsPitched),
      fmtNumber(start.strikeouts),
      fmtFixed(hitsPerNine),
      fmtFixed(strikeoutsPerNine),
      fmtNumber(start.pitchCount),
    ];
  });
  const enrichedStartAvg: ReactNode[][] = enrichedSummary ? [[
    "AVG",
    `${fmtNumber(enrichedSummary.gamesUsed)} used`,
    enrichedSummary.averageInningsOuts != null ? fmtOutsIp(Math.round(enrichedSummary.averageInningsOuts)) : DASH,
    fmtFixed(enrichedSummary.averageStrikeouts),
    fmtFixed(enrichedSummary.hitsPerNine),
    fmtFixed(enrichedSummary.strikeoutsPerNine),
    fmtFixed(enrichedSummary.averagePitchCount),
  ]] : [];
  const startColumns = hasEnrichedPitcherStarts
    ? ["Date", "Opp", "IP", "K", "H/9", "K/9", "Pitch Count"]
    : ["Date", "Opp", "IP", "K", "BF", "K%", "K/9", "Pitch Count"];
  const startRows = hasEnrichedPitcherStarts ? enrichedStartRows : fallbackStartRows;
  const startAvg = hasEnrichedPitcherStarts ? enrichedStartAvg : fallbackStartAvg;
  const pitcherVenueRows = detail.pitcherVenueSplits
    ? [
      pitcherVenueRow(detail.pitcherVenueSplits.home, "Home"),
      pitcherVenueRow(detail.pitcherVenueSplits.away, "Away"),
    ]
    : [];

  const opponentRows: ReactNode[][] = (opponentSummaryRows.length ? opponentSummaryRows : detail.opponentLastFiveGames.map((game, index) => ({ index, date: game.date, opponent: game.opponent, opposingStartingPitcher: game.opposingStartingPitcher, opposingStarterInningsPitched: game.opposingStarterInningsPitched, opposingStarterStrikeouts: game.opposingStarterStrikeouts, teamStrikeouts: game.teamTotalStrikeouts }))).map((game, index) => [
    fmtDate(game.date),
    <TeamCell key={`vs-opp-${index}`} team={getString(game, "opponent")} />,
    fmtText(getString(game, "opposingStartingPitcher")),
    getNumber(game, "opposingStarterOuts") != null ? fmtOutsIp(getNumber(game, "opposingStarterOuts")) : fmtIp(game.opposingStarterInningsPitched as number | string | null | undefined),
    fmtNumber(getNumber(game, "opposingStarterStrikeouts")),
    fmtNumber(getNumber(game, "teamStrikeouts")),
    fmtNumber(getNumber(game, "plateAppearances")),
    fmtRate(getNumber(game, "plateAppearances") != null && getNumber(game, "teamStrikeouts") != null && (getNumber(game, "plateAppearances") ?? 0) > 0 ? (getNumber(game, "teamStrikeouts") ?? 0) / (getNumber(game, "plateAppearances") ?? 1) : null),
    fmtRate(getNumber(game, "whiffRate")),
  ]);

  const opponentAvg: ReactNode[][] = [[
    "AVG",
    `${fmtNumber(getNumber(opponentSummary, "gamesUsed"))} used`,
    DASH,
    formatAverageIp(opponentSummary, "totalOpposingStarterOuts"),
    fmtFixed(getNumber(opponentSummary, "averageOpposingStarterStrikeouts")),
    fmtFixed(getNumber(opponentSummary, "averageTeamStrikeouts")),
    DASH,
    fmtRate(getNumber(opponentSummary, "recentTeamKRate")),
    fmtRate(getNumber(opponentSummary, "recentWhiffRate")),
  ]];

  return (
    <div
      data-testid="strikeout-prop-detail"
      className="min-w-0 space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5"
    >
      <section>
        <h3 className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-500">Recent Performance</h3>
        <div className="grid min-w-0 gap-2 lg:grid-cols-2">
          <div className="grid min-w-0 gap-2">
            <MiniTable
              title={`${detail.pitcher} — Last 5 Starts`}
              columns={startColumns}
              rows={startRows}
              footRows={startAvg}
              emptyMessage="No recent starts available."
            />
            {detail.pitcherVenueSplits && (
              <MiniTable
                title={`${detail.pitcher} — Home/Away Splits`}
                columns={["Site", "IP / Season", "K", "Hits Allowed", "IP / Last 5", "K / Last 5", "Hits Allowed / Last 5"]}
                rows={pitcherVenueRows}
                emptyMessage="No venue splits available."
              />
            )}
          </div>
          <MiniTable
            title={`${detail.opponent} — last 5 games vs SP`}
            columns={["Date", "Opp", "Opposing SP", "SP IP", "SP K", "Team K", "Team PA", "Team K%", "Whiff%"]}
            rows={opponentRows}
            footRows={opponentAvg}
            emptyMessage="No recent games available."
          />
        </div>
      </section>
      {showV2Shadow && shadowRow && (
        <div data-testid="strikeout-v2-debug-panels" className="grid min-w-0 gap-2">
          <ProjectionComparison detail={detail} shadowRow={shadowRow} />
          <ModelBreakdown shadowRow={shadowRow} />
          <SplitAvailabilityPanel shadowRow={shadowRow} />
          <SourceIntegrityPanel artifact={shadowArtifact} publicSlateDate={publicSlateDate} />
        </div>
      )}
    </div>
  );
}
