"""Offline Phase 3 study. All matchup and baseline inputs precede kickoff."""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/nfl/research/trench-offensive-disruption"
P2 = ROOT / "data/nfl/research/qb-pressure-trench/game_interactions.csv"
P1 = ROOT / "data/nfl/research/trench-advantage/team_games.csv"
MARKET = ROOT / "data/nfl/research/situational-trend-team-games-v1.jsonl"
SEED = 20260923


def numeric(frame, columns):
    for col in columns:
        frame[col] = pd.to_numeric(frame[col], errors="coerce")
    return frame


def correlation(x, y):
    pair = pd.DataFrame({"x": x, "y": y}).dropna()
    if len(pair) < 4 or pair.x.nunique() < 2 or pair.y.nunique() < 2:
        return {"n": len(pair), "pearson": None, "spearman": None}
    return {"n": len(pair), "pearson": float(pair.x.corr(pair.y)),
            "spearman": float(pair.x.rank().corr(pair.y.rank()))}


def ols(frame, outcome, predictors, cluster=True):
    cols = [outcome, *predictors, "game_id"]
    data = frame[cols].replace([np.inf, -np.inf], np.nan).dropna()
    n, k = len(data), len(predictors) + 1
    if n <= k + 10:
        return []
    x = np.column_stack([np.ones(n), data[predictors].to_numpy(dtype=float)])
    y = data[outcome].to_numpy(dtype=float)
    inv = np.linalg.pinv(x.T @ x)
    beta = inv @ x.T @ y
    residual = y - x @ beta
    if cluster:
        meat = np.zeros((k, k))
        for _, ix in data.groupby("game_id", sort=False).indices.items():
            score = x[ix].T @ residual[ix]
            meat += np.outer(score, score)
        groups = data.game_id.nunique()
        factor = groups / (groups - 1) * (n - 1) / (n - k)
        cov = factor * inv @ meat @ inv
    else:
        cov = (residual @ residual) / (n - k) * inv
    se = np.sqrt(np.maximum(np.diag(cov), 0))
    out = []
    for name, b, s in zip(["intercept", *predictors], beta, se):
        p = math.erfc(abs(b / s) / math.sqrt(2)) if s > 0 else None
        out.append({"outcome": outcome, "model": "+".join(predictors), "term": name,
                    "n": n, "games": data.game_id.nunique(), "coefficient": float(b),
                    "se": float(s), "ci_low": float(b - 1.96 * s),
                    "ci_high": float(b + 1.96 * s), "p_normal": p,
                    "clustered_by_game": cluster})
    return out


def wilson(wins, n):
    if n == 0:
        return (None, None)
    z = 1.96
    center = (wins / n + z*z/(2*n)) / (1 + z*z/n)
    radius = z * math.sqrt((wins/n)*(1-wins/n)/n + z*z/(4*n*n)) / (1+z*z/n)
    return (center-radius, center+radius)


def summary(frame, window, group):
    n = len(frame)
    if not n:
        return None
    result = {"window": window, "group": group, "n": n,
              "games": frame.game_id.nunique()}
    for col in ["team_sack_rate", "team_sacks", "team_pass_epa_db", "team_pass_epa",
                "team_pass_success_rate", "team_explosive_pass_rate", "team_interceptions",
                "team_points", "team_total_margin", "ats_margin", "first_half_points"]:
        result[f"mean_{col}"] = frame[col].mean()
        result[f"median_{col}"] = frame[col].median()
        result[f"n_{col}"] = frame[col].notna().sum()
    for label, mask in [("below_implied", frame.team_total_margin < 0),
                        ("below_implied_3", frame.team_total_margin <= -3),
                        ("below_implied_7", frame.team_total_margin <= -7)]:
        denom = frame.team_total_margin.notna().sum()
        count = int(mask.sum())
        result[f"{label}_n"] = count
        result[f"{label}_rate"] = count / denom if denom else None
        result[f"{label}_ci_low"], result[f"{label}_ci_high"] = wilson(count, denom)
    graded = frame[frame.ats_result.isin(["W", "L"])]
    result["ats_w"] = int((frame.ats_result == "W").sum())
    result["ats_l"] = int((frame.ats_result == "L").sum())
    result["ats_p"] = int((frame.ats_result == "P").sum())
    result["ats_cover_rate"] = result["ats_w"] / len(graded) if len(graded) else None
    result["su_win_rate"] = (frame.su_result == "W").sum() / frame.su_result.isin(["W", "L"]).sum()
    return result


def load():
    p = pd.read_csv(P2, low_memory=False)
    p = numeric(p, ["historical_pass_rush_edge_z", "edge_prior_percentile", "defense_prior_hit_rate",
                    "offense_prior_hit_allowed_rate", "team_pass_epa_db", "team_pass_epa",
                    "team_pass_success_rate", "team_sack_rate", "team_sacks", "team_interceptions",
                    "team_explosive_pass_rate", "pregame_pass_rate_last_game", "team_spread",
                    "team_points", "ats_margin"])
    market = pd.read_json(MARKET, lines=True)[["gameId", "team", "teamSpread", "closingTotal",
                                              "teamScore", "atsCoverMargin", "kickoffUtc"]]
    market.columns = ["game_id", "team", "market_spread", "closing_total",
                      "market_points", "market_ats_margin", "market_kickoff"]
    market = market[market.game_id.str[:4].isin(["2022", "2023", "2024", "2025"])]
    assert not market.duplicated(["game_id", "team"]).any()
    p = p.merge(market, on=["game_id", "team"], how="left", validate="one_to_one")
    h = p.season <= 2025
    assert p.loc[h, "closing_total"].notna().all()
    assert np.allclose(p.loc[h, "team_spread"], p.loc[h, "market_spread"])
    assert np.allclose(p.loc[h, "team_points"], p.loc[h, "market_points"])
    assert np.allclose(p.loc[h, "ats_margin"], p.loc[h, "market_ats_margin"])
    assert (p.loc[h, "kickoff_utc"] == p.loc[h, "market_kickoff"]).all()
    p1 = pd.read_csv(P1)
    p1 = p1[p1.season == 2026][["game_id", "team", "implied_team_total", "team_prwr_rank",
                                  "opponent_pbwr_rank", "pass_rush_edge", "rating_through_week",
                                  "market_line_status", "offense_pass_success_rate"]]
    p1.columns = ["game_id", "defense", "p1_implied_defense", "espn_prwr_rank",
                  "espn_opponent_pbwr_rank", "espn_rank_edge", "espn_rating_through_week",
                  "market_line_status", "p1_defense_success"]
    p = p.merge(p1, left_on=["game_id", "opponent"], right_on=["game_id", "defense"],
                how="left", validate="one_to_one")
    own = pd.read_csv(P1)[["game_id", "team", "implied_team_total", "offense_pass_success_rate"]]
    own.columns = ["game_id", "team", "p1_implied_offense", "p1_pass_success"]
    p = p.merge(own, on=["game_id", "team"], how="left", validate="one_to_one")
    p["implied_team_total"] = (p.closing_total - p.team_spread)/2
    p.loc[p.season == 2026, "implied_team_total"] = p.loc[p.season == 2026, "p1_implied_offense"]
    p["team_total_margin"] = p.team_points - p.implied_team_total
    p["below_implied"] = p.team_total_margin < 0
    p["team_pass_success_rate"] = p.team_pass_success_rate.fillna(p.p1_pass_success)
    p["home"] = (p.venue == "home").astype(int)
    p["offense_underdog"] = (p.team_spread > 0).astype(int)
    # Phase 2 edge contains the two league-standardized terms; its published
    # component rates remain the source for separate predictive comparisons.
    p["component_product"] = p.defense_prior_hit_rate * p.offense_prior_hit_allowed_rate
    p["pass_epa_vs_prior8"] = np.nan
    epa = pd.concat([pd.read_csv(ROOT / f"data/nfl/nflverse/epa-team-game/epa_team_game_{y}.csv")
                     for y in range(2021, 2027)], ignore_index=True)
    epa = epa[["game_id", "season", "week", "team", "pass_epa", "pass_plays"]]
    epa = epa.sort_values(["season", "week", "game_id"])
    epa["prior8_pass_epa_db"] = np.nan
    for team, indices in epa.groupby("team", sort=False).groups.items():
        hist = []
        for ix in indices:
            if len(hist) >= 4:
                numer = sum(v[0] for v in hist[-8:])
                denom = sum(v[1] for v in hist[-8:])
                if denom:
                    epa.at[ix, "prior8_pass_epa_db"] = numer / denom
            row = epa.loc[ix]
            hist.append((row.pass_epa, row.pass_plays))
    p = p.merge(epa[["game_id", "team", "pass_plays", "prior8_pass_epa_db"]],
                on=["game_id", "team"], how="left", validate="one_to_one")
    p["pass_epa_vs_prior8"] = p.team_pass_epa_db - p.prior8_pass_epa_db
    p["sack_rate_denominator"] = p.pass_plays
    # Phase 2 uses nflverse pass plays (dropbacks including sacks) as denominator.
    assert np.allclose(p.team_sack_rate, p.team_sacks / p.pass_plays, equal_nan=True, atol=1e-9)
    p["first_half_points"] = np.nan
    assert not p.duplicated(["game_id", "team"]).any()
    assert np.allclose(p.team_points - p.implied_team_total, p.team_total_margin)
    return p


def compare_models(train, test, outcome):
    models = {
        "A_edge": ["historical_pass_rush_edge_z"],
        "B_defense": ["defense_prior_hit_rate"],
        "C_protection_weakness": ["offense_prior_hit_allowed_rate"],
        "D_components_additive": ["defense_prior_hit_rate", "offense_prior_hit_allowed_rate"],
        "D_components_with_product": ["defense_prior_hit_rate", "offense_prior_hit_allowed_rate", "component_product"],
    }
    rows = []
    for name, cols in models.items():
        a = train[[outcome, *cols]].dropna()
        b = test[[outcome, *cols]].dropna()
        if len(a) < 50 or len(b) < 50:
            continue
        x = np.column_stack([np.ones(len(a)), a[cols].to_numpy(dtype=float)])
        coef = np.linalg.lstsq(x, a[outcome].to_numpy(dtype=float), rcond=None)[0]
        y = b[outcome].to_numpy(dtype=float)
        pred = np.column_stack([np.ones(len(b)), b[cols].to_numpy(dtype=float)]) @ coef
        base = np.repeat(a[outcome].mean(), len(b))
        rows.append({"outcome": outcome, "model": name, "train_n": len(a), "validation_n": len(b),
                     "validation_rmse": float(np.sqrt(np.mean((y-pred)**2))),
                     "validation_mae": float(np.mean(abs(y-pred))),
                     "constant_rmse": float(np.sqrt(np.mean((y-base)**2))),
                     "validation_r2_vs_constant": float(1-np.mean((y-pred)**2)/np.mean((y-base)**2))})
    return rows


def clustered_threshold_difference(frame, outcome, cut=1.0, draws=1000):
    """Resample whole games, preserving the two opposing offense observations."""
    data = frame[["game_id", "historical_pass_rush_edge_z", outcome]].dropna().copy()
    data["high"] = data.historical_pass_rush_edge_z >= cut
    if data.high.nunique() < 2:
        return None
    observed = data.loc[data.high, outcome].mean() - data.loc[~data.high, outcome].mean()
    by_game = data.groupby(["game_id", "high"])[outcome].agg(["sum", "count"]).unstack("high", fill_value=0)
    sums_hi = by_game[("sum", True)].to_numpy()
    sums_lo = by_game[("sum", False)].to_numpy()
    n_hi = by_game[("count", True)].to_numpy()
    n_lo = by_game[("count", False)].to_numpy()
    rng = np.random.default_rng(SEED)
    sampled = rng.integers(0, len(by_game), size=(draws, len(by_game)))
    high_mean = sums_hi[sampled].sum(axis=1) / n_hi[sampled].sum(axis=1)
    low_mean = sums_lo[sampled].sum(axis=1) / n_lo[sampled].sum(axis=1)
    bounds = np.quantile(high_mean - low_mean, [.025, .975])
    return {"outcome": outcome, "threshold": "edge_z >= 1 vs < 1", "n_high": int(data.high.sum()),
            "n_comparison": int((~data.high).sum()), "mean_difference": float(observed),
            "ci_low": float(bounds[0]), "ci_high": float(bounds[1]),
            "method": f"game-cluster percentile bootstrap, {draws} draws, seed {SEED}"}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    p = load()
    p.to_csv(OUT / "game_level.csv", index=False, float_format="%.12g")
    hist = p[(p.season <= 2025) & p.historical_pass_rush_edge_z.notna()].copy()
    train = hist[hist.season <= 2023]
    valid = hist[hist.season >= 2024]
    windows = {"2022-2023 exploratory": train, "2024-2025 validation": valid,
               "2022-2025 full": hist}
    masks = {
        "all": lambda x: np.ones(len(x), dtype=bool),
        "top50_prior": lambda x: x.edge_prior_percentile >= .50,
        "top25_prior": lambda x: x.edge_prior_percentile >= .75,
        "top20_prior": lambda x: x.edge_prior_percentile >= .80,
        "top10_prior": lambda x: x.edge_prior_percentile >= .90,
        "z_ge_0.5": lambda x: x.historical_pass_rush_edge_z >= .5,
        "z_ge_1.0": lambda x: x.historical_pass_rush_edge_z >= 1,
        "z_ge_1.5": lambda x: x.historical_pass_rush_edge_z >= 1.5,
        "z_lt_-0.5": lambda x: x.historical_pass_rush_edge_z < -.5,
        "z_-0.5_to_0": lambda x: (x.historical_pass_rush_edge_z >= -.5) & (x.historical_pass_rush_edge_z < 0),
        "z_0_to_0.5": lambda x: (x.historical_pass_rush_edge_z >= 0) & (x.historical_pass_rush_edge_z < .5),
        "z_0.5_to_1": lambda x: (x.historical_pass_rush_edge_z >= .5) & (x.historical_pass_rush_edge_z < 1),
        "z_1_to_1.5": lambda x: (x.historical_pass_rush_edge_z >= 1) & (x.historical_pass_rush_edge_z < 1.5),
    }
    summaries = [summary(d[fn(d)], w, name) for w, d in windows.items() for name, fn in masks.items()]
    summaries = [s for s in summaries if s]
    pd.DataFrame(summaries).to_csv(OUT / "threshold_summaries.csv", index=False, float_format="%.12g")
    pd.DataFrame([{k: v for k, v in s.items() if k == "window" or k == "group" or "implied" in k or "total_margin" in k or k in ("n", "games")}
                  for s in summaries]).to_csv(OUT / "team_total_analysis.csv", index=False, float_format="%.12g")
    outcomes = ["team_sack_rate", "team_sacks", "team_pass_epa_db", "team_pass_success_rate",
                "team_pass_epa", "team_explosive_pass_rate", "team_interceptions",
                "team_points", "team_total_margin", "pass_epa_vs_prior8", "ats_margin"]
    corr = [{"window": name, "outcome": y, **correlation(d.historical_pass_rush_edge_z, d[y])}
            for name, d in windows.items() for y in outcomes]
    models = {"team_sack_rate": ["historical_pass_rush_edge_z", "team_spread", "home", "pregame_pass_rate_last_game"],
              "team_pass_epa_db": ["historical_pass_rush_edge_z", "team_spread", "home", "prior8_pass_epa_db"],
              "team_pass_success_rate": ["historical_pass_rush_edge_z", "team_spread", "home", "prior8_pass_epa_db"],
              "team_total_margin": ["historical_pass_rush_edge_z", "team_spread", "closing_total", "home"]}
    regressions = []
    for name, d in windows.items():
        for outcome, cols in models.items():
            for rec in ols(d, outcome, cols):
                rec["window"] = name
                regressions.append(rec)
    pd.DataFrame(regressions).to_csv(OUT / "regression_results.csv", index=False, float_format="%.12g")
    comparisons = [x for outcome in ["team_sack_rate", "team_pass_epa_db", "team_pass_success_rate", "team_total_margin"]
                   for x in compare_models(train, valid, outcome)]
    pd.DataFrame(comparisons).to_csv(OUT / "validation_results.csv", index=False, float_format="%.12g")
    differences = [{"window": name, **result} for name, d in windows.items()
                   for outcome in ["team_sack_rate", "team_pass_epa_db", "team_pass_success_rate",
                                   "team_total_margin", "team_points", "ats_margin"]
                   if (result := clustered_threshold_difference(d, outcome)) is not None]
    pd.DataFrame(differences).to_csv(OUT / "threshold_differences.csv", index=False, float_format="%.12g")
    script_rows = []
    for window, d in windows.items():
        for label, mask in [("favorite", d.team_spread < 0), ("underdog", d.team_spread > 0),
                            ("pickem", d.team_spread == 0), ("home", d.home == 1),
                            ("away", d.home == 0), ("spread_0_to_3", d.team_spread.abs() <= 3),
                            ("spread_3.5_to_6.5", d.team_spread.abs().between(3.5, 6.5)),
                            ("spread_7_plus", d.team_spread.abs() >= 7),
                            ("prior_pass_rate_above_median", d.pregame_pass_rate_last_game >= d.pregame_pass_rate_last_game.median())]:
            for edge_label, edge_mask in [("all", d.historical_pass_rush_edge_z.notna()),
                                          ("edge_z_ge_1", d.historical_pass_rush_edge_z >= 1)]:
                s = summary(d[mask & edge_mask], window, f"{label}:{edge_label}")
                if s:
                    script_rows.append(s)
    pd.DataFrame(script_rows).to_csv(OUT / "game_script_analysis.csv", index=False, float_format="%.12g")
    week2 = p[(p.season == 2026) & (p.week == 2)].copy()
    assert len(week2) == 32 and week2.espn_rank_edge.notna().all()
    assert (week2.espn_rating_through_week == 1).all()
    week2["espn_edge_5_plus"] = week2.espn_rank_edge >= 5
    week2["espn_edge_10_plus"] = week2.espn_rank_edge >= 10
    week2["espn_edge_15_plus"] = week2.espn_rank_edge >= 15
    week2["espn_edge_20_plus"] = week2.espn_rank_edge >= 20
    overlay = week2[["game_id", "week", "opponent", "team", "espn_prwr_rank", "espn_opponent_pbwr_rank",
                     "espn_rank_edge", "historical_pass_rush_edge_z", "team_sacks", "team_sack_rate",
                     "team_pass_epa_db", "team_pass_success_rate", "team_interceptions", "team_points",
                     "implied_team_total", "team_total_margin", "team_spread", "ats_result", "ats_margin",
                     "su_result", "espn_edge_5_plus", "espn_edge_10_plus", "espn_edge_15_plus",
                     "espn_edge_20_plus"]].sort_values("espn_rank_edge", ascending=False)
    overlay = overlay.rename(columns={"opponent": "defense", "team": "offense",
                                      "team_pass_epa_db": "offense_pass_epa_db",
                                      "team_pass_success_rate": "offense_pass_success_rate",
                                      "team_sacks": "offense_sacks", "team_sack_rate": "offense_sack_rate",
                                      "team_points": "offense_points", "team_interceptions": "offense_interceptions"})
    overlay.to_csv(OUT / "overlay_2026.csv", index=False, float_format="%.12g")
    assert overlay.espn_edge_10_plus.sum() == 7
    analysis = {"method": "Phase 2 pregame trailing-eight QB-hit edge; offense perspective; prior-only percentile",
                "historical_rows_with_edge": len(hist), "historical_distinct_games": hist.game_id.nunique(),
                "train_rows": len(train), "validation_rows": len(valid), "week2_2026_rows": len(overlay),
                "week2_espn_10_plus": int(overlay.espn_edge_10_plus.sum()),
                "historical_market_missing": int(p.loc[p.season <= 2025, "closing_total"].isna().sum()),
                "first_half_unavailable": "Retained historical compact caches lack quarter/half play or score splits; raw PBP is not local.",
                "direct_team_total_market_unavailable": True,
                "threshold_differences": differences,
                "correlations": corr,
                "inputs": [str(v.relative_to(ROOT)).replace("\\", "/") for v in [P1, P2, MARKET]]}
    (OUT / "analysis.json").write_text(json.dumps(analysis, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({k: analysis[k] for k in ["historical_rows_with_edge", "historical_distinct_games",
                                                 "train_rows", "validation_rows", "week2_2026_rows", "week2_espn_10_plus"]}))


if __name__ == "__main__":
    main()
