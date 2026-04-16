export default function PgaCourseInsightsCard({
  eyebrow = "Course Insights",
  insights,
}: {
  eyebrow?: string;
  insights: Array<{ title: string; body: string }>;
}) {
  return (
    <section className="rounded-[30px] bg-card p-5 shadow-[0_16px_36px_hsl(var(--foreground)/0.05)]">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
      <div className="mt-5 space-y-4">
        {insights.map((insight) => (
          <div key={insight.title} className="rounded-[24px] bg-secondary/55 p-4">
            <p className="text-sm font-medium text-foreground">{insight.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{insight.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
