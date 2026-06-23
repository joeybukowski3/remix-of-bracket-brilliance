export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-4">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">
        {eyebrow}
      </div>
      <h2 className="mt-1 text-2xl font-black text-slate-900">{title}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

export function ValueCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "good" | "bad" | "blue" | "neutral";
}) {
  const color = tone === "good"
    ? "text-emerald-700"
    : tone === "bad"
      ? "text-red-600"
      : tone === "blue"
        ? "text-blue-700"
        : "text-slate-900";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-black ${color}`}>{value}</div>
      {detail && <div className="mt-1 text-xs font-bold text-slate-500">{detail}</div>}
    </div>
  );
}
