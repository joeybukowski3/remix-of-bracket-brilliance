import { TeamLogoBadge, getWindArrow, type ParkSidebarRow } from "@/pages/MlbHrProps";
import { cn } from "@/lib/utils";

const DASH = "—";

/** Consolidates the identical roof-label mapping previously duplicated on HR Props, Strikeout Props, and Batter vs Pitcher. */
function getRoofLabel(roofType: string) {
  if (/open/i.test(roofType)) return "Open";
  if (/retractable/i.test(roofType)) return "Retractable";
  if (/dome|closed/i.test(roofType)) return "Roof";
  return roofType || "Unknown";
}

/** Hitter perspective: a high park factor (HR/offense-friendly) is favorable, so it reads green; a low one reads blue. Verbatim port of HR Props'/Batter vs Pitcher's prior getParkFactorTone. */
function getHitterParkTone(value: number) {
  if (value >= 1.10) return "bg-green-500 text-white";
  if (value >= 1.04) return "bg-green-200 text-green-900";
  if (value <= 0.93) return "bg-blue-500 text-white";
  if (value <= 0.97) return "bg-blue-200 text-blue-900";
  return "bg-slate-200 text-slate-700";
}

/** Pitcher perspective: a low park factor suppresses offense (favorable for strikeouts), so it reads green; a high one reads red. Verbatim port of Strikeout Props' prior getKParkTone. */
function getPitcherParkTone(value: number) {
  if (value <= 0.93) return "bg-green-500 text-white";
  if (value <= 0.97) return "bg-green-200 text-green-900";
  if (value >= 1.10) return "bg-red-500 text-white";
  if (value >= 1.04) return "bg-red-200 text-red-900";
  return "bg-slate-200 text-slate-700";
}

function getHrPerGameTone(value: number) {
  if (value >= 2.7) return "bg-red-100 text-red-700";
  if (value >= 2.3) return "bg-orange-100 text-orange-700";
  if (value >= 2.0) return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function ParkCard({
  park,
  toneClass,
  showHrPerGame,
  showPrecipitation,
}: {
  park: ParkSidebarRow;
  toneClass: string;
  showHrPerGame: boolean;
  showPrecipitation: boolean;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <TeamLogoBadge team={park.awayTeam} size={16} showLabel={false} />
          <span className="text-[9px] font-bold text-slate-300">@</span>
          <TeamLogoBadge team={park.homeTeam} size={16} showLabel={false} />
          <span className="ml-1 truncate text-[10px] font-semibold text-slate-700">{park.stadium}</span>
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", toneClass)}>
          {park.parkFactor.toFixed(2)}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">{getRoofLabel(park.roofType)}</span>
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">{park.temperature != null ? `${park.temperature.toFixed(0)}°` : DASH}</span>
        {showPrecipitation && (
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">Precip {park.precipitation != null ? `${park.precipitation.toFixed(0)}%` : DASH}</span>
        )}
        {park.windSpeed != null && park.windSpeed >= 10 && (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">💨 {park.windSpeed.toFixed(0)} {getWindArrow(park.windDirection)}</span>
        )}
        {showHrPerGame && park.hrPerGame != null && (
          <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-bold", getHrPerGameTone(park.hrPerGame))}>⚾ {park.hrPerGame.toFixed(2)} HR/G</span>
        )}
      </div>
    </article>
  );
}

export interface MlbParkFactorsStripProps {
  parks: ParkSidebarRow[];
  /** Which side the park-factor color scale favors: high-and-green for hitters, low-and-green for pitchers/strikeouts. */
  perspective: "hitter" | "pitcher";
  /** Shown under the "Park Factors" heading, e.g. "Hitter-friendly order" / "Pitcher-friendly order". */
  subtitle: string;
  /** HR/game is an offense-specific stat; omit it entirely on pitcher-perspective pages that never showed it. */
  showHrPerGame?: boolean;
  /** Matches each page's prior sidebar exactly -- HR Props and Batter vs Pitcher showed precipitation, Strikeout Props did not. */
  showPrecipitation?: boolean;
  className?: string;
}

/**
 * Compact, full-width, wrapping Park Factors presentation shared by HR
 * Props, Strikeout Props, and Batter vs Pitcher -- replaces the fixed-width
 * left sidebar each page used to reserve. Presentation-only: renders
 * whatever `parks` array (already built by buildParkSidebarRows and
 * already sorted by the caller) it's given, in that exact order.
 */
export function MlbParkFactorsStrip({
  parks,
  perspective,
  subtitle,
  showHrPerGame = perspective === "hitter",
  showPrecipitation = true,
  className,
}: MlbParkFactorsStripProps) {
  const toneClass = perspective === "hitter" ? getHitterParkTone : getPitcherParkTone;

  return (
    <section className={cn("rounded-2xl border border-slate-200 bg-white p-3 shadow-sm", className)}>
      {/* Mobile: collapsed by default to avoid a long block before the table. jsdom doesn't evaluate media queries, so both this and the sm:+ block below render in tests -- same pattern already used for this codebase's desktop-table/mobile-card pairs. */}
      <details className="group sm:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
          <div>
            <div className="border-l-2 border-sky-500 pl-2 text-sm font-semibold uppercase tracking-[0.14em] text-sky-900">🏟️ Park Factors</div>
            <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
          </div>
          <span className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{parks.length} parks</span>
            <span aria-hidden="true" className="text-slate-400 transition group-open:rotate-180">⌄</span>
          </span>
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-2">
          {parks.map((park) => (
            <ParkCard key={`mobile-${park.key}`} park={park} toneClass={toneClass(park.parkFactor)} showHrPerGame={showHrPerGame} showPrecipitation={showPrecipitation} />
          ))}
        </div>
      </details>

      <div className="hidden sm:block">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="border-l-2 border-sky-500 pl-2 text-sm font-semibold uppercase tracking-[0.14em] text-sky-900">🏟️ Park Factors</div>
            <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{parks.length} parks</span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {parks.map((park) => (
            <ParkCard key={park.key} park={park} toneClass={toneClass(park.parkFactor)} showHrPerGame={showHrPerGame} showPrecipitation={showPrecipitation} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default MlbParkFactorsStrip;
