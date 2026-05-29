import { SPORTSBOOKS } from "@/lib/sportsbooks";

export default function SportsbookBar() {
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Bet with our partners - use these links to support the site
      </div>

      <div className="-mx-1 overflow-x-auto pb-1">
        <div className="flex min-w-max gap-2 px-1">
          {SPORTSBOOKS.map((sportsbook) => (
            <a
              key={sportsbook.name}
              href={sportsbook.referralUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition hover:opacity-90"
              style={{ backgroundColor: sportsbook.bgColor, color: sportsbook.textColor }}
            >
              <img
                src={sportsbook.logoUrl}
                alt={sportsbook.name}
                className="h-5 w-5 rounded object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              {sportsbook.name}
            </a>
          ))}
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground">
        Must be 21+. Gambling problem? Call 1-800-GAMBLER.
      </div>
    </div>
  );
}
