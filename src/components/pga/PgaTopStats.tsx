import type { PgaTournamentMeta } from "@/lib/pga/pgaTypes";

function TopStatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[24px] bg-card px-4 py-4 shadow-[0_10px_24px_hsl(var(--foreground)/0.04)]">
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-[-0.03em] text-foreground">{value}</p>
    </div>
  );
}

export default function PgaTopStats({ meta }: { meta: PgaTournamentMeta }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <TopStatCard label="Field Avg" value={meta.fieldAverage} />
      <TopStatCard label="Cut Line" value={meta.cutLine} />
      <TopStatCard label="Field Size" value={meta.fieldSize} />
      <TopStatCard label="Event Type" value={meta.eventType} />
    </div>
  );
}
