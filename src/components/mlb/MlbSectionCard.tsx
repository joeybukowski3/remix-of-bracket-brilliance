import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export default function MlbSectionCard({
  children,
  accentColor,
  style,
  collapsible = false,
  defaultCollapsed = false,
  title,
}: {
  children: ReactNode;
  accentColor?: string;
  style?: CSSProperties;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  title?: string;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <section
      className="rounded-xl bg-card overflow-hidden"
      style={{
        border: accentColor ? `1px solid ${accentColor}40` : "1px solid hsl(var(--border))",
        borderTopWidth: accentColor ? 3 : 1,
        borderTopColor: accentColor ?? undefined,
        boxShadow: "0 2px 8px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)",
        ...style,
      }}
    >
      {collapsible ? (
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex w-full items-center justify-between px-4 py-2.5 text-left border-b border-border/50 bg-secondary/20 hover:bg-secondary/40 transition-colors"
        >
          <span className="text-xs font-bold text-foreground tracking-wide">{title}</span>
          {collapsed ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />}
        </button>
      ) : null}
      {!collapsed && <div className="p-4">{children}</div>}
    </section>
  );
}
