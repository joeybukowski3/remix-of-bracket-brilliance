import { FLAG_LABEL, FLAG_WHY, LONG_WINDOW, STABLE_BAND, type ResearchProfile } from "@/lib/nba/props/researchTier";

const minutes = (n: number): string => n.toFixed(1);

/**
 * Why a player sits in a research tier, in words: the recent median minutes (an informational baseline beside the model's own
 * minutes, which stay unchanged), the ten-game spread, missed team games, and every flag with its reason. Shown in the expanded
 * row under "This season". Nothing here is a projection input.
 */
export default function ResearchNotes({ research, jkbMinutes }: { research: ResearchProfile | null; jkbMinutes: number | null }) {
  if (!research) return null;
  const { consistency, baselineMinutes, missedTeamGames, flags } = research;
  const ten = consistency.last10;
  return (
    <div className="mt-2 space-y-1 border-t border-slate-100 pt-1.5 text-[11px] text-slate-600" data-testid="research-notes">
      <p data-testid="research-reason">{research.reason}</p>
      {baselineMinutes !== null ? (
        <p data-testid="research-baseline">
          Recent median: <strong className="font-semibold text-slate-800">{minutes(baselineMinutes)} min</strong> over the last 5 games (a baseline for reading, not the model's input)
          {jkbMinutes !== null ? <>; the JKB model uses {minutes(jkbMinutes)}</> : null}.
        </p>
      ) : null}
      {ten ? (
        <p data-testid="research-spread">
          Last {ten.games} games: median {minutes(ten.median)}, range {minutes(ten.min)}–{minutes(ten.max)}, SD {minutes(ten.sd)}; {ten.within} of {ten.games} within {STABLE_BAND * 100}% of the median
          {ten.games < LONG_WINDOW ? " (a shorter window, not padded to ten)" : ""}.
        </p>
      ) : null}
      {missedTeamGames ? (
        <p data-testid="research-missed">
          {missedTeamGames.missed === 0 ? `Played all of the team's last ${missedTeamGames.of} games.` : `Missed ${missedTeamGames.missed} of the team's last ${missedTeamGames.of} games. Injury, rest and a coach's decision cannot be told apart in this data.`}
        </p>
      ) : (
        <p data-testid="research-missed">Missed-game tracking is not on this board; rebuild the private preview board to add it.</p>
      )}
      {flags.length > 0 ? (
        <ul className="list-disc space-y-0.5 pl-4" data-testid="research-flag-list">
          {flags.map((flag) => (
            <li key={flag} data-flag={flag}>
              <strong className="font-semibold text-slate-800">{FLAG_LABEL[flag]}.</strong> {FLAG_WHY[flag]}.
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
