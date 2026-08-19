import { useState } from "react";
import MatchupCollapsibleGroup from "@/components/nfl/matchups/MatchupCollapsibleGroup";
import { formatPoints, projectionBreakdown, type GameProjection } from "@/lib/nfl/projectionData";
import type { NflMatchup } from "@/lib/nfl/matchups";

const NA = "N/A";

function ovr(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return NA;
  return value.toFixed(1);
}

/** One side's Current OVR + Power Number, read from the flat projection fields. */
type ProjectionTeamSide = { currentOVR: number; powerNumber: number };

function sideOf(projection: GameProjection, which: "home" | "away"): ProjectionTeamSide {
  return which === "home"
    ? { currentOVR: projection.homeCurrentOVR, powerNumber: projection.homePowerNumber }
    : { currentOVR: projection.awayCurrentOVR, powerNumber: projection.awayPowerNumber };
}

/**
 * Artifact timestamps are read from metadata and never hardcoded. An
 * unparseable or absent value returns null so the caller can omit the row
 * rather than print a placeholder that looks like a real generation time.
 */
function formatTimestamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  });
}

const TEAM_COMPONENT_ROWS: {
  key: keyof ProjectionTeamSide;
  label: string;
  format: (side: ProjectionTeamSide) => string;
}[] = [
  { key: "currentOVR", label: "Current OVR", format: (side) => ovr(side.currentOVR) },
  { key: "powerNumber", label: "Power Number", format: (side) => formatPoints(side.powerNumber) },
];

/** Verified sources only. TeamRankings appears nowhere — it is not a source. */
const PROVENANCE_ROWS: { term: string; source: string }[] = [
  { term: "Conventional metrics", source: "nflverse team-week" },
  { term: "EPA", source: "nflfastR play-by-play" },
  { term: "Success rate", source: "RBSDM" },
  { term: "Line-of-scrimmage win rates", source: "ESPN Analytics / NFL Next Gen Stats" },
  { term: "Injuries & snaps", source: "nflverse; snap counts via Pro-Football-Reference" },
  { term: "Market lines", source: "nflverse / nfldata" },
];

/**
 * Model Details.
 *
 * Everything here is what the model actually computes. There is no weighted
 * five-factor breakdown, no confidence meter, no situational weighting and no
 * weather or special-teams adjustment, because none of those exist in the
 * model. Limitations are limited to the ones the repository verifies.
 *
 * Model version and artifact generation time are read from live metadata. When
 * either is absent the row is omitted rather than filled with a placeholder.
 */
export default function MatchupModelDetails({
  matchup,
  projection,
  modelVersion,
  generatedAt,
  loading,
  error,
}: {
  matchup: NflMatchup;
  projection: GameProjection | null;
  modelVersion: string | null;
  generatedAt: string | null;
  loading: boolean;
  error: string | null;
}) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const breakdown = projectionBreakdown(projection);
  const generatedLabel = formatTimestamp(generatedAt);

  const toggle = (id: string) => setOpenGroup((current) => (current === id ? null : id));

  return (
    <div className="space-y-3">
      <div className="@container">
        <div className="grid grid-cols-1 items-start gap-3 @[960px]:grid-cols-[minmax(420px,44%)_minmax(460px,56%)]">
          <section
            aria-labelledby="projection-breakdown-heading"
            className="rounded-lg border border-slate-200 bg-white"
          >
            <div className="border-b border-slate-100 px-3 py-2.5 sm:px-4">
              <h2 id="projection-breakdown-heading" className="text-sm font-semibold text-slate-900">
                Projection Breakdown
              </h2>
              <p className="mt-0.5 text-[11px] leading-4 text-slate-600">
                The terms the model computes, in the order they are applied.
              </p>
            </div>

            <div className="px-3 py-3 sm:px-4">
              {loading ? (
                <p className="text-[12px] font-semibold text-slate-600">
                  Loading the JKB projected spread…
                </p>
              ) : !projection ? (
                <div>
                  <p className="rounded border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[12px] font-semibold text-slate-600">
                    {error
                      ? "The projection artifact could not be loaded for this matchup."
                      : "Model projection not available for this matchup."}
                  </p>
                  <p className="mt-2 text-[11px] leading-4 text-slate-600">
                    No spread has been estimated to fill the gap.
                  </p>
                </div>
              ) : (
                <dl className="divide-y divide-slate-100">
                  {breakdown.map((row) => (
                    <div key={row.label} className="py-2 first:pt-0 last:pb-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-[12px] font-semibold text-slate-800">{row.label}</dt>
                        <dd className="shrink-0 text-[14px] font-bold tabular-nums text-slate-900">
                          {row.value}
                        </dd>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-4 text-slate-600">{row.detail}</p>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </section>

          {projection && (
            <section
              aria-labelledby="team-components-heading"
              className="rounded-lg border border-slate-200 bg-white"
            >
              <div className="border-b border-slate-100 px-3 py-2.5 sm:px-4">
                <h2 id="team-components-heading" className="text-sm font-semibold text-slate-900">
                  Team Components
                </h2>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-600">
                  Current OVR and Power Number behind each side&apos;s projection.
                </p>
              </div>

              <div className="px-3 py-3 sm:px-4">
                <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center gap-2 border-b border-slate-200 pb-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-600">
                  <span>Component</span>
                  <span className="text-right">{matchup.away.abbr.toUpperCase()}</span>
                  <span className="text-right">{matchup.home.abbr.toUpperCase()}</span>
                </div>
                {TEAM_COMPONENT_ROWS.map((row) => (
                  <div
                    key={String(row.key)}
                    className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center gap-2 border-b border-slate-100 py-1.5 last:border-0"
                  >
                    <span className="text-[11px] font-semibold text-slate-700">{row.label}</span>
                    <span className="text-right text-[12px] font-bold tabular-nums text-slate-900">
                      {row.format(sideOf(projection, "away"))}
                    </span>
                    <span className="text-right text-[12px] font-bold tabular-nums text-slate-900">
                      {row.format(sideOf(projection, "home"))}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <section
        aria-labelledby="model-reference-heading"
        className="rounded-lg border border-slate-200 bg-white"
      >
        <h2 id="model-reference-heading" className="sr-only">
          Model provenance, methodology and limitations
        </h2>

        <MatchupCollapsibleGroup
          id="model-provenance"
          triggerId="model-provenance-trigger"
          title="Data provenance"
          meta="Sources and generation"
          open={openGroup === "provenance"}
          onToggle={() => toggle("provenance")}
        >
          <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[12px]">
            {PROVENANCE_ROWS.map((row) => (
              <div key={row.term} className="contents">
                <dt className="text-slate-600">{row.term}</dt>
                <dd className="m-0 font-semibold text-slate-800">{row.source}</dd>
              </div>
            ))}
            {modelVersion && (
              <div className="contents">
                <dt className="text-slate-600">Model version</dt>
                <dd className="m-0 font-semibold tabular-nums text-slate-800">{modelVersion}</dd>
              </div>
            )}
            {generatedLabel && (
              <div className="contents">
                <dt className="text-slate-600">Artifact generated</dt>
                <dd className="m-0 font-semibold tabular-nums text-slate-800">{generatedLabel}</dd>
              </div>
            )}
          </dl>
        </MatchupCollapsibleGroup>

        <MatchupCollapsibleGroup
          id="model-methodology"
          triggerId="model-methodology-trigger"
          title="Methodology"
          meta="How the projection is built"
          open={openGroup === "methodology"}
          onToggle={() => toggle("methodology")}
        >
          <div className="space-y-2 text-[12px] leading-5 text-slate-600">
            <p>
              Each team&apos;s Power Number is how many points better or worse it is than the current
              league-average NFL team on a neutral field: (Current OVR − league-average Current OVR) ×
              0.24. Current OVR is the exact same universal 1–99 rating shown everywhere else on the
              site — no separate rating exists for this projection.
            </p>
            <p>
              The projected margin is the two teams&apos; Power Numbers subtracted, plus a fixed
              2.0-point home-field adjustment (0 at a neutral site). The home-field value and the 0.24
              conversion are never fitted to this matchup&apos;s data — both come from a walk-forward
              backtest run once, in advance.
            </p>
            <p>
              No sportsbook line, moneyline, total or ATS record takes part in Current OVR, the Power
              Number or the projected margin. The market appears only in the consumer layer, beside the
              finished projection, as a comparison.
            </p>
            <p className="rounded border border-slate-200 bg-slate-50 px-2.5 py-2">
              Current OVR — and therefore every Power Number and every projected spread — updates
              automatically as each team&apos;s season progresses (100% preseason at 0 games played,
              phasing to 100% current-season performance by game 6). Nothing here has a separate
              preseason model.
            </p>
          </div>
        </MatchupCollapsibleGroup>

        <MatchupCollapsibleGroup
          id="model-limitations"
          triggerId="model-limitations-trigger"
          title="Known limitations"
          meta="What the model does not do"
          open={openGroup === "limitations"}
          onToggle={() => toggle("limitations")}
        >
          <ul className="space-y-2 text-[12px] leading-5 text-slate-600">
            <li className="border-l-2 border-slate-200 pl-2.5">
              Backtesting has not shown this model beating the market. The market figure is a
              comparison only, and the difference is described as a gap — never as an edge.
            </li>
            <li className="border-l-2 border-slate-200 pl-2.5">
              No win probability, confidence rating, expected value, stake size or pick is produced
              anywhere.
            </li>
            <li className="border-l-2 border-slate-200 pl-2.5">
              Injuries do not adjust the projection. Availability is presented separately for the
              reader to weigh.
            </li>
            <li className="border-l-2 border-slate-200 pl-2.5">
              No home/away splits and no week-indexed trend series exist in the underlying data, so
              none are shown.
            </li>
            <li className="border-l-2 border-slate-200 pl-2.5">
              First downs, third down and time of possession are not published for this sample and
              stay unavailable. They are never estimated.
            </li>
          </ul>
        </MatchupCollapsibleGroup>
      </section>
    </div>
  );
}
