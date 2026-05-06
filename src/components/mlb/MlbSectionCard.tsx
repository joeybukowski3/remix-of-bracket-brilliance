import type { CSSProperties, ReactNode } from "react";

export default function MlbSectionCard({
  children,
  accentColor,
  style,
}: {
  children: ReactNode;
  accentColor?: string;
  style?: CSSProperties;
}) {
  return (
    <section
      className="rounded-3xl border border-border/70 bg-card p-5 shadow-[0_12px_32px_hsl(var(--foreground)/0.05)] sm:p-6 lg:p-7"
      style={{
        borderLeftWidth: accentColor ? 6 : undefined,
        borderLeftColor: accentColor,
        ...style,
      }}
    >
      {children}
    </section>
  );
}
