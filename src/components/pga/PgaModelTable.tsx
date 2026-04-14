import { Link } from "react-router-dom";
import PgaModelMobileCard from "@/components/pga/PgaModelMobileCard";
import PgaModelTableHeader from "@/components/pga/PgaModelTableHeader";
import PgaModelTableRow from "@/components/pga/PgaModelTableRow";
import type { PlayerModelRow } from "@/lib/pga/pgaTypes";

type Props = {
  rows: PlayerModelRow[];
  tableLink?: {
    href: string;
    label: string;
  };
};

export default function PgaModelTable({ rows, tableLink }: Props) {
  const rankValues = rows.flatMap((row) => [
    row.trendRank,
    row.sgApproachRank,
    row.par4Rank,
    row.drivingAccuracyRank,
    row.bogeyAvoidanceRank,
    row.sgAroundGreenRank,
    row.birdie125150Rank,
    row.sgPuttingRank,
    row.birdieUnder125Rank,
  ]).filter((value): value is number => typeof value === "number");

  const maxRank = rankValues.length > 0 ? Math.max(...rankValues) : rows.length;

  return (
    <section className="rounded-[30px] bg-card p-4 shadow-[0_18px_40px_hsl(var(--foreground)/0.05)]">
      <div className="flex items-center justify-between gap-3 px-2">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-foreground">Full Model Table</h2>
          <p className="mt-1 text-sm text-muted-foreground">Score sorts the field and rank columns use a soft green-to-red heatmap.</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">{rows.length} golfers</p>
          {tableLink ? (
            <Link
              to={tableLink.href}
              className="inline-flex items-center rounded-full bg-secondary px-4 py-2 text-sm font-medium text-foreground transition hover:bg-accent"
            >
              {tableLink.label}
            </Link>
          ) : null}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-5 rounded-[24px] bg-secondary/55 px-5 py-10 text-center">
          <p className="text-base font-medium text-foreground">No player rows are available.</p>
          <p className="mt-2 text-sm text-muted-foreground">Check the tournament data source or reload the page once `rbc_data.json` is available.</p>
        </div>
      ) : null}

      <div className="mt-5 space-y-3 md:hidden" hidden={rows.length === 0}>
        {rows.map((row) => (
          <PgaModelMobileCard key={row.id} player={row} maxRank={maxRank} />
        ))}
      </div>

      <div className="mt-5 hidden md:block" hidden={rows.length === 0}>
        <div className="overflow-x-auto pb-1">
          <div className="min-w-[1700px] space-y-2">
            <PgaModelTableHeader />
            {rows.map((row) => (
              <PgaModelTableRow key={row.id} player={row} maxRank={maxRank} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
