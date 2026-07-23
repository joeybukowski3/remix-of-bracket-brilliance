type StartFixture = {
  gamePk: number;
  date: string;
  isHome: boolean;
  inningsPitched: string;
  strikeOuts: number;
  hits: number;
  numberOfPitches?: number;
  pitchesThrown?: number;
};

function gameLogSplit(start: StartFixture) {
  return {
    season: "2026",
    date: start.date,
    isHome: start.isHome,
    game: { gamePk: start.gamePk },
    opponent: { id: start.isHome ? 147 : 111 },
    stat: {
      gamesStarted: 1,
      inningsPitched: start.inningsPitched,
      strikeOuts: start.strikeOuts,
      hits: start.hits,
      numberOfPitches: start.numberOfPitches,
      pitchesThrown: start.pitchesThrown,
      battersFaced: 24,
    },
  };
}

const starts: StartFixture[] = [
  { gamePk: 1000, date: "2026-07-23", isHome: true, inningsPitched: "6.0", strikeOuts: 12, hits: 1, numberOfPitches: 100 },
  { gamePk: 1001, date: "2026-07-20", isHome: true, inningsPitched: "5.2", strikeOuts: 8, hits: 4, numberOfPitches: 95 },
  { gamePk: 1002, date: "2026-07-18", isHome: false, inningsPitched: "6.1", strikeOuts: 7, hits: 3, numberOfPitches: 98 },
  { gamePk: 1003, date: "2026-07-16", isHome: true, inningsPitched: "6.0", strikeOuts: 6, hits: 5, numberOfPitches: 90 },
  { gamePk: 1004, date: "2026-07-14", isHome: false, inningsPitched: "5.1", strikeOuts: 4, hits: 6, pitchesThrown: 87 },
  { gamePk: 1005, date: "2026-07-12", isHome: true, inningsPitched: "7.0", strikeOuts: 9, hits: 3, numberOfPitches: 101 },
  { gamePk: 1006, date: "2026-07-10", isHome: false, inningsPitched: "6.0", strikeOuts: 6, hits: 5, numberOfPitches: 92 },
  { gamePk: 1007, date: "2026-07-08", isHome: true, inningsPitched: "5.0", strikeOuts: 5, hits: 6, numberOfPitches: 84 },
  { gamePk: 1008, date: "2026-07-06", isHome: false, inningsPitched: "7.2", strikeOuts: 10, hits: 2, numberOfPitches: 105 },
  { gamePk: 1009, date: "2026-07-04", isHome: true, inningsPitched: "6.1", strikeOuts: 7, hits: 4, numberOfPitches: 99 },
  { gamePk: 1010, date: "2026-07-02", isHome: false, inningsPitched: "5.0", strikeOuts: 5, hits: 7, numberOfPitches: 82 },
  { gamePk: 1011, date: "2026-06-30", isHome: true, inningsPitched: "4.2", strikeOuts: 3, hits: 7, numberOfPitches: 78 },
  { gamePk: 1012, date: "2026-06-28", isHome: false, inningsPitched: "6.2", strikeOuts: 8, hits: 4, numberOfPitches: 100 },
];

export const pitcherGameLogSplitsFixture = [
  ...starts.map(gameLogSplit),
  gameLogSplit(starts[1]),
];

export const pitcherGameLogResponseFixture = {
  stats: [{ splits: pitcherGameLogSplitsFixture }],
};
