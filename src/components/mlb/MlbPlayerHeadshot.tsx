import { useState } from "react";
import { getMlbTeamColors } from "@/lib/mlbTeamColors";

export default function MlbPlayerHeadshot({
  playerId,
  name,
  playerName,
  size = 40,
  teamAbbreviation,
  className,
}: {
  playerId?: number | null;
  name?: string;
  playerName?: string;
  size?: number;
  teamAbbreviation?: string;
  className?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const resolvedName = name || playerName || "MLB Player";
  const colors = getMlbTeamColors(teamAbbreviation);
  const espnUrl = playerId
    ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${playerId}/headshot/67/current`
    : null;

  const initials = resolvedName
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={`relative shrink-0 ${className ?? ""}`} style={{ width: size, height: size }}>
      {espnUrl && !imageFailed ? (
        <img
          src={espnUrl}
          alt={resolvedName}
          className="h-full w-full rounded-full object-cover object-center"
          style={{ width: size, height: size, border: `3px solid ${colors.primary}` }}
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : null}
      {(!espnUrl || imageFailed) ? (
        <div
          className="flex h-full w-full items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ width: size, height: size, backgroundColor: colors.primary, border: `3px solid ${colors.secondary ?? "#ffffff"}` }}
        >
          {initials || "ML"}
        </div>
      ) : null}
    </div>
  );
}
