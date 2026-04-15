import type { ReactNode } from "react";

export default function MlbSectionCard({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-[0_12px_32px_hsl(var(--foreground)/0.05)] sm:p-6 lg:p-7">
      {children}
    </section>
  );
}
