"""Source-to-output checks for Phase 3 research artifacts."""
import importlib.util
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/nfl/research/trench-offensive-disruption"
SOURCE = ROOT / "scripts/research/nfl-trench-offensive-disruption-study.py"


class Phase3Checks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = pd.read_csv(OUT / "game_level.csv", low_memory=False)

    def test_unique_oriented_game_rows_and_market(self):
        g = self.rows
        self.assertFalse(g.duplicated(["game_id", "team"]).any())
        self.assertTrue(g.groupby("game_id").size().eq(2).all())
        for _, pair in g.groupby("game_id"):
            a, b = pair.iloc[0], pair.iloc[1]
            self.assertEqual(a.team, b.opponent)
            self.assertEqual(a.opponent, b.team)
            self.assertEqual(a.team_points, b.opponent_points)
            self.assertAlmostEqual(a.team_spread, -b.team_spread)
            self.assertAlmostEqual(a.ats_margin, -b.ats_margin)
        h = g[g.season <= 2025]
        self.assertTrue(np.allclose(h.implied_team_total, (h.closing_total-h.team_spread)/2))
        self.assertTrue(np.allclose(g.team_total_margin, g.team_points-g.implied_team_total))
        self.assertFalse(h.implied_team_total.isna().any())

    def test_representative_market_orientation_by_hand(self):
        g = self.rows.set_index(["game_id", "team"])
        # 2022 Week 5 IND at DEN: total 42, DEN -3.5, final DEN 9 IND 12.
        den = g.loc[("2022_05_IND_DEN", "den")]
        ind = g.loc[("2022_05_IND_DEN", "ind")]
        self.assertEqual((den.implied_team_total, ind.implied_team_total), (22.75, 19.25))
        self.assertEqual((den.team_total_margin, ind.team_total_margin), (-13.75, -7.25))
        # 2022 Week 5 NYG at GB: total 42, GB -8.5, final GB 22 NYG 27.
        gb = g.loc[("2022_05_NYG_GB", "gb")]
        nyg = g.loc[("2022_05_NYG_GB", "nyg")]
        self.assertEqual((gb.implied_team_total, nyg.implied_team_total), (25.25, 16.75))
        self.assertEqual((gb.team_total_margin, nyg.team_total_margin), (-3.25, 10.25))

    def test_denominator_and_epa_aggregation(self):
        g = self.rows
        self.assertTrue(np.allclose(g.team_sack_rate, g.team_sacks/g.pass_plays, equal_nan=True))
        self.assertTrue(np.allclose(g.team_pass_epa_db, g.team_pass_epa/g.pass_plays, equal_nan=True))
        den = g[(g.game_id == "2022_05_IND_DEN") & (g.team == "den")].iloc[0]
        self.assertAlmostEqual(den.team_sack_rate, 4/46)
        self.assertAlmostEqual(den.team_pass_epa_db, -9.795922/46, places=6)

    def test_pregame_edge_and_prior_baseline(self):
        g = self.rows
        p2 = pd.read_csv(ROOT / "data/nfl/research/qb-pressure-trench/game_interactions.csv")
        merged = g.merge(p2[["game_id", "team", "historical_pass_rush_edge_z", "defense_prior_games",
                             "offense_prior_games"]], on=["game_id", "team"], suffixes=("", "_p2"),
                         validate="one_to_one")
        self.assertTrue(np.allclose(merged.historical_pass_rush_edge_z,
                                    merged.historical_pass_rush_edge_z_p2, equal_nan=True))
        available = g[g.historical_pass_rush_edge_z.notna()]
        self.assertTrue(available.defense_prior_games.ge(4).all())
        self.assertTrue(available.offense_prior_games.ge(4).all())
        # Independently recompute a 2022 Week 5 GB prior-eight baseline from
        # 2021 and 2022 Weeks 1-4, excluding the Week 5 result.
        gb = g[(g.game_id == "2022_05_NYG_GB") & (g.team == "gb")].iloc[0]
        e21 = pd.read_csv(ROOT / "data/nfl/nflverse/epa-team-game/epa_team_game_2021.csv")
        e22 = pd.read_csv(ROOT / "data/nfl/nflverse/epa-team-game/epa_team_game_2022.csv")
        prior = pd.concat([e21, e22])
        prior = prior[(prior.team == "gb") & ((prior.season == 2021) |
                                            ((prior.season == 2022) & (prior.week < 5)))]
        prior = prior.sort_values(["season", "week"]).tail(8)
        self.assertAlmostEqual(gb.prior8_pass_epa_db, prior.pass_epa.sum()/prior.pass_plays.sum())
        self.assertAlmostEqual(gb.pass_epa_vs_prior8, gb.team_pass_epa_db-gb.prior8_pass_epa_db)

    def test_2026_week2_snapshot_and_seven(self):
        o = pd.read_csv(OUT / "overlay_2026.csv")
        self.assertEqual(len(o), 32)
        self.assertEqual(int(o.espn_edge_10_plus.sum()), 7)
        self.assertTrue((o.espn_rank_edge == o.espn_opponent_pbwr_rank-o.espn_prwr_rank).all())
        week2 = self.rows[(self.rows.season == 2026) & (self.rows.week == 2)]
        self.assertTrue(week2.espn_rating_through_week.eq(1).all())
        self.assertTrue(week2.kickoff_utc.str.startswith("2026-09").all())


if __name__ == "__main__":
    unittest.main()
