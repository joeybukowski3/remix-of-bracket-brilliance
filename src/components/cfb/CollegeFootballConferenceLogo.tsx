import { useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  logo: string | null;
  className?: string;
};

/**
 * Renders nothing (never a broken image icon) when logo is null or fails to
 * load — the caller's adjacent conference name remains the source of truth.
 */
export default function CollegeFootballConferenceLogo({ logo, className }: Props) {
  const [failed, setFailed] = useState(false);

  if (!logo || failed) return null;

  return (
    <img
      src={logo}
      alt=""
      className={cn("h-4 w-4 shrink-0 object-contain", className)}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
