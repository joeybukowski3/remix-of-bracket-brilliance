import SiteShell from "@/components/layout/SiteShell";
import { Button } from "@/components/ui/button";
import { usePageSeo } from "@/hooks/usePageSeo";

const STRIPE_DONATION_LINK = "https://buy.stripe.com/6oU7sM2libxbeZ8dSG2cg00";

export default function Donate() {
  usePageSeo({
    title: "Support Joe Knows Ball | Donate",
    description:
      "Support Joe Knows Ball, a free analytics site for sports fans, and get early access to upcoming MLB, NCAAF, NFL, and PGA models.",
    canonical: "https://www.joeknowsball.com/donate",
  });

  return (
    <SiteShell>
      <main className="site-container py-8">
        <section className="surface-card mx-auto max-w-3xl sm:p-8">
          <h1 className="page-title text-foreground">Support Joe Knows Ball</h1>
          <div className="mt-4 space-y-4 text-sm leading-7 text-muted-foreground sm:text-base">
            <p>Joe Knows Ball was built to be a free tool for analytics-minded fans.</p>
            <p>
              There are current projects in the works, and if you want to support the site or get early access to
              upcoming tools, you can donate through the link below.
            </p>
            <p>
              Include your email with your donation if you want advanced access to upcoming MLB, NCAAF, NFL, and PGA
              models as they are released.
            </p>
            <p>This is a limited-time offer while the site is still in its growing stages.</p>
          </div>

          <div className="mt-8">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <a href={STRIPE_DONATION_LINK} target="_blank" rel="noopener noreferrer">
                Donate with Stripe
              </a>
            </Button>
            <p className="mt-3 text-sm text-muted-foreground">
              Your support helps improve the site and expand future analytics tools.
            </p>
          </div>
        </section>
      </main>
    </SiteShell>
  );
}
