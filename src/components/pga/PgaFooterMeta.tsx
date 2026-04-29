import { Link } from "react-router-dom";

export default function PgaFooterMeta({
  hubPath,
  tournamentPath,
  tournamentLabel,
}: {
  hubPath: string;
  tournamentPath: string;
  tournamentLabel: string;
}) {
  return (
    <footer className="rounded-[28px] bg-card px-5 py-4 text-sm text-muted-foreground shadow-[0_16px_36px_hsl(var(--foreground)/0.04)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p>Joe Knows Ball PGA model. For information and entertainment purposes only.</p>
        <div className="flex flex-wrap gap-4">
          <Link to="/" className="transition hover:text-primary">
            Home
          </Link>
          <Link to={hubPath} className="transition hover:text-primary">
            PGA rankings hub
          </Link>
          <Link to={tournamentPath} className="transition hover:text-primary">
            {tournamentLabel} picks
          </Link>
        </div>
      </div>
    </footer>
  );
}
