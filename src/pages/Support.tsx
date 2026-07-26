import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import { Button } from "@/components/ui/button";
import { usePageSeo } from "@/hooks/usePageSeo";

const SUPPORT_CONFIG = {
  stripeUrl: import.meta.env.VITE_STRIPE_SUPPORT_URL,
  bitcoinAddress: import.meta.env.VITE_BITCOIN_SUPPORT_ADDRESS,
};

const SUPPORT_EXPENSES = [
  "Sports and betting data APIs",
  "Hosting and infrastructure",
  "Database and storage costs",
  "Development and coding tools",
  "Automated data processing",
  "Testing, maintenance, and security",
  "New models, features, and sports coverage",
];

const DIFFERENTIATORS = [
  "Inflated or selectively presented betting records",
  "Guaranteed-win marketing",
  "Expensive subscriptions for ordinary statistics",
  "Misleading performance claims",
  "Generic AI-generated betting content",
  "High-volume, low-value picks",
];

const SUPPORTER_BENEFITS = [
  "Early access to new tools",
  "Supporter-only feature previews",
  "Recognition as an early contributor",
  "Input on future features and sports coverage",
  "Access to future supporter benefits",
];

type CopyStatus =
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }
  | null;

interface SupportPageProps {
  stripeSupportUrl?: string;
  bitcoinAddress?: string;
}

function getSafeStripeUrl(value?: string) {
  if (!value?.trim()) return undefined;

  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function SupportStripeButton({ href, className = "" }: { href?: string; className?: string }) {
  if (!href) {
    return (
      <Button disabled size="lg" className={className}>
        Support with Stripe
      </Button>
    );
  }

  return (
    <Button asChild size="lg" className={className}>
      <a href={href} target="_blank" rel="noopener noreferrer">
        Support with Stripe
      </a>
    </Button>
  );
}

export function SupportPage({ stripeSupportUrl, bitcoinAddress }: SupportPageProps) {
  const stripeUrl = getSafeStripeUrl(stripeSupportUrl);
  const configuredBitcoinAddress = bitcoinAddress?.trim();
  const [copyStatus, setCopyStatus] = useState<CopyStatus>(null);
  const copyStatusTimer = useRef<number>();

  usePageSeo({
    title: "Support Joe Knows Ball | Independent Sports Analytics",
    description:
      "Support the continued development of Joe Knows Ball, an independent sports analytics platform offering public betting, fantasy, and matchup tools.",
    path: "/support",
  });

  useEffect(() => {
    return () => {
      if (copyStatusTimer.current) window.clearTimeout(copyStatusTimer.current);
    };
  }, []);

  const reportCopyStatus = (status: CopyStatus) => {
    setCopyStatus(status);
    if (copyStatusTimer.current) window.clearTimeout(copyStatusTimer.current);
    copyStatusTimer.current = window.setTimeout(() => setCopyStatus(null), status?.kind === "error" ? 5000 : 2500);
  };

  const copyBitcoinAddress = async () => {
    if (!configuredBitcoinAddress) return;

    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(configuredBitcoinAddress);
      reportCopyStatus({ kind: "success", message: "Bitcoin address copied." });
    } catch {
      reportCopyStatus({
        kind: "error",
        message: "Copy failed. Select the address to copy it manually.",
      });
    }
  };

  return (
    <SiteShell>
      <main className="min-w-0 bg-[#f8fafc]">
        <section className="border-b border-slate-200 bg-white">
          <div className="site-container py-12 sm:py-16 lg:py-20">
            <div className="mx-auto max-w-5xl">
              <p className="eyebrow-label text-primary">Support Joe Knows Ball</p>
              <h1 className="mt-3 max-w-4xl text-4xl font-semibold leading-tight tracking-[-0.04em] text-slate-950 sm:text-5xl lg:text-6xl">
                Independent sports analytics, built for the public.
              </h1>
              <div className="mt-6 max-w-3xl space-y-3 text-base leading-7 text-slate-600 sm:text-lg">
                <p>
                  Joe Knows Ball is created and maintained by one person with a passion for sports analytics, betting
                  research, fantasy sports, and making useful data accessible.
                </p>
                <p>
                  This is a growing side project. Support is optional, and the goal is to keep valuable information
                  available to everyone.
                </p>
              </div>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <SupportStripeButton href={stripeUrl} className="w-full sm:w-auto" />
                <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
                  <a href="#other-ways-to-support">Other ways to support</a>
                </Button>
              </div>
              {!stripeUrl ? (
                <p className="mt-3 text-sm text-slate-500">Stripe support is not currently configured.</p>
              ) : null}
            </div>
          </div>
        </section>

        <div className="site-container py-10 sm:py-14 lg:py-16">
          <div className="mx-auto max-w-5xl space-y-10 sm:space-y-12">
            <section aria-labelledby="why-support-heading">
              <div className="max-w-2xl">
                <p className="eyebrow-label">Where support goes</p>
                <h2 id="why-support-heading" className="mt-2 text-2xl font-semibold text-slate-950 sm:text-3xl">
                  Why support the site?
                </h2>
              </div>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {SUPPORT_EXPENSES.map((expense) => (
                  <li key={expense} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm font-medium text-slate-800">
                    <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{expense}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-sm font-semibold text-slate-900">
                All proceeds are reinvested into improving Joe Knows Ball.
              </p>
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8" aria-labelledby="value-heading">
                <p className="eyebrow-label">Support on your terms</p>
                <h2 id="value-heading" className="mt-2 text-2xl font-semibold text-slate-950">
                  You decide the value
                </h2>
                <div className="mt-5 space-y-4 text-sm leading-7 text-slate-600 sm:text-base">
                  <p>There is no required subscription and no pressure to contribute.</p>
                  <p>
                    Choose the amount that reflects how useful the site is to you. Continuing to use the free data
                    without contributing is completely welcome.
                  </p>
                  <p>
                    Joe Knows Ball was built with limited resources and benefited from freely shared information along
                    the way. Keeping useful analytics accessible is an important part of the project.
                  </p>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-slate-950 p-6 text-white sm:p-8" aria-labelledby="different-heading">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  What makes this different?
                </p>
                <h2 id="different-heading" className="mt-2 text-2xl font-semibold text-white">
                  Transparent tools, not expensive hype.
                </h2>
                <p className="mt-5 text-sm text-slate-300">The site is not built around:</p>
                <ul className="mt-3 space-y-2.5 text-sm leading-6 text-slate-300">
                  {DIFFERENTIATORS.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span aria-hidden="true" className="text-slate-500">—</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-sm leading-7 text-slate-200">
                  The focus is transparent data, useful tools, honest methodology, and the information serious
                  bettors, fantasy players, analysts, and sports fans actually want.
                </p>
              </section>
            </div>

            <div id="other-ways-to-support" className="scroll-mt-28 space-y-6">
              <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8" aria-labelledby="benefits-heading">
                <p className="eyebrow-label">As the project grows</p>
                <h2 id="benefits-heading" className="mt-2 text-2xl font-semibold text-slate-950">
                  Early supporter benefits
                </h2>
                <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base">
                  Early supporters may receive future benefits such as:
                </p>
                <ul className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                  {SUPPORTER_BENEFITS.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-3 text-sm text-slate-700">
                      <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-sm text-slate-500">Specific benefits may evolve as the site grows.</p>
              </section>

              {configuredBitcoinAddress ? (
                <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8" aria-labelledby="bitcoin-heading">
                  <p className="eyebrow-label">Another way to contribute</p>
                  <h2 id="bitcoin-heading" className="mt-2 text-2xl font-semibold text-slate-950">
                    Support with Bitcoin
                  </h2>
                  <div className="mt-5 flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center">
                    <code className="min-w-0 flex-1 break-all font-mono text-sm leading-6 text-slate-800">
                      {configuredBitcoinAddress}
                    </code>
                    <Button type="button" variant="outline" className="w-full shrink-0 bg-white sm:w-auto" onClick={copyBitcoinAddress}>
                      <Copy aria-hidden="true" />
                      {copyStatus?.kind === "success" ? "Copied" : "Copy address"}
                    </Button>
                  </div>
                  {copyStatus ? (
                    <p
                      role="status"
                      aria-live="polite"
                      className={`mt-3 text-sm ${copyStatus.kind === "error" ? "text-red-700" : "text-emerald-700"}`}
                    >
                      {copyStatus.message}
                    </p>
                  ) : null}
                </section>
              ) : null}
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center sm:p-10" aria-labelledby="thanks-heading">
              <h2 id="thanks-heading" className="text-2xl font-semibold text-slate-950 sm:text-3xl">
                Thank you for being here.
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                Whether you contribute, share the site, send feedback, or simply use the tools, your support helps Joe
                Knows Ball grow.
              </p>
              <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                {stripeUrl ? <SupportStripeButton href={stripeUrl} className="w-full sm:w-auto" /> : null}
                <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
                  <Link to="/mlb">Explore MLB analytics</Link>
                </Button>
              </div>
            </section>
          </div>
        </div>
      </main>
    </SiteShell>
  );
}

export default function Support() {
  return (
    <SupportPage
      stripeSupportUrl={SUPPORT_CONFIG.stripeUrl}
      bitcoinAddress={SUPPORT_CONFIG.bitcoinAddress}
    />
  );
}
