import { useNflBettingLines } from "@/hooks/useNflBettingLines";
import MatchupBettingSparkline from "@/components/nfl/matchups/MatchupBettingSparkline";
import {
  currentMoneylineLabel,
  currentSpreadLabel,
  freshnessLabel,
  freshnessToneClass,
  modelVsMarketLabel,
  spreadMovementRow,
  totalMovementRow,
  type MovementRowView,
} from "@/components/nfl/matchups/bettingLinesPresentation";
import { formatTotal } from "@/lib/nfl/marketData";
import type { NflMatchup } from "@/lib/nfl/matchups";
import {
  formatProjectedSpread,
  type GameProjection,
} from "@/lib/nfl/projectionData";
import type {
  CurrentMarketView,
  LineMovementView,
} from "@/lib/nfl/bettingLinesView";

/**
 * Betting Market Context — the sportsbook-specific view for one matchup.
 *
 * Its data comes entirely from the The Odds API pipeline via
 * {@link useNflBettingLines}: one designated sportsbook per game, shown exactly
 * as that book posts it. This is a different dataset from the nflverse market
 * profile rendered directly below it in the Comparison tab — the historical ATS
 * profile there did not produce this line, and this line never grades it.
 *
 * Three blocks, each degrading on its own:
 *  1. Current Market — this book's spread, total, moneyline + the JKB gap
 *  2. Line Movement  — first-observed vs current for spread and total
 *  3. Betting Splits — a reserved placeholder; no production source is qualified
 */
export default function MatchupMarketContext({
  matchup,
  projection,
}: {
  matchup: NflMatchup;
  projection: GameProjection | null;
}) {
  const { loading, error, current, movement } = useNflBettingLines(matchup.gameId);

  return (
    <section
      aria-label="Betting market context"
      className="overflow-hidden rounded-lg border border-slate-200 bg-white"
    >
      <div className="border-b border-slate-200 bg-slate-100 px-3 py-2">
        <h3 className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-800">
          Betting Market Context
        </h3>
        <p className="mt-0.5 text-[10px] leading-4 text-slate-600">
          The Odds API · one designated sportsbook per game, shown as that book
          posts it. A separate dataset from the nflverse market profile below.
        </p>
      </div>

      {loading && (
        <p className="px-3 py-3 text-[11px] font-semibold text-slate-600">
          Loading sportsbook lines…
        </p>
      )}

      {!loading && error && (
        <p className="px-3 py-3 text-[11px] font-semibold text-slate-600">
          Sportsbook lines are unavailable right now.
        </p>
      )}

      {!loading && !error && !current && (
        <p className="px-3 py-3 text-[11px] font-semibold text-slate-600">
          No sportsbook line has been published for this game yet.
        </p>
      )}

      {!loading && !error && current && (
        <>
          <CurrentMarketBlock
            current={current}
            projection={projection}
            homeAbbr={matchup.home.abbr}
            awayAbbr={matchup.away.abbr}
          />
          <LineMovementBlock movement={movement} homeAbbr={matchup.home.abbr} />
        </>
      )}

      <BettingSplitsPlaceholder
        current={current}
        homeAbbr={matchup.home.abbr}
      />
    </section>
  );
}

function CurrentMarketBlock({
  current,
  projection,
  homeAbbr,
  awayAbbr,
}: {
  current: CurrentMarketView;
  projection: GameProjection | null;
  homeAbbr: string;
  awayAbbr: string;
}) {
  const rows: { label: string; value: string; model?: boolean }[] = [
    { label: "Spread", value: currentSpreadLabel(current.spread, homeAbbr) },
    { label: "Total", value: formatTotal(current.total?.line) },
    {
      label: "Moneyline",
      value: currentMoneylineLabel(current.moneyline, homeAbbr, awayAbbr),
    },
    {
      label: "JKB Spread",
      value: formatProjectedSpread(projection),
      model: true,
    },
    {
      label: "Diff",
      value: modelVsMarketLabel(projection, current.spread, homeAbbr, awayAbbr),
      model: true,
    },
  ];

  return (
    <div className="border-b border-slate-200 px-3 py-2.5">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-700">
          Current Market — {current.sportsbook.name}
        </h4>
        <span
          className={`text-[10px] font-semibold uppercase tracking-wide ${freshnessToneClass(current.freshness)}`}
        >
          {freshnessLabel(current.freshness)}
        </span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="self-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {row.label}
            </dt>
            <dd
              className={`text-[13px] font-bold tabular-nums ${
                row.value === "N/A"
                  ? "text-slate-500"
                  : row.model
                    ? "text-emerald-700"
                    : "text-slate-900"
              }`}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function LineMovementBlock({
  movement,
  homeAbbr,
}: {
  movement: LineMovementView | null;
  homeAbbr: string;
}) {
  const spreadRow = spreadMovementRow(movement?.spread ?? null, homeAbbr);
  const totalRow = totalMovementRow(movement?.total ?? null);

  return (
    <div className="border-b border-slate-200 px-3 py-2.5">
      <div className="mb-1.5 flex items-baseline justify-between gap-x-3">
        <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-700">
          Line Movement
        </h4>
        {movement && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {movement.sportsbook.name}
          </span>
        )}
      </div>

      {!spreadRow && !totalRow ? (
        <p className="text-[11px] font-semibold text-slate-600">
          Line movement history is not available yet.
        </p>
      ) : (
        <div role="table" className="text-[11px]">
          <div
            role="row"
            className="grid grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))_auto] items-center gap-x-2 border-b border-slate-200 pb-1 text-[9px] font-bold uppercase tracking-wide text-slate-500"
          >
            <span role="columnheader">Market</span>
            <span role="columnheader">First Obs.</span>
            <span role="columnheader">Current</span>
            <span role="columnheader">Move</span>
            <span role="columnheader">Trend</span>
          </div>
          <MovementRow row={spreadRow} degradedLabel={`${homeAbbr.toUpperCase()} Spread`} />
          <MovementRow row={totalRow} degradedLabel="Game Total" />
        </div>
      )}
    </div>
  );
}

function MovementRow({
  row,
  degradedLabel,
}: {
  row: MovementRowView | null;
  degradedLabel: string;
}) {
  if (!row) {
    return (
      <div
        role="row"
        className="grid grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))_auto] items-center gap-x-2 border-b border-slate-100 py-1 last:border-b-0"
      >
        <span role="cell" className="font-bold text-slate-700">
          {degradedLabel}
        </span>
        <span role="cell" className="col-span-4 text-[10px] font-medium text-slate-500">
          Not enough history observed yet.
        </span>
      </div>
    );
  }

  return (
    <div
      role="row"
      className="grid grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))_auto] items-center gap-x-2 border-b border-slate-100 py-1 tabular-nums last:border-b-0"
    >
      <span role="cell" className="font-bold text-slate-700">
        {row.market}
      </span>
      <span role="cell" className="text-slate-600">
        {row.firstObserved}
      </span>
      <span role="cell" className="font-bold text-slate-900">
        {row.current}
      </span>
      <span role="cell" className="font-semibold text-slate-700">
        {row.move}
      </span>
      <span role="cell">
        <MatchupBettingSparkline values={row.values} label={row.market} />
      </span>
    </div>
  );
}

/**
 * Reserved. The production betting-splits source is not qualified, so this
 * block reads no split artifact and shows no percentage — only that a source is
 * still being brought online.
 */
function BettingSplitsPlaceholder({
  current,
  homeAbbr,
}: {
  current: CurrentMarketView | null;
  homeAbbr: string;
}) {
  const spreadLabel =
    current && current.spread?.homeLine != null
      ? currentSpreadLabel(current.spread, homeAbbr)
      : "Spread";
  const totalLabel =
    current && current.total?.line != null
      ? `Over ${formatTotal(current.total.line)}`
      : "Total";

  const markets = [spreadLabel, totalLabel];

  return (
    <div className="px-3 py-2.5">
      <div className="mb-1 flex items-baseline justify-between gap-x-3">
        <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-700">
          Betting Splits
        </h4>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">
          Awaiting production source
        </span>
      </div>
      <p className="mb-1.5 text-[10px] leading-4 text-slate-600">
        Production source not yet qualified. No bet or money percentages are
        shown until one is.
      </p>
      <div role="table" className="text-[11px]">
        <div
          role="row"
          className="grid grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] items-center gap-x-2 border-b border-slate-200 pb-1 text-[9px] font-bold uppercase tracking-wide text-slate-500"
        >
          <span role="columnheader">Market</span>
          <span role="columnheader">Bet %</span>
          <span role="columnheader">Money %</span>
          <span role="columnheader">Signal</span>
        </div>
        {markets.map((market) => (
          <div
            key={market}
            role="row"
            className="grid grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] items-center gap-x-2 border-b border-slate-100 py-1 last:border-b-0"
          >
            <span role="cell" className="font-bold text-slate-700">
              {market}
            </span>
            <span role="cell" className="text-slate-400">
              —
            </span>
            <span role="cell" className="text-slate-400">
              —
            </span>
            <span role="cell" className="text-[10px] font-medium text-slate-500">
              Awaiting source
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
