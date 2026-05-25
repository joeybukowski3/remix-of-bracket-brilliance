import { useState } from "react";
import { getMlbTeamColors } from "@/lib/mlbTeamColors";

export default function MlbPlayerHeadshot({
  playerId,
  name,
  size = 40,
  teamAbbreviation,
}: {
  playerId?: number | null;
  name: string;
  size?: number;
  teamAbbreviation?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const colors = getMlbTeamColors(teamAbbreviation);
  const espnUrl = playerId
    ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${playerId}/headshot/67/current`
    : null;

  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {espnUrl && !imageFailed ? (
        <img
          src={espnUrl}
          alt={name}
          className="rounded-full object-cover object-center"
          style={{ width: size, height: size, border: `3px solid ${colors.primary}` }}
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : null}
      {(!espnUrl || imageFailed) ? (
        <div
          className="flex items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ width: size, height: size, backgroundColor: colors.primary, border: `3px solid ${colors.secondary ?? "#ffffff"}` }}
        >
          {initials}
        </div>
      ) : null}
    </div>
  );
}
