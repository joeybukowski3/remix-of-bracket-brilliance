import type { ReactNode } from "react";
import type { AiHandicapV2Card } from "@/lib/nfl/aiHandicapPresentation";
import { getProviderTheme } from "@/lib/nfl/aiHandicapProviderTheme";
import { parseV2AnalysisMarkdown, splitInlineBold } from "@/lib/nfl/aiHandicapV2Format";

function renderInline(text: string): ReactNode[] {
  return splitInlineBold(text).map((part, index) => (part.bold ? <strong key={index}>{part.text}</strong> : <span key={index}>{part.text}</span>));
}

const SOURCE_TYPE_LABEL: Record<string, string> = { market: "Market", injury: "Injury", news: "News", weather: "Weather", other: "Data" };

/**
 * Sources disclosure (collapsed by default). Only what is attached to the
 * record: a source with a URL is a real link to the publisher; a source
 * without one is shown as plain internal JKB text and is never linked.
 */
function SourcesDisclosure({ card }: { card: AiHandicapV2Card }) {
  if (card.sources.length === 0) return null;
  return (
    <details data-testid={`ai-handicap-sources-${card.provider}`} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <summary className="cursor-pointer text-[12px] font-bold text-slate-700">Sources ({card.sources.length})</summary>
      <ul className="mt-2 space-y-1.5">
        {card.sources.map((source, index) => (
          <li key={`${source.url ?? source.label}-${index}`} className="min-w-0 break-words text-[12px] leading-5 text-slate-700">
            <span className="mr-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">{SOURCE_TYPE_LABEL[source.type] ?? "Data"}</span>
            {source.url ? (
              <a href={source.url} target="_blank" rel="noopener noreferrer" className="break-all font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900">
                {source.label}
              </a>
            ) : (
              <span data-internal-source="true" className="font-semibold text-slate-800">
                {source.label}
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * v2 analysis for ONE provider. analysisMarkdown is the hero: 4-6 short
 * paragraphs, then the provider's final-read lines as a compact block, then
 * the closing recommendation. Not the legacy 12-section article.
 */
export default function AiHandicapV2Analysis({ card }: { card: AiHandicapV2Card }) {
  const theme = getProviderTheme(card.provider);
  const blocks = parseV2AnalysisMarkdown(card.analysisMarkdown);

  return (
    <article
      data-testid={`ai-handicap-article-${card.provider}`}
      data-provider={card.provider}
      data-handicap-version="v2"
      className="min-w-0 space-y-4 rounded-lg border border-slate-200 bg-white px-4 py-4 sm:px-6 sm:py-5"
    >
      <h4 className={`text-[11px] font-black uppercase tracking-[0.1em] ${theme.accentText}`}>{card.displayName} — handicap</h4>
      <div className="max-w-prose space-y-3.5">
        {blocks.map((block, index) =>
          block.kind === "finalRead" ? (
            <div key={index} data-testid={`ai-handicap-final-read-${card.provider}`} className={`rounded-md border-2 px-3 py-2.5 ${theme.accentBorder} ${theme.accentBg}`}>
              {block.lines.map((line) => (
                <p key={line} className={`break-words text-[14px] font-extrabold leading-6 tabular-nums ${theme.pickText}`}>
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <p key={index} className="break-words text-[15px] leading-7 text-slate-800">
              {renderInline(block.text)}
            </p>
          )
        )}
      </div>
      <SourcesDisclosure card={card} />
    </article>
  );
}
