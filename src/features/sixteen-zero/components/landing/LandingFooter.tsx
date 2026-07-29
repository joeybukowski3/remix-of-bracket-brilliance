import Logo from "@/components/ui/Logo";
import { PLAYER_DATA_META } from "../../data";

export function LandingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-col items-center gap-3 border-t border-white/10 pt-8 text-center sm:flex-row sm:justify-between sm:text-left">
        <div className="flex items-center gap-3">
          <Logo width={96} className="!w-24 h-auto brightness-0 invert" />
          <span className="text-xs font-semibold text-slate-500">joeknowsball.com</span>
        </div>
        <span className="text-xs text-slate-600">© {year} JoeKnowsBall</span>
      </div>
      <div className="mt-6 text-xs leading-5 text-slate-500">
        <p>
          Rankings data updated {PLAYER_DATA_META.publishedAt}. Simulation outcomes are for
          entertainment and research use only.
        </p>
        <p className="mt-2">
          16-0 does not offer prizes, wagering, or guarantees of real-world fantasy performance.
        </p>
      </div>
    </footer>
  );
}
