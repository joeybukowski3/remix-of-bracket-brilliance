import { Link } from "react-router-dom";

export default function SeoFooterBlock() {
  return (
    <section className="rounded-2xl border border-border bg-card/90 p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">NCAA Basketball Analytics Platform</h2>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
        Joe Knows Ball is an NCAA basketball analytics platform providing advanced team analysis, custom rankings,
        matchup breakdowns, and March Madness bracket insights. The platform uses custom metrics and statistical
        models to evaluate team strength, tournament paths, and game matchups across Division I college basketball.
      </p>
      <Link to="/donate" className="mt-4 inline-flex text-sm font-medium text-primary hover:underline">
        Support this project
      </Link>
    </section>
  );
}
