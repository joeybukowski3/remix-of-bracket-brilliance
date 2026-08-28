import { useCallback, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import { Upload, X } from "lucide-react";
import { parseDraftKingsNflClassicCsv } from "@/lib/nfl/dfs/draftKingsCsv";
import type { DraftKingsNflClassicParseResult } from "@/lib/nfl/dfs/contracts";
import { describeDfsDiagnostic } from "@/lib/nfl/dfs/presentation";
import { cn } from "@/lib/utils";

export type NflDfsUploadPanelProps = {
  onResult: (result: DraftKingsNflClassicParseResult | null, fileName: string | null) => void;
};

/**
 * Reads and parses the file entirely in the browser via parseDraftKingsNflClassicCsv --
 * no network upload occurs.
 */
export default function NflDfsUploadPanel({ onResult }: NflDfsUploadPanelProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<DraftKingsNflClassicParseResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === "string" ? reader.result : "";
        const parsed = parseDraftKingsNflClassicCsv(text);
        setResult(parsed);
        onResult(parsed, file.name);
      };
      reader.readAsText(file);
    },
    [onResult],
  );

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) handleFile(file);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleReset = () => {
    setFileName(null);
    setResult(null);
    onResult(null, null);
  };

  const handleDropzoneKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      inputRef.current?.click();
    }
  };

  const errorDiagnostics = result?.diagnostics.filter((d) => d.severity === "error") ?? [];
  const warningDiagnostics = result?.diagnostics.filter((d) => d.severity === "warning") ?? [];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3" aria-label="Upload DraftKings salary CSV">
      {!fileName && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload DraftKings NFL Classic salary CSV. Drag and drop or press Enter to browse."
          onClick={() => inputRef.current?.click()}
          onKeyDown={handleDropzoneKeyDown}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-8 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
            isDragging ? "border-sky-500 bg-sky-50" : "border-slate-300 bg-slate-50 hover:border-slate-400",
          )}
        >
          <Upload aria-hidden className="h-6 w-6 text-slate-500" />
          <p className="text-sm font-bold text-slate-900">Drop your DraftKings CSV or click to browse</p>
          <p className="text-[11px] text-slate-500">DraftKings NFL Classic &middot; QB / RB / WR / TE / FLEX / DST</p>
          <p className="text-[10px] text-slate-400">Parsed entirely in your browser -- nothing is uploaded to a server.</p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            aria-label="Choose DraftKings salary CSV file"
            onChange={handleInputChange}
            className="sr-only"
          />
        </div>
      )}

      {fileName && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="min-w-0 truncate text-xs font-bold text-slate-800">{fileName}</span>
            <button
              type="button"
              onClick={handleReset}
              aria-label="Remove file and choose a different CSV"
              className="inline-flex shrink-0 items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              <X aria-hidden className="h-3 w-3" /> Change file
            </button>
          </div>

          {result && !result.accepted && (
            <div role="alert" className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900">
              <p className="font-bold">Cannot analyze this file</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {errorDiagnostics.slice(0, 8).map((diagnostic, index) => (
                  <li key={index}>{describeDfsDiagnostic(diagnostic.code, diagnostic.field, diagnostic.row)}</li>
                ))}
                {errorDiagnostics.length > 8 && <li>and {errorDiagnostics.length - 8} more issue(s).</li>}
              </ul>
            </div>
          )}

          {result?.accepted && warningDiagnostics.length > 0 && (
            <div role="status" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p className="font-bold">{warningDiagnostics.length} warning(s) in this file</p>
              <p className="mt-0.5 text-[11px] text-amber-800">Unrecognized statuses, extra columns, or unparsed game info will not block analysis.</p>
            </div>
          )}

          {result?.accepted && (
            <p role="status" className="text-[11px] font-bold text-emerald-700">
              {result.validRowCount} rows parsed successfully.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
