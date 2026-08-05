import { getNflOffseasonProfile, type NflPlayerMove } from "@/data/nflOffseason2026";
import NflProvenanceDetails from "@/components/nfl/provenance/NflProvenanceDetails";
import { getNflSeasonGuide, type NflGuideTeamNormalized } from "@/lib/nfl/guideData";
import NflSection from "@/components/nfl/ui/NflSection";

const GUIDE_TEAM_BY_ABBR = getNflSeasonGuide(2026)!.teamByAbbr;

export default function NflOffseasonSection({ team }: { team: NflGuideTeamNormalized }) {
  const offseason = getNflOffseasonProfile(team.abbr);

  return (
    // Supporting context rather than the headline: collapsed on mobile so the
    // schedule and the model figures are not buried under it.
    <NflSection
      eyebrow="2025 → 2026"
      title="Coaching and notable player changes"
      subtitle="A team-specific view of the head-coach transition plus notable free-agent and trade movement. The player list is selective, not a complete transaction log."
      collapse="mobile"
      defaultOpen={false}
    >
      <div className="grid gap-4 xl:grid-cols-[.8fr_1.2fr]">
        <article className="rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">Head coach</h3>
            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${offseason.status === "Changed" ? "border-sky-300 bg-sky-50 text-sky-800" : "border-slate-300 bg-slate-50 text-slate-600"}`}>
              {offseason.status}
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <CoachCard year="2025" coach={offseason.headCoach2025} muted />
            <CoachCard year="2026" coach={offseason.headCoach2026} />
          </div>
          <p className="mt-3 text-[13px] leading-6 text-slate-600">{offseason.note}</p>
        </article>
        <div className="grid gap-4 md:grid-cols-2">
          <MoveCard title="Key additions" moves={offseason.additions} direction="in" />
          <MoveCard title="Key departures" moves={offseason.departures} direction="out" />
        </div>
      </div>
      <div className="mt-3">
        <NflProvenanceDetails
          provenance={{
            sourceKind: "editorial",
            sourceLabel: "JoeKnowsBall offseason snapshot",
            sourceUpdatedAt: offseason.verifiedAt,
            season: 2026,
          }}
        />
        <p className="mt-1 text-[11px] leading-5 text-slate-500">
          Draft picks and minor transactions are not included.
        </p>
      </div>
    </NflSection>
  );
}

function CoachCard({
  year,
  coach,
  muted = false,
}: {
  year: string;
  coach: string;
  muted?: boolean;
}) {
  return (
    <div className={`rounded border p-3 ${muted ? "border-slate-200 bg-slate-50" : "border-sky-200 bg-sky-50"}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{year}</div>
      <div className="mt-0.5 text-sm font-semibold text-slate-900">{coach}</div>
    </div>
  );
}

function MoveCard({
  title,
  moves,
  direction,
}: {
  title: string;
  moves: NflPlayerMove[];
  direction: "in" | "out";
}) {
  return (
    <article className="rounded-lg border border-slate-200 p-4">
      <h3 className={`text-sm font-semibold ${direction === "in" ? "text-emerald-800" : "text-red-800"}`}>
        {title}
      </h3>
      <div className="mt-2 divide-y divide-slate-100">
        {moves.length === 0 ? (
          <p className="py-4 text-sm leading-6 text-slate-500">
            No notable move is included in the current snapshot.
          </p>
        ) : moves.slice(0, 8).map((move) => {
          const otherAbbr = direction === "in" ? move.from : move.to;
          const otherTeam = GUIDE_TEAM_BY_ABBR.get(otherAbbr)?.teamName ?? otherAbbr.toUpperCase();
          return (
            <div key={`${move.player}-${move.from}-${move.to}`} className="flex items-start justify-between gap-3 py-2">
              <div>
                <div className="text-sm font-semibold text-slate-900">{move.player}</div>
                <div className="mt-0.5 text-xs text-slate-500">{move.position} · {move.method}</div>
              </div>
              <div className="text-right text-xs text-slate-500">
                {direction === "in" ? "From" : "To"} {otherTeam}
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
