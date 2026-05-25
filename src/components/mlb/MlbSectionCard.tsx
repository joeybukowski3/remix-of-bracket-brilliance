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
      className="rounded-xl border border-border/70 bg-card p-3 shadow-[0_4px_12px_hsl(var(--foreground)/0.04)]"
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
