import { useState } from "react";
import { cn } from "@/lib/utils";
import { brandFor, readableOn, teamLogoUrl } from "@/lib/nba/props/teamBrand";

/** Intrinsic size the image advertises, so the browser reserves its space before it loads. The rendered size comes from `className`. */
const INTRINSIC_PX = 40;

interface TeamLogoProps {
  team: string | null;
  /** Sets the rendered square, e.g. "h-9 w-9 md:h-10 md:w-10". */
  className: string;
}

/**
 * A team's logo. Until the image has loaded, and for good if it cannot (blocked, offline, the host moves it), a badge in the
 * team's own colors with its code stands in, so the row never shows a broken image and never shifts when the logo arrives.
 * The logo is decorative: the team code is always written beside it.
 */
export default function TeamLogo(props: TeamLogoProps) {
  // Keyed by team so a reused row never keeps the previous team's loaded/failed state.
  return <TeamLogoInner key={props.team ?? "none"} {...props} />;
}

function TeamLogoInner({ team, className }: TeamLogoProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading");
  const url = teamLogoUrl(team);
  const brand = brandFor(team);
  const showBadge = url === null || status !== "loaded";
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center", className)} data-testid="team-logo" data-team={team ?? ""} data-logo-state={url === null ? "none" : status}>
      {showBadge ? (
        <span
          aria-hidden
          className="flex h-full w-full items-center justify-center rounded-full text-[10px] font-extrabold tracking-tight ring-2 ring-white md:text-[11px]"
          style={{ backgroundColor: brand.primary, color: readableOn(brand.primary) }}
        >
          {team ?? "—"}
        </span>
      ) : null}
      {url !== null && status !== "failed" ? (
        <img
          src={url}
          alt=""
          width={INTRINSIC_PX}
          height={INTRINSIC_PX}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("failed")}
          className={cn("absolute inset-0 h-full w-full object-contain drop-shadow-sm", status === "loaded" ? "opacity-100" : "opacity-0")}
        />
      ) : null}
    </span>
  );
}
