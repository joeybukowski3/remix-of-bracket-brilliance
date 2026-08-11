import { useEffect, useState } from "react";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import type { NflMatchupTeam } from "@/lib/nfl/matchups";

/**
 * Route-scoped team crest for the matchup analyzer.
 *
 * The header previously rendered a bare `<img>` with no error handling, so a
 * logo that failed to load left a broken-image glyph and a console error. This
 * closes that gap:
 *
 *  - width and height are fixed and applied to both the image and the fallback,
 *    so a failure causes no layout shift
 *  - `onError`, and a missing source, both fall back to *this* team's
 *    abbreviation on a neutral tile — never a placeholder or another team's mark
 *  - the tile tone distinguishes away from home without depending on any
 *    particular franchise's colours, and the abbreviation is white on a dark
 *    slate ground so contrast is the same for every team
 *  - decorative by default, because the crest sits beside the team name
 *    everywhere it is used; pass a label where the name is not adjacent
 *
 * Deliberately not unified with the six other logo implementations elsewhere in
 * the app — that refactor is out of scope for this route.
 */

/** Away and home tiles differ in tone only; neither borrows a team colour. */
const SIDE_TONE: Record<"away" | "home", string> = {
  away: "bg-slate-700 text-white",
  home: "bg-emerald-800 text-white",
};

export default function NflTeamCrest({
  team,
  side,
  size = 40,
  label,
  className = "",
}: {
  team: NflMatchupTeam;
  side: "away" | "home";
  /** Rendered width and height in pixels. Applied to image and fallback alike. */
  size?: number;
  /** Accessible name. Omit where the team name is already adjacent. */
  label?: string;
  className?: string;
}) {
  const src = team.abbr ? nflLogoUrl(team.abbr) : null;
  const [failed, setFailed] = useState(!src);

  // A different matchup (or a corrected abbreviation) must get a fresh attempt
  // rather than inheriting the previous team's failure.
  useEffect(() => {
    setFailed(!src);
  }, [src]);

  const abbr = (team.abbr || "").toUpperCase();
  const box = { width: size, height: size };
  // Two characters fit comfortably; three need to step down, and the fallback
  // must never be the thing that changes the tile's size.
  const fontSize = Math.max(9, Math.round(size * (abbr.length > 2 ? 0.26 : 0.34)));

  const shared = `shrink-0 overflow-hidden rounded-md ${className}`;

  if (failed || !src) {
    return (
      <span
        style={box}
        aria-hidden={label ? undefined : true}
        role={label ? "img" : undefined}
        aria-label={label}
        className={`${shared} inline-grid place-items-center font-bold leading-none tracking-wide ${SIDE_TONE[side]}`}
      >
        <span style={{ fontSize }} aria-hidden={label ? true : undefined}>
          {abbr || "NFL"}
        </span>
      </span>
    );
  }

  return (
    <span style={box} className={`${shared} inline-grid place-items-center bg-slate-50`}>
      <img
        src={src}
        width={size}
        height={size}
        loading="lazy"
        alt={label ?? ""}
        aria-hidden={label ? undefined : true}
        onError={() => setFailed(true)}
        className="block h-full w-full object-contain"
      />
    </span>
  );
}
