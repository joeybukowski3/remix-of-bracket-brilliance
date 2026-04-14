import type { PgaTournamentMeta } from "@/lib/pga/pgaTypes";

export default function PgaMainHeader({ meta }: { meta: PgaTournamentMeta }) {
  return (
    <section className="rounded-[32px] bg-card px-6 py-7 shadow-[0_18px_40px_hsl(var(--foreground)/0.05)]">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{meta.title}</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-[2.35rem]">
        {meta.tournament}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground sm:text-base">{meta.venue}</p>
    </section>
  );
}
