import { getMlbTeamLogoUrl } from "@/lib/mlb/mlbTeamLogos";

export default function MlbTeamLogo({
  team,
  size = 28,
}: {
  team: string;
  size?: number;
}) {
  const src = getMlbTeamLogoUrl(team);

  if (!src) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex items-center justify-center rounded-full bg-muted text-xs font-semibold"
      >
        {team}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`${team} logo`}
      style={{ width: size, height: size }}
      className="object-contain"
      loading="lazy"
    />
  );
}
