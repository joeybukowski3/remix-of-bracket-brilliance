export default function MlbLeagueAverageTick({ position }: { position: number }) {
  return (
    <span
      className="pointer-events-none absolute inset-y-0 z-20 w-[2px] -translate-x-1/2 bg-amber-400"
      style={{ left: `${position}%` }}
      aria-hidden="true"
    />
  );
}
