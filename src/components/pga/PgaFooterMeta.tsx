import { Link } from "react-router-dom";

export default function PgaFooterMeta() {
  return (
    <footer className="rounded-[28px] bg-card px-5 py-4 text-sm text-muted-foreground shadow-[0_16px_36px_hsl(var(--foreground)/0.04)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p>Joe Knows Ball PGA model. For information and entertainment purposes only.</p>
        <div className="flex flex-wrap gap-4">
          <Link to="/" className="transition hover:text-primary">
            Home
          </Link>
          <Link to="/pga/rbc-heritage-2026-picks" className="transition hover:text-primary">
            RBC Heritage best bets
          </Link>
          <Link to="/pga/top-40-golf-picks" className="transition hover:text-primary">
            Top 40 golf parlays
          </Link>
        </div>
      </div>
    </footer>
  );
}
