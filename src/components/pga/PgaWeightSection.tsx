import type { ReactNode } from "react";

export default function PgaWeightSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
