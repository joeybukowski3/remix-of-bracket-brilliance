import { Link } from "react-router-dom";

export default function SeoFooterBlock() {
  return (
    <section className="rounded-2xl border border-border bg-card/90 p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">Advanced Sports Analytics & Betting Models</h2>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
        Joe Knows Ball provides free advanced sports analytics and betting models for MLB and PGA Tour.
        MLB tools include daily HR prop rankings, strikeout prop models, batter vs pitcher matchup analysis,
        park factor context, and live game matchup analysis. PGA tools include custom-weighted player rankings,
        course-fit models, strokes gained breakdowns, and DFS salary value finders. NFL and NBA models coming soon.
      </p>
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <Link to="/mlb/hr-props" className="font-medium text-primary hover:underline">MLB HR Props</Link>
        <Link to="/mlb/strikeout-props" className="font-medium text-primary hover:underline">Strikeout Props</Link>
        <Link to="/mlb/batter-vs-pitcher" className="font-medium text-primary hover:underline">Hit Props</Link>
        <Link to="/mlb" className="font-medium text-primary hover:underline">Game Matchup Analysis</Link>
        <Link to="/pga" className="font-medium text-primary hover:underline">PGA Golf Models</Link>
      </div>
    </section>
  );
}
