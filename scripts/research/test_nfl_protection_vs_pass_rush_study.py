"""Phase 4 chronology, source, orientation, quintile and matrix checks."""
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/nfl/research/protection-vs-pass-rush"


class Phase4Checks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.game = pd.read_csv(OUT / "game_level.csv")
        cls.source = pd.read_csv(ROOT / "data/nfl/research/trench-offensive-disruption/game_level.csv", low_memory=False)

    def test_unique_orientation_and_source_aggregations(self):
        g = self.game
        self.assertEqual(len(g), 2238)
        self.assertFalse(g.duplicated(["game_id", "team"]).any())
        self.assertTrue(g.groupby("game_id").size().eq(2).all())
        self.assertTrue(np.allclose(g.team_sack_rate, g.team_sacks/g.pass_plays))
        self.assertTrue(np.allclose(g.team_pass_epa_db, g.team_pass_epa/g.pass_plays))
        for _, pair in g.groupby("game_id"):
            a, b = pair.iloc[0], pair.iloc[1]
            self.assertEqual(a.opponent, b.team)
            self.assertEqual(a.team, b.opponent)
        src = self.source[["game_id", "team", "team_sacks", "team_pass_epa", "team_points"]]
        joined = g.merge(src, on=["game_id", "team"], suffixes=("", "_src"), validate="one_to_one")
        for col in ["team_sacks", "team_pass_epa", "team_points"]:
            self.assertTrue(np.allclose(joined[col], joined[col+"_src"]))

    def test_manual_prior_four_and_excludes_current_game(self):
        g = self.game.set_index(["game_id", "team"])
        target = g.loc[("2022_05_IND_DEN", "den")]
        previous = self.source[(self.source.team == "den") & (self.source.season == 2022) &
                               (self.source.week < 5)].sort_values("week").tail(4)
        self.assertEqual(len(previous), 4)
        expected = previous.actual_hits_allowed.sum()/previous.pass_plays.sum()
        self.assertAlmostEqual(target.protection_raw_prior4, expected)
        self.assertAlmostEqual(target.protection_raw_prior8, expected)
        # The defense rating for DEN is on the IND offense row: DEN's prior
        # generated hits are what DEN's prior opponents allowed.
        defense_row = g.loc[("2022_05_IND_DEN", "ind")]
        den_prior = self.source[(self.source.team == "den") & (self.source.season == 2022) &
                                (self.source.week < 5)].sort_values("week").tail(4)
        opponent_rows = self.source.merge(den_prior[["game_id", "opponent"]],
                                          left_on=["game_id", "team"], right_on=["game_id", "opponent"])
        self.assertAlmostEqual(defense_row.pass_rush_raw_prior8,
                               opponent_rows.actual_hits_allowed.sum()/opponent_rows.pass_plays.sum())
        self.assertEqual(target.offense_prior_games, 4)
        self.assertEqual(defense_row.defense_prior_games, 4)

    def test_components_match_phase_two_and_quintile_orientation(self):
        g = self.game
        p2 = pd.read_csv(ROOT / "data/nfl/research/qb-pressure-trench/team_pregame_hit_ratings.csv")
        j = g.merge(p2, on=["game_id", "team"], suffixes=("", "_p2"), validate="one_to_one")
        self.assertTrue(np.allclose(j.protection_raw_prior8, j.offense_prior_hit_allowed_rate,
                                    equal_nan=True, atol=1e-12))
        self.assertTrue(np.allclose(j.pass_rush_raw_prior8, j.defense_prior_hit_rate,
                                    equal_nan=True, atol=1e-12))
        self.assertTrue(np.allclose(j.additive_matchup_z, j.historical_pass_rush_edge_z_p2,
                                    equal_nan=True, atol=1e-12))
        for pct, quint in [("protection_percentile", "protection_quintile"),
                           ("pass_rush_percentile", "rush_quintile")]:
            valid = g[g[pct].notna()]
            self.assertTrue(valid[quint].between(0, 4).all())
            self.assertTrue((valid[quint] == np.minimum(np.floor(valid[pct]*5), 4)).all())
        self.assertTrue(g[g.protection_quintile == 4].protection_z.mean() >
                        g[g.protection_quintile == 0].protection_z.mean())
        self.assertTrue(g[g.rush_quintile == 4].pass_rush_z.mean() >
                        g[g.rush_quintile == 0].pass_rush_z.mean())

    def test_rush_stability_tracks_defense_identity(self):
        pairs = pd.read_csv(OUT / "pass_rush_stability_pairs.csv")
        den = pairs[(pairs.game_id == "2022_05_IND_DEN") & (pairs.team == "den")].iloc[0]
        offense_row = self.game[(self.game.game_id == "2022_05_IND_DEN") &
                                (self.game.team == "ind")].iloc[0]
        self.assertAlmostEqual(den.pregame_prior8, offense_row.pass_rush_raw_prior8)
        self.assertAlmostEqual(den.pregame_percentile, offense_row.pass_rush_percentile)

    def test_matrix_membership_and_split(self):
        g = self.game[(self.game.season <= 2025) & self.game.protection_z.notna() &
                      self.game.pass_rush_z.notna()]
        matrix = pd.read_csv(OUT / "interaction_matrix.csv")
        self.assertEqual(len(g), 2046)
        self.assertEqual(len(g[g.season <= 2023]), 958)
        self.assertEqual(len(g[g.season >= 2024]), 1088)
        for window, rows in [("2022-2023 exploratory", g[g.season <= 2023]),
                             ("2024-2025 heldout", g[g.season >= 2024]),
                             ("2022-2025 full", g)]:
            m = matrix[matrix.window == window]
            self.assertEqual(len(m), 25)
            self.assertEqual(m.n.sum(), len(rows))
            for cell in m.itertuples():
                expected = rows[(rows.protection_quintile == cell.protection_quintile-1) &
                                (rows.rush_quintile == cell.rush_quintile-1)]
                self.assertEqual(cell.n, len(expected))
                self.assertAlmostEqual(cell.mean_team_sack_rate, expected.team_sack_rate.mean())

    def test_2026_espn_snapshot(self):
        o = pd.read_csv(OUT / "overlay_2026.csv")
        self.assertEqual(len(o), 32)
        self.assertTrue((o.espn_defensive_rank_edge == o.espn_pbwr_rank-o.espn_opponent_prwr_rank).all())
        self.assertEqual((o.espn_defensive_rank_edge >= 10).sum(), 7)
        self.assertTrue(o.protection_percentile.between(0, 1).all())
        self.assertTrue(o.pass_rush_percentile.between(0, 1).all())


if __name__ == "__main__":
    unittest.main()
