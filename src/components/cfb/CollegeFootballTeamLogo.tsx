import { useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  logo?: string | null;
  abbreviation?: string;
  primaryColor?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
};

const SIZE = {
  sm: "h-5 w-5 text-[8px]",
  md: "h-7 w-7 text-[9px]",
  lg: "h-10 w-10 text-[11px]",
};

/**
 * Consistent CFB team logo with lazy loading and initials fallback.
 * Never shows a broken image icon.
 */
export default function CollegeFootballTeamLogo({
  name,
  logo,
  abbreviation,
  primaryColor = "#334155",
  className,
  size = "md",
}: Props) {
  const [failed, setFailed] = useState(false);
  const sizeClass = SIZE[size];
  const initials =
    abbreviation?.slice(0, 3).toUpperCase() ||
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase();

  if (logo && !failed) {
    return (
      <img
        src={logo}
        alt=""
        className={cn("shrink-0 object-contain", sizeClass, className)}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-black text-white",
        sizeClass,
        className,
      )}
      style={{ background: primaryColor }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
