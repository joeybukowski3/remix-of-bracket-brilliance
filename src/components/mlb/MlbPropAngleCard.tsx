import MlbValuePill from "@/components/mlb/MlbValuePill";
import type { MlbPropAngleData } from "@/lib/mlb/mlbTypes";

export default function MlbPropAngleCard({ angle }: { angle: MlbPropAngleData }) {
  return (
    <article className="rounded-2xl bg-secondary/25 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-[-0.02em] text-foreground">{angle.title}</h3>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{angle.rationale}</p>
        </div>
        {angle.tag ? <MlbValuePill>{angle.tag}</MlbValuePill> : null}
      </div>
      <ul className="mt-3 space-y-1.5 text-sm text-foreground">
        {angle.signals.map((signal) => (
          <li key={signal} className="rounded-2xl bg-card/80 px-2.5 py-1.5">
            {signal}
          </li>
        ))}
      </ul>
    </article>
  );
}
