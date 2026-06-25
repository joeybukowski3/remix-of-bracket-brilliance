from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    if old not in text:
        raise SystemExit(f"Could not locate {label} in {path}")
    path.write_text(text.replace(old, new, 1))


generator = ROOT / "scripts/generate-mlb-numerology.mjs"

replace_once(
    generator,
    '''  const candidates = [];
  const seen = new Set();
  const universalYearRoot = dailyProfile.universalYear.root;
  const exclusionReasons = [];

  for (const batter of batters) {''',
    '''  const candidates = [];
  const seen = new Set();
  const universalYearRoot = dailyProfile.universalYear.root;
  const exclusionReasons = [];

  function collectNumberMatches(profile, playerName) {
    const exact = [];
    const root = [];
    const target = dailyProfile.universalDay.rawSum;
    const targetRoot = dailyProfile.universalDay.root;

    const addExact = (field, value, label) => {
      if (value === target) exact.push({ field, value, label });
    };
    const addRoot = (field, reduced, label) => {
      if (!reduced || reduced.original === target) return;
      if (reduced.root === targetRoot) root.push({ field, value: reduced.original, root: reduced.root, label });
    };

    addExact("jersey", profile.jerseyNumber, `Jersey #${profile.jerseyNumber}`);
    addExact("age", profile.age, `Age ${profile.age}`);
    addExact("birthDay", profile.birthDayNum?.original, `Born on day ${profile.birthDayNum?.original}`);
    addExact("personalDay", profile.personalDay?.original, `Personal Day ${profile.personalDay?.original}`);
    addExact("lifePath", profile.lifePath?.original, `Life Path ${profile.lifePath?.original}`);
    addExact("expression", profile.expressionNum?.original, `Expression ${profile.expressionNum?.original}`);

    addRoot("jersey", profile.jerseyReduced, `Jersey #${profile.jerseyNumber} → ${targetRoot}`);
    addRoot("age", profile.ageReduced, `Age ${profile.age} → ${targetRoot}`);
    addRoot("birthDay", profile.birthDayNum, `Birth day ${profile.birthDayNum?.original} → ${targetRoot}`);
    addRoot("personalDay", profile.personalDay, `Personal Day ${profile.personalDay?.original} → ${targetRoot}`);
    addRoot("lifePath", profile.lifePath, `Life Path ${profile.lifePath?.original} → ${targetRoot}`);
    addRoot("expression", profile.expressionNum, `Expression ${profile.expressionNum?.original} → ${targetRoot}`);

    return { exact, root, playerName };
  }

  for (const batter of batters) {''',
    "candidate initialization",
)

replace_once(
    generator,
    '''    const age = ageOnDate(birthDate, slateDate);

    let lpNum = null, birthDayNum = null, pdResult = null;''',
    '''    const age = ageOnDate(birthDate, slateDate);
    const ageReduced = age != null ? reduce(age) : null;

    let lpNum = null, birthDayNum = null, pdResult = null;''',
    "age reduction",
)

replace_once(
    generator,
    '''    const playerNumerology = {
      jerseyReduced, battingOrder, age,
      personalDay: pdResult, lifePath: lpNum, birthDayNum,
      expressionNum: exprNum,
    };''',
    '''    const playerNumerology = {
      jerseyNumber: jerseyNum,
      jerseyReduced,
      battingOrder,
      age,
      ageReduced,
      personalDay: pdResult,
      lifePath: lpNum,
      birthDayNum,
      expressionNum: exprNum,
    };
    const numberMatches = collectNumberMatches(playerNumerology, batter.player);''',
    "player numerology profile",
)

replace_once(
    generator,
    '''      convergenceBonus,
      missingData,
      hrScore: batter.hrScore,
    });''',
    '''      convergenceBonus,
      exactNumberMatches: numberMatches.exact,
      rootNumberMatches: numberMatches.root,
      missingData,
      hrScore: batter.hrScore,
    });''',
    "candidate number matches",
)

replace_once(
    generator,
    '''  const countercurrents = candidates.filter(c => c.countercurrentTotal > 0 && c.numerologyScore < 40).slice(0, 3);
  const confirmedCount = candidates.filter(c => c.lineupStatus === "confirmed").length;''',
    '''  const countercurrents = candidates.filter(c => c.countercurrentTotal > 0 && c.numerologyScore < 40).slice(0, 3);
  const exactNumberMatches = candidates
    .filter(c => c.exactNumberMatches.length > 0)
    .sort((a, b) => b.exactNumberMatches.length - a.exactNumberMatches.length || b.numerologyScore - a.numerologyScore || a.playerName.localeCompare(b.playerName));
  const rootNumberMatches = candidates
    .filter(c => c.exactNumberMatches.length === 0 && c.rootNumberMatches.length > 0)
    .sort((a, b) => b.rootNumberMatches.length - a.rootNumberMatches.length || b.numerologyScore - a.numerologyScore || a.playerName.localeCompare(b.playerName));
  const confirmedCount = candidates.filter(c => c.lineupStatus === "confirmed").length;''',
    "number match collections",
)

replace_once(
    generator,
    '''    featuredPlays: featured.map(c => ({''',
    '''    exactNumberMatches: exactNumberMatches.map(c => ({
      playerId: c.personId ?? null,
      playerName: c.playerName,
      team: c.team,
      opponent: c.opponent,
      opposingPitcher: c.opposingPitcher,
      lineupStatus: c.lineupStatus,
      battingOrder: c.battingOrder,
      jerseyNumber: c.jerseyNumber,
      numerologyScore: c.numerologyScore,
      baseballScore: c.baseballScore,
      matches: c.exactNumberMatches,
      recommendedMarket: c.recommendedMarket,
      marketScore: c.marketScore,
    })),
    rootNumberMatches: rootNumberMatches.map(c => ({
      playerId: c.personId ?? null,
      playerName: c.playerName,
      team: c.team,
      opponent: c.opponent,
      opposingPitcher: c.opposingPitcher,
      lineupStatus: c.lineupStatus,
      battingOrder: c.battingOrder,
      jerseyNumber: c.jerseyNumber,
      numerologyScore: c.numerologyScore,
      baseballScore: c.baseballScore,
      matches: c.rootNumberMatches,
      recommendedMarket: c.recommendedMarket,
      marketScore: c.marketScore,
    })),
    featuredPlays: featured.map(c => ({''',
    "output match lists",
)

replace_once(
    generator,
    '''  // Candidate pool disclosure
  if (!output.candidatePool) errors.push("Missing candidatePool disclosure");''',
    '''  // Candidate pool disclosure
  if (!output.candidatePool) errors.push("Missing candidatePool disclosure");
  if (!Array.isArray(output.exactNumberMatches) || !Array.isArray(output.rootNumberMatches)) {
    errors.push("Missing full daily number match lists");
  }
  for (const player of output.exactNumberMatches ?? []) {
    if (!player.matches?.length) errors.push(`Exact match entry missing reasons: ${player.playerName}`);
  }''',
    "output validation",
)

page = ROOT / "src/pages/MlbNumerologyPage.tsx"
replace_once(
    page,
    '''type ExtendedNumerologyData = NumerologyDailyData & {
  bestAvailable?: NumerologyPlay[];''',
    '''type NumberMatch = {
  field: string;
  value: number;
  root?: number;
  label: string;
};

type NumberMatchPlayer = {
  playerId?: number | null;
  playerName: string;
  team: string;
  opponent: string;
  opposingPitcher?: string | null;
  lineupStatus: NumerologyPlay["lineupStatus"];
  battingOrder?: number | null;
  jerseyNumber?: number | null;
  numerologyScore: number;
  baseballScore: number;
  matches: NumberMatch[];
  recommendedMarket?: string;
  marketScore?: number | null;
};

type ExtendedNumerologyData = NumerologyDailyData & {
  exactNumberMatches?: NumberMatchPlayer[];
  rootNumberMatches?: NumberMatchPlayer[];
  bestAvailable?: NumerologyPlay[];''',
    "number match types",
)

insert_marker = '''function PlayCard({ play }: { play: NumerologyPlay }) {'''
number_component = '''function NumberMatchList({
  title,
  subtitle,
  players,
  accent,
}: {
  title: string;
  subtitle: string;
  players: NumberMatchPlayer[];
  accent: "exact" | "root";
}) {
  const [expanded, setExpanded] = useState(accent === "exact");
  const visible = expanded ? players : players.slice(0, 8);
  const exact = accent === "exact";

  return (
    <section className="rounded-2xl border border-white/10 bg-[#0a1628] p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={`text-[9px] font-bold uppercase tracking-[0.2em] ${exact ? "text-amber-300/70" : "text-violet-300/60"}`}>
            {exact ? "Direct daily-number matches" : "Reduced-root matches"}
          </p>
          <h2 className="mt-1 text-base font-black text-white">{title}</h2>
          <p className="mt-1 max-w-2xl text-[11px] leading-5 text-white/40">{subtitle}</p>
        </div>
        <span className={`rounded-full px-3 py-1 font-mono text-xs font-black ${exact ? "bg-amber-400/15 text-amber-200" : "bg-violet-400/15 text-violet-200"}`}>
          {players.length} players
        </span>
      </div>

      {players.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-white/35">No players in today&apos;s candidate pool match this level.</div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((player) => (
            <div key={`${player.playerName}-${player.team}`} className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
              <div className="flex items-start gap-2.5">
                {player.playerId != null && (
                  <MlbPlayerHeadshot playerId={player.playerId} name={player.playerName} teamAbbreviation={player.team} size={38} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-xs font-bold text-white">{player.playerName}</span>
                    <span className="text-[10px] text-white/30">{player.team} vs {player.opponent}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {player.matches.map((match) => (
                      <span key={`${match.field}-${match.label}`} className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${exact ? "bg-amber-400/15 text-amber-200" : "bg-violet-400/15 text-violet-200"}`}>
                        {match.label}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-[9px] text-white/30">
                    <span>Alignment <strong className="text-violet-300">{player.numerologyScore}</strong></span>
                    <span>Baseball context <strong className="text-sky-300">{player.baseballScore}</strong></span>
                    {player.battingOrder != null && <span>Batting #{player.battingOrder}</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {players.length > 8 && (
        <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-3 w-full rounded-lg border border-white/8 py-2 text-[10px] font-bold text-white/45 transition hover:bg-white/5 hover:text-white/70">
          {expanded ? "Show fewer" : `Show all ${players.length} players`}
        </button>
      )}
    </section>
  );
}

'''
if insert_marker not in page.read_text():
    raise SystemExit("Could not locate PlayCard insertion point")
page.write_text(page.read_text().replace(insert_marker, number_component + insert_marker, 1))

replace_once(
    page,
    '''      {bestAvailable.length > 0 && (
        <section>
          <SectionLabel>Best Available Alignments</SectionLabel>''',
    '''      <div className="space-y-4">
        <NumberMatchList
          title={`Exact ${data.dailyProfile.universalDayRawSum} matches`}
          subtitle={`Every evaluated player with an exact ${data.dailyProfile.universalDayRawSum} connection, including jersey number, age, birth day, Personal Day, Life Path or Expression number. This list is not limited by the overall alignment score.`}
          players={data.exactNumberMatches ?? []}
          accent="exact"
        />
        <NumberMatchList
          title={`Root ${data.dailyProfile.universalDayRoot} matches`}
          subtitle={`Every remaining evaluated player whose number reduces to today's root ${data.dailyProfile.universalDayRoot}. Exact ${data.dailyProfile.universalDayRawSum} matches remain separated above.`}
          players={data.rootNumberMatches ?? []}
          accent="root"
        />
      </div>

      {bestAvailable.length > 0 && (
        <section>
          <SectionLabel>Highest Overall Numerology Scores</SectionLabel>''',
    "number lists placement",
)

replace_once(
    page,
    '''            Best available today — below the featured-play threshold (60). No player on today&apos;s slate has reached the numerology-only qualifying threshold.''',
    '''            These are the highest aggregate numerology scores, not the complete list of players matching today&apos;s number. Exact and root matches are listed above.''',
    "best available explanation",
)

print("Applied full exact-number and root-match lists.")
