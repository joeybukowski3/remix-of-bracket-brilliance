import { BarChart3, Gauge, Settings, Target, Trophy } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

const items = [
  { to: "/pga/rbc-heritage-2026-picks", label: "Dashboard", icon: Gauge },
  { to: "/pga/model", label: "PGA Model", icon: BarChart3 },
  { to: "/pga/rbc-heritage-2026-picks#best-bets", label: "Tournament Hub", icon: Trophy },
  { to: "/betting-edge", label: "Prop Tool", icon: Target },
  { to: "/schedule", label: "Settings", icon: Settings },
];

export default function PgaSidebar() {
  const location = useLocation();

  return (
    <div className="rounded-[28px] bg-card p-5 shadow-[0_16px_36px_hsl(var(--foreground)/0.05)]">
      <div className="mb-6">
        <h2 className="text-xl font-semibold tracking-[-0.03em] text-foreground">The Model Room</h2>
        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">Joe&apos;s Elite Picks</p>
      </div>

      <nav className="space-y-2">
        {items.map((item) => {
          const Icon = item.icon;
          const [pathname, hash] = item.to.split("#");
          const active = location.pathname === pathname && (!hash || location.hash === `#${hash}`);
          return (
            <Link
              key={`${item.label}-${item.to}`}
              to={item.to}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition ${
                active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
