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
      className="rounded-xl bg-card shadow-[0_4px_12px_hsl(var(--foreground)/0.04)] overflow-hidden"
      style={{
        border: accentColor ? `1px solid ${accentColor}30` : "1px solid hsl(var(--border)/0.7)",
        borderTopWidth: accentColor ? 3 : 1,
        borderTopColor: accentColor ?? undefined,
        ...style,
      }}
    >
      {collapsible ? (
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex w-full items-center justify-between px-3 py-2 text-left"
        >
          <span className="text-xs font-bold text-foreground">{title}</span>
          {collapsed ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />}
        </button>
      ) : null}
      {!collapsed && <div className="p-3">{children}</div>}
    </section>
  );
}
