import { GuideBody } from "@/components/nfl/guide/GuideBody";
import { usePageSeo } from "@/hooks/usePageSeo";
import { NFL_GUIDE_SEASON } from "@/lib/nfl/guideRecord";

/**
 * Print-focused rendering of the guide at `/nfl-guide/`. It shares `GuideBody`
 * with the live route, so guide data can never drift between the two views.
 * Deliberately excluded from search indexing: `/nfl/guide` is the canonical page.
 */
export default function NFLGuidePrint() {
  usePageSeo({
    title: `${NFL_GUIDE_SEASON} NFL Guide — Print Edition | Joe Knows Ball`,
    description: `Printable ${NFL_GUIDE_SEASON} JoeKnowsBall NFL Guide: power ratings, market comparison, schedule context and team reference for all 32 teams.`,
    path: "/nfl-guide/",
    noindex: true,
  });

  return (
    <>
      <style>{PRINT_STYLES}</style>
      <div className="nfl-guide-print min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
        <div data-print-hidden className="mx-auto mb-4 max-w-[210mm] px-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-300 bg-white px-4 py-3">
            <p className="text-xs text-slate-600">
              Print preview. Use your browser&apos;s print dialog and enable background graphics for the best
              result.
            </p>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-md border-2 border-slate-900 bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-wider text-white transition hover:bg-white hover:text-slate-900"
            >
              Print / Save as PDF
            </button>
          </div>
        </div>

        <main className="nfl-guide-sheet mx-auto max-w-[210mm] bg-white p-[12mm] shadow-lg print:max-w-none print:p-0 print:shadow-none">
          <GuideBody variant="print" />
        </main>
      </div>
    </>
  );
}

const PRINT_STYLES = `
  @page { size: A4 portrait; margin: 12mm; }

  @media print {
    /* Interactive-only controls never reach paper. */
    [data-print-hidden] { display: none !important; }

    html, body { background: #fff !important; }

    .nfl-guide-print { font-size: 9pt; }

    /* Keep cards, tables and division blocks from splitting across pages.
       Pilot team chapters (data-guide-chapter="pilot") are excluded: they are
       deliberately allowed to span two pages, breaking between their own
       break-inside-avoid sections rather than not at all. */
    .nfl-guide-print .guide-division,
    .nfl-guide-print article:not([data-guide-chapter="pilot"]),
    .nfl-guide-print table,
    .nfl-guide-print .break-inside-avoid {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    /* Each conference starts a fresh page; the first must not add a blank one. */
    .nfl-guide-print .guide-conference { break-before: page; page-break-before: always; }
    .nfl-guide-print .guide-conference:first-of-type { break-before: auto; page-break-before: auto; }

    /* A pilot team chapter always starts on its own fresh page. */
    .nfl-guide-print [data-guide-chapter="pilot"] { break-before: page; page-break-before: always; }

    /* Division headings stay with the table they introduce. */
    .nfl-guide-print h2, .nfl-guide-print h3 { break-after: avoid; page-break-after: avoid; }

    /* Repeat table headers when a long table does span pages. */
    .nfl-guide-print thead { display: table-header-group; }

    /* Preserve the tags and rating bars that carry meaning. */
    .nfl-guide-print * {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .nfl-guide-print a { text-decoration: none; color: inherit; }
  }
`;
