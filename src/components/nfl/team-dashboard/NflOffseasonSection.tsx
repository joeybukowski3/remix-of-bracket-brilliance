import { getNflOffseasonProfile, type NflPlayerMove } from "@/data/nflOffseason2026";
import { getNflSeasonGuide, type NflGuideTeamNormalized } from "@/lib/nfl/guideData";
import { SectionHeading } from "./NflDashboardUi";

const GUIDE_TEAM_BY_ABBR = getNflSeasonGuide(2026)!.teamByAbbr;

export default function NflOffseasonSection({ team }: { team: NflGuideTeamNormalized }) {
  const offseason = getNflOffseasonProfile(team.abbr);

  return (
    <section>
      <SectionHeading
        eyebrow="2025 → 2026"
        title="Coaching and notable player changes"
        description="A team-specific view of the head-coach transition plus notable free-agent and trade movement. The player list is selective, not a complete transaction log."
      />
      <div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xl font-black text-slate-900">Head coach</h3>
            <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${offseason.status === "Changed" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"}`}>
              {offseason.status}
            </span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <CoachCard year="2025" coach={offseason.headCoach2025} muted />
            <CoachCard year="2026" coach={offseason.headCoach2026} />
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-600">{offseason.note}</p>
        </article>
        <div className="grid gap-6 md:grid-cols-2">
          <MoveCard title="Key additions" moves={offseason.additions} direction="in" />
          <MoveCard title="Key departures" moves={offseason.departures} direction="out" />
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-5 text-slate-400">
        Offseason snapshot updated through {formatVerifiedDate(offseason.verifiedAt)}. Draft picks and minor transactions are not included.
      </p>
    </section>
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
    <div className={`rounded-xl border p-4 ${muted ? "border-slate-200 bg-slate-50" : "border-blue-200 bg-blue-50"}`}>
      <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{year}</div>
      <div className="mt-1 text-lg font-black text-slate-900">{coach}</div>
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
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className={`text-lg font-black ${direction === "in" ? "text-emerald-800" : "text-red-700"}`}>
        {title}
      </h3>
      <div className="mt-3 divide-y divide-slate-100">
        {moves.length === 0 ? (
          <p className="py-4 text-sm leading-6 text-slate-500">
            No notable move is included in the current snapshot.
          </p>
        ) : moves.slice(0, 8).map((move) => {
          const otherAbbr = direction === "in" ? move.from : move.to;
          const otherTeam = GUIDE_TEAM_BY_ABBR.get(otherAbbr)?.teamName ?? otherAbbr.toUpperCase();
          return (
            <div key={`${move.player}-${move.from}-${move.to}`} className="flex items-start justify-between gap-3 py-3">
              <div>
                <div className="font-black text-slate-900">{move.player}</div>
                <div className="mt-0.5 text-xs text-slate-500">{move.position} · {move.method}</div>
              </div>
              <div className="text-right text-xs font-bold text-slate-500">
                {direction === "in" ? "From" : "To"} {otherTeam}
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function formatVerifiedDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(date);
}
