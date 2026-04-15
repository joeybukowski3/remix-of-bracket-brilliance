export default function MlbLeagueAverageTick({ position }: { position: number }) {
  return (
    <span
      className="pointer-events-none absolute inset-y-0 z-20 w-[2px] -translate-x-1/2 rounded-full bg-foreground/65"
      style={{ left: `${position}%` }}
      aria-hidden="true"
    />
  );
}
