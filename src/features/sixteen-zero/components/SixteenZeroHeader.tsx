import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Logo from "@/components/ui/Logo";

export function SixteenZeroHeader({
  eyebrow,
  trailing,
}: {
  eyebrow?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <header className="border-b border-white/10 bg-slate-950/90">
      <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-3 px-3 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Logo
            clickable
            width={112}
            className="!w-[clamp(7rem,5.5rem+7vw,13rem)] h-auto shrink-0 brightness-0 invert"
          />
          {eyebrow}
        </div>
        <div className="flex items-center gap-3">
          {trailing}
          <Link
            to="/"
            aria-label="Back to Main Site"
            className="flex min-h-10 items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-2.5 py-1.5 text-[clamp(0.75rem,0.7rem+0.15vw,0.875rem)] font-bold text-slate-200 transition hover:border-cyan-300/60 hover:bg-cyan-400/10 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:px-3"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Back to Main Site</span>
            <span className="sm:hidden">Back</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
