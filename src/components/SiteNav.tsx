import { Link, useLocation } from "react-router-dom";
import { Trophy, BarChart3, Brackets, CalendarDays } from "lucide-react";

const navItems = [
  { to: "/", label: "Rankings", icon: Trophy },
  { to: "/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/matchup", label: "Game Analysis", icon: BarChart3 },
  { to: "/bracket", label: "March Madness", icon: Brackets },
];

export default function SiteNav() {
  const location = useLocation();

  return (
    <nav className="border-b border-border bg-card sticky top-0 z-50">
      <div className="container mx-auto flex items-center justify-between py-3 px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <Trophy className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold tracking-tight text-foreground">
            CourtEdge
          </span>
        </Link>
        <div className="flex items-center gap-1">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
