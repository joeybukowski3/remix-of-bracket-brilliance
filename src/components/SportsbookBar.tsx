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
              className="rounded-lg px-4 py-2 text-sm font-semibold transition hover:opacity-90"
              style={{
                backgroundColor: sportsbook.bgColor,
                color: sportsbook.textColor,
              }}
            >
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
