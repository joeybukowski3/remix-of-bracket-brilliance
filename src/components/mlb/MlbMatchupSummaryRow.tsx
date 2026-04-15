import MlbSummaryCard from "@/components/mlb/MlbSummaryCard";
import type { MlbSummaryCardData } from "@/lib/mlb/mlbTypes";

export default function MlbMatchupSummaryRow({ cards }: { cards: MlbSummaryCardData[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {cards.map((card) => (
        <MlbSummaryCard key={card.label} card={card} />
      ))}
    </div>
  );
}
