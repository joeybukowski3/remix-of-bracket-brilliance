import MlbPropAngleCard from "@/components/mlb/MlbPropAngleCard";
import type { MlbPropAngleData } from "@/lib/mlb/mlbTypes";

export default function MlbPropAnglesPanel({ angles }: { angles: MlbPropAngleData[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {angles.map((angle) => (
        <MlbPropAngleCard key={angle.title} angle={angle} />
      ))}
    </div>
  );
}
