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
      className="rounded-2xl border border-border/70 bg-card p-4 shadow-[0_10px_24px_hsl(var(--foreground)/0.05)]"
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
