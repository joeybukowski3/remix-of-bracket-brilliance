import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UpdateTimeline } from "@/components/walter/UpdateTimeline";
import { SourceBreakdown } from "@/components/walter/SourceBreakdown";
import type { WalterCaptureType, WalterPublicGame } from "@/lib/walter/types";
import { WALTER_CAPTURE_TYPES, latestAvailableCapture } from "@/lib/walter/types";

const CAPTURE_LABELS: Record<WalterCaptureType, string> = {
  wednesday: "Wednesday",
  thursday: "Thursday",
  saturday: "Saturday",
  sunday: "Sunday",
};

function TeamName({ team }: { team: WalterPublicGame["away"] }) {
  return <>{team.name ?? team.abbr ?? "Unknown team"}</>;
}

export function GameDetailPanel({ game }: { game: WalterPublicGame }) {
  const [captureType, setCaptureType] = useState<WalterCaptureType>(() => latestAvailableCapture(game) ?? "wednesday");
  const capture = game.captures[captureType];
  const delta = game.deltas[captureType] ?? null;

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold text-slate-100">
          <TeamName team={game.away} /> @ <TeamName team={game.home} />
        </h2>
        {game.kickoffEt && <p className="text-sm text-slate-500">{game.kickoffEt}</p>}
      </header>

      <Tabs value={captureType} onValueChange={(v) => setCaptureType(v as WalterCaptureType)}>
        <TabsList>
          {WALTER_CAPTURE_TYPES.map((type) => (
            <TabsTrigger key={type} value={type} disabled={!game.captures[type]}>
              {CAPTURE_LABELS[type]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {!capture && (
        <p className="rounded-md border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-500">
          No {CAPTURE_LABELS[captureType]} capture yet for this game.
        </p>
      )}

      {capture && (
        <>
          {capture.parseStatus !== "ok" && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              This capture parsed with warnings ({capture.parseWarnings.join("; ") || "unspecified"}). Some fields may be incomplete.
            </p>
          )}

          <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Walt's Snapshot</h3>
            <p className="text-sm leading-relaxed text-slate-300">{capture.snapshot.thesis ?? "No snapshot thesis available for this capture."}</p>
            {capture.snapshot.keyMatchup && <p className="mt-2 text-sm text-slate-500">{capture.snapshot.keyMatchup}</p>}
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <TeamName team={game.away} />
              </h3>
              {capture.teamBreakdowns.away.length > 0 ? (
                <ul className="space-y-2 text-sm text-slate-300">
                  {capture.teamBreakdowns.away.map((text) => (
                    <li key={text.slice(0, 40)}>{text}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-600">No team-specific analysis captured.</p>
              )}
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <TeamName team={game.home} />
              </h3>
              {capture.teamBreakdowns.home.length > 0 ? (
                <ul className="space-y-2 text-sm text-slate-300">
                  {capture.teamBreakdowns.home.map((text) => (
                    <li key={text.slice(0, 40)}>{text}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-600">No team-specific analysis captured.</p>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Injury Concerns</h3>
            {capture.injuries.length > 0 ? (
              <ul className="space-y-2">
                {capture.injuries.map((injury) => (
                  <li key={injury.sentence} className="text-sm">
                    <span className="font-medium text-slate-300">{injury.team === "away" ? game.away.name : game.home.name}</span>
                    <p className="text-slate-400">{injury.sentence}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-600">No injury concerns mentioned in this capture's free analysis.</p>
            )}
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Uncommon / Noteworthy Angles</h3>
            {capture.uncommonAngles.length > 0 ? (
              <ul className="list-disc space-y-1 pl-4 text-sm text-slate-300">
                {capture.uncommonAngles.map((angle) => (
                  <li key={angle}>{angle}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-600">No uncommon angles flagged in this capture.</p>
            )}
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Betting View</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-slate-600">Pick</dt>
                <dd className="text-slate-200">{capture.betting.pick.spread ?? "N/A"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-600">Units</dt>
                <dd className="text-slate-200">{capture.betting.pick.units ?? "N/A"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-600">Total</dt>
                <dd className="text-slate-200">{capture.betting.total ?? "N/A"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-600">Line movement</dt>
                <dd className="text-slate-200">{capture.betting.lineMovement ?? "Not discussed"}</dd>
              </div>
            </dl>
            {capture.betting.vegasAction && <p className="mt-3 text-sm text-slate-400">{capture.betting.vegasAction}</p>}
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Update Timeline</h3>
            <UpdateTimeline delta={delta} />
          </section>

          <div className="text-sm">
            <a href={capture.source.url} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
              Open original WalterFootball analysis
            </a>
            <span className="ml-2 text-slate-600">
              Captured {new Date(capture.capturedAt).toLocaleString("en-US", { timeZone: "America/New_York" })} ET
            </span>
          </div>

          <SourceBreakdown capture={capture} />
        </>
      )}
    </div>
  );
}
