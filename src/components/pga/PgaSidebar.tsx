import { BarChart3, Gauge, Settings, Target, Trophy } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { NCAA_BETTING_EDGE_PATH, NCAA_SCHEDULE_PATH } from "@/lib/routes";

export default function PgaSidebar({
  picksPath,
  modelPath,
}: {
  picksPath: string;
  modelPath: string;
}) {
  const location = useLocation();
  const items = [
    { to: picksPath, label: "Dashboard", icon: Gauge },
    { to: modelPath, label: "PGA Model", icon: BarChart3 },
    { to: `${picksPath}#best-bets`, label: "Tournament Hub", icon: Trophy },
    { to: NCAA_BETTING_EDGE_PATH, label: "Prop Tool", icon: Target },
    { to: NCAA_SCHEDULE_PATH, label: "Settings", icon: Settings },
  ];

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
