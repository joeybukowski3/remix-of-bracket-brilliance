import { cn } from "@/lib/utils";

type Props = {
  /** 0-100 shares that must sum to 100 — from getCfbSharedBarSplit. */
  awayShare: number;
  homeShare: number;
  awayColor: string;
  homeColor: string;
  className?: string;
};

/**
 * Mobile shared-bar visual: one contiguous two-color bar meeting at a single
 * seam, marked with a small white circle — replaces the desktop
 * winning-team-logo junction marker for the mobile Power Comparison layout.
 * Bar proportions come directly from getCfbSharedBarSplit; this component
 * only renders the pre-computed shares.
 */
export default function CollegeFootballSplitBar({ awayShare, homeShare, awayColor, homeColor, className }: Props) {
  return (
    <div className={cn("relative flex h-2.5 w-full items-center", className)}>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full shadow-sm">
        <div className="h-full" style={{ width: `${awayShare}%`, background: awayColor }} />
        <div className="h-full" style={{ width: `${homeShare}%`, background: homeColor }} />
      </div>
      <div
        data-testid="split-bar-marker"
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-500/70 bg-white shadow"
        style={{ left: `${awayShare}%` }}
      />
    </div>
  );
}
