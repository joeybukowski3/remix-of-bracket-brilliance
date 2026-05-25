import MlbSummaryCard from "@/components/mlb/MlbSummaryCard";
import type { MlbSummaryCardData } from "@/lib/mlb/mlbTypes";

export default function MlbMatchupSummaryRow({
  cards,
  awayAbbreviation,
  homeAbbreviation,
}: {
  cards: MlbSummaryCardData[];
  awayAbbreviation: string;
  homeAbbreviation: string;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 xl:grid xl:grid-cols-6 xl:overflow-visible xl:pb-0">
      {cards.map((card) => (
        <div key={card.label} className="shrink-0 xl:shrink">
          <MlbSummaryCard
            card={card}
            awayAbbreviation={awayAbbreviation}
            homeAbbreviation={homeAbbreviation}
          />
        </div>
      ))}
    </div>
  );
}
