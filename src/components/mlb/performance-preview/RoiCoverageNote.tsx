/**
 * Concise transparency line for any ROI stat computed from partial odds
 * coverage: "N of M graded picks had archived odds." Never shown as if
 * missing odds were treated as a loss/0-profit/+100 -- they're simply
 * excluded from the ROI calculation, and this note says so plainly.
 */
export default function RoiCoverageNote({ roiEligible, graded, unit = "picks" }: { roiEligible: number; graded: number; unit?: string }) {
  if (graded === 0) return null;
  return (
    <p className="text-[10px] text-slate-400">
      {roiEligible} of {graded} graded {unit} had archived odds.
    </p>
  );
}
