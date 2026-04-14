const columns = [
  "Player",
  "Score",
  "Rank",
  "TrendRank",
  "HT # Rounds",
  "Cuts Last 5",
  "2025",
  "2024",
  "2023",
  "2022",
  "2021",
  "SG: Approach Rank",
  "Par 4 Scoring Rank",
  "Driving Accuracy Rank",
  "Bogey Avoidance Rank",
  "SG: Around the Green Rank",
  "Birdie or Better 125-150 Rank",
  "SG: Putting Rank",
  "Birdie or Better <125 Rank",
  "Course True SG",
];

export default function PgaModelTableHeader() {
  return (
    <div className="grid min-w-[1700px] grid-cols-[220px_90px_70px_90px_90px_100px_repeat(5,72px)_repeat(8,112px)_110px] gap-2 px-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
      {columns.map((column) => (
        <div key={column} className="px-3 py-2 first:font-medium">
          {column}
        </div>
      ))}
    </div>
  );
}
