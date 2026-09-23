"""Source-to-output checks for the offline QB/trench study."""
import unittest
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/nfl/research/qb-pressure-trench"


class ResearchOutputTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.games = pd.read_csv(OUT / "game_interactions.csv")

    def test_identity_and_previous_game_cutoff(self):
        games = self.games
        self.assertEqual(len(games), 2238)
        self.assertFalse(games.duplicated(["game_id", "team"]).any())
        kickoff = dict(zip(games.game_id, games.kickoff_utc))
        for rec in games[games.expected_qb_id.notna()].itertuples():
            if rec.expected_qb_source == "archived_week2_prediction":
                self.assertLess(rec.expected_qb_source_timestamp, rec.kickoff_utc)
            else:
                self.assertLess(kickoff[rec.expected_qb_source_game], rec.kickoff_utc)
            self.assertGreaterEqual(rec.qb_prior_dropbacks, 0)
        self.assertTrue(games[games.historical_pass_rush_edge_z.notna()].defense_prior_games.ge(4).all())
        self.assertTrue(games[games.historical_pass_rush_edge_z.notna()].offense_prior_games.ge(4).all())
        self.assertTrue((games.ats_margin - games.score_margin - games.team_spread).abs().lt(1e-9).all())
        for game_id, pair in games.groupby("game_id"):
            self.assertEqual(len(pair), 2, game_id)
            self.assertAlmostEqual(pair.ats_margin.sum(), 0, msg=game_id)

    def test_2026_defensive_hit_rating_uses_prior_games_only(self):
        games = self.games
        row = games[(games.game_id == "2026_02_GB_NYJ") & (games.team == "gb")].iloc[0]
        stats = pd.concat([pd.read_csv(ROOT / f"data/nfl/nflverse/stats-team-week/stats_team_week_2025.csv"),
                           pd.read_csv(ROOT / "data/nfl/nflverse/stats-team-week-current/stats_team_week_2026.csv")])
        epa = pd.concat([pd.read_csv(ROOT / "data/nfl/nflverse/epa-team-game/epa_team_game_2025.csv"),
                         pd.read_csv(ROOT / "data/nfl/nflverse/epa-team-game/epa_team_game_2026.csv")])
        nyj = stats[(stats.team == "NYJ") & (stats.season_type == "REG") &
                    ((stats.season == 2025) | ((stats.season == 2026) & (stats.week == 1)))].sort_values(["season", "week"]).tail(8)
        dropbacks = 0
        for s in nyj.itertuples():
            opponent = str(s.opponent_team).lower()
            e = epa[(epa.game_id == s.game_id) & (epa.team == opponent)]
            self.assertEqual(len(e), 1)
            dropbacks += e.iloc[0].pass_plays
        self.assertAlmostEqual(row.defense_prior_hit_rate, nyj.def_qb_hits.sum() / dropbacks)
        self.assertEqual(len(nyj), 8)

    def test_2026_overlay_does_not_invent_qb_results(self):
        overlay = pd.read_csv(OUT / "overlay_2026.csv")
        self.assertEqual(len(overlay), 7)
        self.assertTrue(overlay.qb_actual_from_weekly_cache.isna().all())
        self.assertTrue(overlay.pregame_projected_qb.notna().all())
        self.assertTrue(overlay.pregame_qb_snapshot_at.notna().all())
        self.assertTrue(overlay.expected_matches_actual.isna().all())
        seattle = overlay[(overlay.defense == "ari") & (overlay.qb_team == "sea")].iloc[0]
        self.assertEqual(seattle.pregame_projected_qb, "Sam Darnold")
        self.assertFalse(bool(seattle.projected_vs_week1_incumbent))
        self.assertTrue(self.games[(self.games.season == 2026) & (self.games.week == 1)].expected_qb_id.isna().all())


if __name__ == "__main__":
    unittest.main()
