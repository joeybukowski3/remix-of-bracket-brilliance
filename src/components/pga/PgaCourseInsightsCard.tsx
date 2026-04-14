export default function PgaCourseInsightsCard() {
  return (
    <section className="rounded-[30px] bg-card p-5 shadow-[0_16px_36px_hsl(var(--foreground)/0.05)]">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Course Insights</p>
      <div className="mt-5 space-y-4">
        <div className="rounded-[24px] bg-secondary/55 p-4">
          <p className="text-sm font-medium text-foreground">Approach</p>
          <p className="mt-1 text-sm text-muted-foreground">Critical driver at Harbour Town.</p>
        </div>
        <div className="rounded-[24px] bg-secondary/55 p-4">
          <p className="text-sm font-medium text-foreground">Off the Tee</p>
          <p className="mt-1 text-sm text-muted-foreground">Accuracy matters more than distance this week.</p>
        </div>
        <div className="rounded-[24px] bg-secondary/55 p-4">
          <p className="text-sm font-medium text-foreground">Pro Tip</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Lean into approach rank, bogey avoidance, and Harbour Town history when pricing top-10 and top-40 tickets.
          </p>
        </div>
      </div>
    </section>
  );
}
