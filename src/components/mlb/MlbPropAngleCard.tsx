import MlbValuePill from "@/components/mlb/MlbValuePill";
import type { MlbPropAngleData } from "@/lib/mlb/mlbTypes";

export default function MlbPropAngleCard({ angle }: { angle: MlbPropAngleData }) {
  return (
    <article className="rounded-[24px] bg-secondary/25 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-[-0.02em] text-foreground">{angle.title}</h3>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">{angle.rationale}</p>
        </div>
        {angle.tag ? <MlbValuePill>{angle.tag}</MlbValuePill> : null}
      </div>
      <ul className="mt-4 space-y-2 text-sm text-foreground">
        {angle.signals.map((signal) => (
          <li key={signal} className="rounded-2xl bg-card/80 px-3 py-2">
            {signal}
          </li>
        ))}
      </ul>
    </article>
  );
}
