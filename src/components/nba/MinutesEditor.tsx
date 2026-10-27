import { useId, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_USER_MINUTES, MIN_USER_MINUTES, parseMinutesInput } from "@/lib/nba/props/minutesOverride";

/** How far the viewer's minutes are from the JKB minutes; amber when the scaling is large, so a typo is visible. */
const LARGE_SCALE_UP = 1.5;
const LARGE_SCALE_DOWN = 0.5;
export function MinutesScale({ factor }: { factor: number }) {
  const large = factor > LARGE_SCALE_UP || factor < LARGE_SCALE_DOWN;
  return (
    <div className={cn("whitespace-nowrap text-[10px] font-normal", large ? "font-semibold text-amber-700" : "text-slate-500")} title={large ? "Large change from the JKB minutes: check the minutes you typed" : "Your minutes relative to the JKB minutes"}>
      × {factor.toFixed(2)} JKB min
    </div>
  );
}

export function MinutesEditor({ name, draft, placeholder, disabledReason, onChange, onReset }: { name: string; draft: string; placeholder: string; disabledReason: string | null; onChange: (text: string) => void; onReset: () => void }) {
  const parsed = parseMinutesInput(draft);
  // The message waits for the field to be left, so a half-typed "." or "-" does not flash an alert; the value is never applied meanwhile.
  const [touched, setTouched] = useState(false);
  const invalid = parsed.kind === "invalid" && touched;
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-1">
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          data-testid="minutes-input"
          aria-label={`Your projected minutes for ${name}, ${MIN_USER_MINUTES} to ${MAX_USER_MINUTES}`}
          ref={inputRef}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          placeholder={placeholder}
          value={draft}
          disabled={disabledReason !== null}
          title={disabledReason ?? `Your minutes (${MIN_USER_MINUTES}-${MAX_USER_MINUTES}, one decimal). Leave blank to use the JKB minutes.`}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          className={cn("h-8 w-16 rounded border px-1.5 text-right text-[12px] tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:bg-slate-50", invalid ? "border-red-400 bg-red-50 text-red-800" : "border-slate-300 bg-white text-slate-900")}
        />
        <button
          type="button"
          data-testid="reset-minutes"
          aria-label={`Reset minutes for ${name}`}
          title="Reset to the JKB minutes"
          onClick={() => {
            onReset();
            setTouched(false);
            inputRef.current?.focus();
          }}
          disabled={draft === ""}
          className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 disabled:invisible"
        >
          <RotateCcw size={13} aria-hidden />
        </button>
      </div>
      {invalid ? (
        <span id={errorId} role="alert" className="max-w-[9rem] text-right text-[10px] font-semibold text-red-700">
          {parsed.kind === "invalid" ? parsed.reason : null}
        </span>
      ) : null}
    </div>
  );
}
