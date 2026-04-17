import { ArrowRight, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";

type HomeSportCardProps = {
  active: boolean;
  desc: string;
  external?: boolean;
  label: string;
  logoSrc: string;
  route: string | null;
};

export default function HomeSportCard({ active, desc, external = false, label, logoSrc, route }: HomeSportCardProps) {
  const navigate = useNavigate();

  function handleClick() {
    if (!active || !route) return;
    if (external) {
      window.location.href = route;
      return;
    }
    navigate(route);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`group relative flex min-h-[308px] w-full flex-col rounded-[24px] border border-black/10 bg-white px-6 py-7 text-left shadow-[0_18px_38px_rgba(0,0,0,0.24)] transition duration-200 ${
        active ? "hover:-translate-y-1 hover:shadow-[0_26px_50px_rgba(0,0,0,0.28)]" : "cursor-default"
      }`}
    >
      {!active ? <Lock className="absolute right-5 top-5 h-4 w-4 text-neutral-400" /> : null}

      <div className="flex h-[98px] items-center">
        <img src={logoSrc} alt={`${label} logo`} className="h-[84px] w-auto object-contain" />
      </div>

      <h2 className="mt-5 text-[21px] font-semibold leading-none tracking-[-0.03em] text-[#111111]">{label}</h2>
      <p className="mt-4 max-w-[16ch] text-[16px] leading-[1.45] text-[#171717]">{desc}</p>

      <div className="mt-auto inline-flex items-center gap-2 pt-7 text-[16px] font-medium text-[#111111]">
        <span>{active ? "Explore Tools" : "Subscription Required"}</span>
        <ArrowRight className="h-[18px] w-[18px] transition-transform duration-200 group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}
