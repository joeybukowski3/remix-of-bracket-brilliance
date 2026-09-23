"""Source-to-output and no-look-ahead checks for Phase 5."""
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/nfl/research/protection-decomposition"


class Phase5Checks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.games = pd.read_csv(OUT / "game_level.csv", low_memory=False)
        cls.adjustment = pd.read_csv(OUT / "opponent_adjustment.csv")
        cls.phase4 = pd.read_csv(ROOT / "data/nfl/research/protection-vs-pass-rush/game_level.csv")

    def test_identity_orientation_and_raw_baseline(self):
        g = self.games
        self.assertEqual(len(g), 2238)
        self.assertFalse(g.duplicated(["game_id", "team"]).any())
        self.assertTrue(g.groupby("game_id").size().eq(2).all())
        p = self.phase4[["game_id", "team", "protection_raw_prior8", "pass_rush_raw_prior8",
                         "protection_z", "pass_plays", "actual_hits_allowed"]]
        j = g.merge(p, on=["game_id", "team"], suffixes=("", "_p4"), validate="one_to_one")
        self.assertTrue(np.allclose(j.raw_protection_prior8, j.protection_raw_prior8,
                                    equal_nan=True, atol=1e-12))
        self.assertTrue(np.allclose(j.raw_protection_z, j.protection_z, equal_nan=True, atol=1e-12))
        self.assertTrue(np.allclose(j.actual_hit_rate, j.actual_hits_allowed/j.pass_plays))
        for _, pair in g.groupby("game_id"):
            a, b = pair.iloc[0], pair.iloc[1]
            self.assertEqual(a.team, b.opponent)
            self.assertEqual(b.team, a.opponent)

    def test_opponent_model_uses_only_earlier_games(self):
        adj = self.adjustment
        self.assertTrue((adj.loc[adj.expected_hit_rate_given_opponent.notna(),
                                 "league_model_prior_rows"] >= 64).all())
        example = adj[(adj.season == 2023) & adj.expected_hit_rate_given_opponent.notna()].iloc[0]
        prior = adj[(adj.kickoff_utc < example.kickoff_utc) & adj.opponent_pregame_rush_rate.notna()]
        self.assertEqual(example.league_model_prior_rows, len(prior))
        x = np.column_stack([np.ones(len(prior)), prior.opponent_pregame_rush_rate])
        w = np.sqrt(prior.actual_dropbacks.to_numpy())
        intercept, slope = np.linalg.lstsq(x*w[:, None], prior.actual_hit_rate.to_numpy()*w, rcond=None)[0]
        self.assertAlmostEqual(example.league_intercept, intercept)
        self.assertAlmostEqual(example.league_rush_slope, slope)
        self.assertAlmostEqual(example.expected_hit_rate_given_opponent,
                               intercept+slope*example.opponent_pregame_rush_rate)
        self.assertAlmostEqual(example.current_game_residual,
                               example.actual_hit_rate-example.expected_hit_rate_given_opponent)

    def test_adjusted_window_excludes_current_and_future(self):
        g = self.games
        target = g[(g.season == 2023) & (g.week == 10) & (g.adjusted_protection_raw.notna())].iloc[0]
        before = g[(g.team == target.team) & (g.kickoff_utc < target.kickoff_utc)]
        before = before.sort_values("kickoff_utc").tail(8)
        valid = before[before.current_game_residual.notna()]
        self.assertEqual(len(before), target.prior8_games)
        self.assertEqual(len(valid), target.prior8_valid_residual_games)
        expected = np.average(valid.current_game_residual, weights=valid.pass_plays)
        self.assertAlmostEqual(target.adjusted_protection_raw, expected)
        self.assertTrue(g[g.adjusted_protection_raw.notna()].prior8_valid_residual_games.ge(4).all())
        self.assertTrue(g[g.adjusted_protection_percentile.notna()].adjusted_protection_percentile.between(0, 1).all())

    def test_pregame_qb_identity_and_gate(self):
        g = self.games
        self.assertTrue(g.loc[g.qb_vulnerability_z.notna(), "qb_prior_dropbacks"].ge(50).all())
        self.assertTrue(g.loc[g.qb_gate_100.astype(bool), "qb_prior_dropbacks"].ge(100).all())
        kickoff = dict(zip(g.game_id, g.kickoff_utc))
        for rec in g[g.expected_qb_id.notna()].itertuples():
            if rec.expected_qb_source == "archived_week2_prediction":
                self.assertLess(rec.expected_qb_source_timestamp, rec.kickoff_utc)
            else:
                self.assertLess(kickoff[rec.expected_qb_source_game], rec.kickoff_utc)
        changes = pd.read_csv(OUT / "qb_change_analysis.csv")
        for rec in changes.itertuples():
            old_games, new_games = rec.old_games.split(";"), rec.new_games.split(";")
            old = g[(g.team == rec.team) & g.game_id.isin(old_games)]
            new = g[(g.team == rec.team) & g.game_id.isin(new_games)]
            self.assertEqual((len(old), len(new)), (2, 2))
            self.assertTrue(old.actual_primary_qb_id.eq(rec.old_qb_id).all())
            self.assertTrue(new.actual_primary_qb_id.eq(rec.new_qb_id).all())
            self.assertTrue(old.actual_qb_attempt_share.eq(1).all())
            self.assertTrue(new.actual_qb_attempt_share.eq(1).all())
        movers = pd.read_csv(OUT / "qb_team_change_analysis.csv")
        self.assertEqual(len(movers), 21)
        for rec in movers.itertuples():
            self.assertNotEqual(rec.old_team, rec.new_team)
            self.assertGreaterEqual(rec.old_games, 4)
            self.assertGreaterEqual(rec.new_games, 4)
            old = g[(g.team == rec.old_team) & (g.actual_primary_qb_id == rec.qb_id)]
            new = g[(g.team == rec.new_team) & (g.actual_primary_qb_id == rec.qb_id)]
            self.assertGreaterEqual(len(old), 4)
            self.assertGreaterEqual(len(new), 4)

    def test_split_models_and_2026_overlay(self):
        g = self.games
        complete = g[(g.season <= 2025) & g[["raw_protection_z", "adjusted_protection_z",
                                                "qb_vulnerability_z", "pass_rush_z"]].notna().all(axis=1) &
                     g.qb_gate_100.astype(bool)]
        self.assertEqual((len(complete), len(complete[complete.season <= 2023]),
                          len(complete[complete.season >= 2024])), (1601, 632, 969))
        models = pd.read_csv(OUT / "model_comparison.csv")
        self.assertTrue(models.train_n.eq(632).all())
        self.assertTrue(models.validation_n.eq(969).all())
        o = pd.read_csv(OUT / "overlay_2026.csv")
        self.assertEqual(len(o), 32)
        self.assertTrue((o.espn_rank_edge == o.espn_pbwr_rank-o.espn_opponent_prwr_rank).all())
        self.assertTrue(o.expected_qb_id.notna().all())


if __name__ == "__main__":
    unittest.main()
