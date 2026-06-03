import { getMlbTeamLogoUrl } from "@/lib/mlb/mlbTeamLogos";
import { getMlbTeamColors } from "@/lib/mlbTeamColors";

export default function MlbTeamLogo({
  team,
  size = 28,
}: {
  team: string;
  size?: number;
}) {
  const src = getMlbTeamLogoUrl(team);
  const colors = getMlbTeamColors(team);

  const fallback = (
    <div
      style={{ width: size, height: size, backgroundColor: colors.primary, fontSize: size * 0.32 }}
      className="flex items-center justify-center rounded-full font-black text-white shrink-0"
    >
      {team.slice(0, 2)}
    </div>
  );

  if (!src) return fallback;

  return (
    <img
      src={src}
      alt={`${team} logo`}
      style={{ width: size, height: size }}
      className="object-contain shrink-0"
      loading="lazy"
      onError={(e) => {
        const el = e.currentTarget;
        el.style.display = "none";
        const parent = el.parentElement;
        if (parent) {
          const div = document.createElement("div");
          div.style.cssText = `width:${size}px;height:${size}px;background:${colors.primary};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:${Math.round(size * 0.32)}px;font-weight:900;color:white;flex-shrink:0`;
          div.textContent = team.slice(0, 2);
          parent.insertBefore(div, el);
        }
      }}
    />
  );
}
