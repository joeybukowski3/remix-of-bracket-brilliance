import { useState } from "react";
import { getNflTeamLogoUrl } from "../lib/teamLogo";

export function NflTeamLogo({
  team,
  size = 20,
  className = "",
}: {
  team: string;
  size?: number;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);
  const src = getNflTeamLogoUrl(team);

  if (!src || hasError) return null;

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`inline-block shrink-0 object-contain ${className}`}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
}
