import { Link } from "react-router-dom";
import { RANK_COLOR_LEGEND, getRankColor } from "@/lib/pga/rankColors";
import type { PlayerModelRow } from "@/lib/pga/pgaTypes";

type PreviewTheme = {
  key: string;
  label: string;
  description: string;
};

type PreviewSlider = {
  label: string;
  value: number;
  max: number;
};

type Props = {
  status: "loading" | "ready" | "error";
  errorMessage?: string;
  themes: PreviewTheme[];
  activeThemeKey: string;
  onThemeChange: (key: string) => void;
  previewRows: PlayerModelRow[];
  sliders: PreviewSlider[];
  liveModelLabel: string;
  ctaHref: string;
  eyebrow: string;
  headline: string;
  body: string;
  rankingTitle: string;
  rankingBody: string;
  railCtaTitle: string;
  railCtaBody: string;
  courseHistoryLabel: string;
};

function ScorePill({ score }: { score: number }) {
  return (
    <span className="inline-flex rounded-full bg-[#1a3a2a]/8 px-2.5 py-1 font-mono text-[11px] font-semibold text-[#1a3a2a]">
      {score.toFixed(3)}
    </span>
  );
}

function SliderPreview({ label, value, max }: PreviewSlider) {
  const width = Math.max(8, Math.min(100, (value / max) * 100));

  return (
    <div className="rounded-2xl border border-[#d9e3dc] bg-white/80 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium text-[#355343]">{label}</span>
        <span className="text-[11px] font-semibold text-[#1a3a2a]">{value}%</span>
      </div>
      <div className="relative mt-3 h-1.5 rounded-full bg-[#d7e1da]">
        <div className="absolute inset-y-0 left-0 rounded-full bg-[#1a3a2a]" style={{ width: `${width}%` }} />
        <span
          className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-white bg-[#1a3a2a] shadow-sm"
          style={{ left: `calc(${width}% - 7px)` }}
        />
      </div>
    </div>
  );
}

export default function PgaModelPreviewCard({
  status,
  errorMessage,
  themes,
  activeThemeKey,
  onThemeChange,
  previewRows,
  sliders,
  liveModelLabel,
  ctaHref,
  eyebrow,
  headline,
  body,
  rankingTitle,
  rankingBody,
  railCtaTitle,
  railCtaBody,
  courseHistoryLabel,
}: Props) {
  const visibleThemes = themes.slice(0, 4);
  const visibleSliders = sliders.slice(0, 3);

  return (
    <div className="grid content-start gap-5 lg:gap-6">
      <section className="rounded-[28px] border border-[#d7e1da] bg-[linear-gradient(180deg,#f9fcf8_0%,#f4f8f4_100%)] p-4 shadow-[0_18px_40px_rgba(26,58,42,0.08)] sm:p-5">
        <div className="mx-auto max-w-[40rem] lg:max-w-none">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#1a3a2a] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
              {eyebrow}
            </span>
          </div>

          <h2 className="mt-3 font-['Playfair_Display'] text-[1.75rem] font-semibold leading-[1.04] tracking-[-0.03em] text-[#1a3a2a] sm:text-[1.9rem]">
            {headline}
          </h2>
          <p className="mt-2.5 max-w-[32rem] text-[13px] leading-6 text-[#52675b] sm:text-sm sm:leading-6">
            {body}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {visibleThemes.map((theme) => {
              const isActive = theme.key === activeThemeKey;
              return (
                <button
                  key={theme.key}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onThemeChange(theme.key)}
                  className={`rounded-full px-3 py-1.5 text-[10px] font-semibold transition sm:text-[11px] ${
                    isActive
                      ? "bg-[#1a3a2a] text-white shadow-[0_10px_24px_rgba(26,58,42,0.18)]"
                      : "border border-[#d7e1da] bg-white text-[#355343] hover:border-[#1a3a2a]/25 hover:bg-[#f6faf7]"
                  }`}
                >
                  {theme.label}
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
            {visibleSliders.map((slider) => (
              <SliderPreview key={slider.label} {...slider} />
            ))}
          </div>

          <div className="mt-4 flex flex-col items-start gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[11px] leading-5 text-[#6a7d72]">{liveModelLabel}</div>
            <Link
              to={ctaHref}
              className="inline-flex items-center justify-center rounded-xl bg-[#1a3a2a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#143021]"
            >
              Open Full Model
            </Link>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-[#d7e1da] bg-white shadow-[0_18px_40px_rgba(26,58,42,0.08)] lg:min-h-[36rem]">
        <div className="p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6a7d72]">Mini Rankings Table</div>
              <h3 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[#1a3a2a]">{rankingTitle}</h3>
              <p className="mt-1 text-[12px] leading-6 text-[#52675b]">{rankingBody}</p>
            </div>
            <Link to={ctaHref} className="inline-flex items-center gap-2 text-sm font-semibold text-[#1a3a2a] transition hover:text-[#143021]">
              Customize full rankings
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[#d7e1da] bg-[#f6faf7] px-4 py-3 text-[11px] text-[#52675b]">
            {RANK_COLOR_LEGEND.map((tier) => (
              <div key={tier.label} className="inline-flex items-center gap-2">
                <span className="inline-block h-[16px] w-[28px] rounded" style={{ background: tier.bg, border: tier.border ?? "none" }} />
                <span>{tier.label}</span>
              </div>
            ))}
          </div>

          {status === "loading" ? (
            <div className="mt-4 rounded-[22px] border border-[#d7e1da] bg-white/90 p-5 text-sm text-[#52675b]">
              Loading the tournament model preview...
            </div>
          ) : null}

          {status === "error" ? (
            <div className="mt-4 rounded-[22px] border border-[#e7b6aa] bg-[#fff7f4] p-5">
              <p className="text-sm font-semibold text-[#8f3820]">Unable to load the live model preview.</p>
              <p className="mt-1 text-sm text-[#a15b49]">{errorMessage}</p>
            </div>
          ) : null}

          {status === "ready" && previewRows.length === 0 ? (
            <div className="mt-4 rounded-[22px] border border-[#d7e1da] bg-white/95 p-5 text-sm text-[#52675b]">
              The tournament page is live. This preview table will fill automatically as soon as the current field export is available.
            </div>
          ) : null}

          {status === "ready" && previewRows.length > 0 ? (
            <div className="mt-4 overflow-hidden rounded-[22px] border border-[#d7e1da] bg-white/95">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[#e3ece5] bg-[#f3f7f3] text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6a7d72]">
                      <th className="px-4 py-3">Rank</th>
                      <th className="px-4 py-3">Player</th>
                      <th className="px-4 py-3">Score</th>
                      <th className="px-3 py-3">{courseHistoryLabel}</th>
                      <th className="px-3 py-3">App</th>
                      <th className="px-3 py-3">Acc</th>
                      <th className="px-3 py-3">ARG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, index) => (
                      <tr key={row.id} className={index % 2 === 0 ? "bg-white" : "bg-[#fafcf9]"}>
                        <td className="px-4 py-3">
                          <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold ${row.rank <= 3 ? "bg-[#1a3a2a] text-white" : "bg-[#edf4ee] text-[#1a3a2a]"}`}>
                            {row.rank}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-[#1c2a21]">{row.player}</div>
                          <div className="mt-1 text-[11px] text-[#6a7d72]">{row.cutsLastFive} cuts made in last five starts here</div>
                        </td>
                        <td className="px-4 py-3">
                          <ScorePill score={row.score} />
                        </td>
                        <td className="px-3 py-3 text-[12px] font-semibold text-[#355343]">
                          {row.courseHistoryScore != null ? row.courseHistoryScore.toFixed(2) : "—"}
                        </td>
                        {[row.sgApproachRank, row.drivingAccuracyRank, row.sgAroundGreenRank].map((rank, cellIndex) => {
                          const tone = getRankColor(rank, 83);
                          return (
                            <td key={`${row.id}-${cellIndex}`} className="px-3 py-3">
                              <span
                                className="inline-flex min-w-[34px] items-center justify-center rounded-md px-2 py-1 text-[11px] font-semibold"
                                style={{ background: tone.bg, color: tone.text }}
                              >
                                {rank ?? "—"}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>

        <Link
          to={ctaHref}
          className="flex items-center justify-between gap-4 border-t border-[#d7e1da] bg-[#1a3a2a] px-5 py-4 text-white transition hover:bg-[#143021] sm:px-6"
        >
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">{railCtaTitle}</div>
            <div className="mt-1 text-sm font-semibold">{railCtaBody}</div>
          </div>
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </span>
        </Link>
      </section>
    </div>
  );
}
