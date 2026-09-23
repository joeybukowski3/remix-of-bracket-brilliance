"""Phase 5 offline decomposition of pregame QB-hit exposure.

Run: python -B scripts/research/nfl-protection-decomposition-study.py
Prior-game opponent expectations are fitted only on games completed before
the prior game's kickoff. Current outcomes never enter pregame features.
"""
from __future__ import annotations

import importlib.util
import json
import math
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/nfl/research/protection-decomposition"
P4 = ROOT / "data/nfl/research/protection-vs-pass-rush/game_level.csv"
P3 = ROOT / "data/nfl/research/trench-offensive-disruption/game_level.csv"
P2 = ROOT / "data/nfl/research/qb-pressure-trench/game_interactions.csv"
QB_STABILITY = ROOT / "data/nfl/research/qb-pressure-trench/qb_stability.csv"
H3 = ROOT / "scripts/research/nfl-trench-offensive-disruption-study.py"
spec = importlib.util.spec_from_file_location("phase3_research_helpers", H3)
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)

OUTCOMES = ["actual_hit_rate", "team_sack_rate", "team_sacks", "team_pass_epa_db", "team_pass_success_rate",
            "team_explosive_pass_rate", "team_points", "team_total_margin"]
MODELS = {
    "A raw protection": ["raw_protection_z"],
    "B opponent adjusted": ["adjusted_protection_z"],
    "C QB only": ["qb_vulnerability_z"],
    "D adjusted + QB": ["adjusted_protection_z", "qb_vulnerability_z"],
    "E raw + QB": ["raw_protection_z", "qb_vulnerability_z"],
    "F adjusted + QB + rush": ["adjusted_protection_z", "qb_vulnerability_z", "pass_rush_z"],
}


def ratio(rows, count, exposure):
    denom = rows[exposure].sum()
    return float(rows[count].sum()/denom) if denom > 0 else np.nan


def pct(value, reference):
    if not np.isfinite(value) or len(reference) < 16:
        return np.nan
    a = np.asarray(reference)
    return float((np.sum(a < value)+.5*np.sum(a == value))/len(a))


def add_opponent_adjustment(base):
    """A lagged weighted league regression provides each game's expectation."""
    training = []
    histories = defaultdict(list)
    records = []
    for kickoff, batch in base.sort_values(["kickoff_utc", "game_id", "team"]).groupby("kickoff_utc", sort=True):
        if len(training) >= 64:
            tr = np.asarray(training, dtype=float)
            weights = np.sqrt(tr[:, 2])
            design = np.column_stack([np.ones(len(tr)), tr[:, 0]])
            intercept, slope = np.linalg.lstsq(design*weights[:, None], tr[:, 1]*weights, rcond=None)[0]
        else:
            intercept, slope = np.nan, np.nan
        league_prior = []
        for hist in histories.values():
            last8 = hist[-8:]
            valid = [v for v in last8 if np.isfinite(v["residual"])]
            if len(valid) >= 4:
                league_prior.append(sum(v["residual"]*v["dropbacks"] for v in valid)/
                                    sum(v["dropbacks"] for v in valid))
        mean = float(np.mean(league_prior)) if len(league_prior) >= 16 else np.nan
        sd = float(np.std(league_prior, ddof=1)) if len(league_prior) >= 16 else np.nan
        current = []
        for row in batch.itertuples():
            prior = histories[row.team][-8:]
            valid = [v for v in prior if np.isfinite(v["residual"])]
            four = [v for v in histories[row.team][-4:] if np.isfinite(v["residual"])]
            adjusted = (sum(v["residual"]*v["dropbacks"] for v in valid)/
                        sum(v["dropbacks"] for v in valid)) if len(valid) >= 4 else np.nan
            adjusted4 = (sum(v["residual"]*v["dropbacks"] for v in four)/
                         sum(v["dropbacks"] for v in four)) if len(four) >= 4 else np.nan
            opponent_rate = row.pass_rush_raw_prior8
            expected = intercept+slope*opponent_rate if np.isfinite(intercept) and np.isfinite(opponent_rate) else np.nan
            actual = row.actual_hits_allowed/row.pass_plays
            residual = actual-expected if np.isfinite(expected) else np.nan
            record = {"game_id": row.game_id, "team": row.team, "opponent": row.opponent,
                      "kickoff_utc": kickoff, "season": row.season, "week": row.week,
                      "opponent_pregame_rush_rate": opponent_rate,
                      "league_model_prior_rows": len(training), "league_intercept": intercept,
                      "league_rush_slope": slope, "expected_hit_rate_given_opponent": expected,
                      "actual_hit_rate": actual, "actual_hits_allowed": row.actual_hits_allowed,
                      "actual_dropbacks": row.pass_plays, "current_game_residual": residual,
                      "prior8_games": len(prior), "prior8_valid_residual_games": len(valid),
                      "adjusted_protection_raw": adjusted, "adjusted_protection_prior4": adjusted4,
                      "adjusted_protection_z": (adjusted-mean)/sd if np.isfinite(adjusted) and sd > 0 else np.nan,
                      "adjusted_protection_percentile": pct(adjusted, league_prior)}
            records.append(record)
            current.append(record)
        # Only after the entire kickoff batch has been rated can its outcomes
        # be used as training data and prior-game history.
        for rec in current:
            histories[rec["team"]].append({"game_id": rec["game_id"], "residual": rec["current_game_residual"],
                                            "dropbacks": rec["actual_dropbacks"], "season": rec["season"]})
            if np.isfinite(rec["opponent_pregame_rush_rate"]):
                training.append((rec["opponent_pregame_rush_rate"], rec["actual_hit_rate"], rec["actual_dropbacks"]))
    return pd.DataFrame(records)


def load():
    p4 = pd.read_csv(P4, low_memory=False)
    p3 = pd.read_csv(P3, low_memory=False)
    p2 = pd.read_csv(P2, low_memory=False)
    adjustment = add_opponent_adjustment(p4)
    p4 = p4.rename(columns={"protection_z": "raw_protection_z",
                            "protection_percentile": "raw_protection_percentile",
                            "protection_raw_prior8": "raw_protection_prior8"})
    g = p4.merge(adjustment.drop(columns=["opponent", "kickoff_utc", "season", "week", "actual_hits_allowed"]),
                 on=["game_id", "team"], validate="one_to_one")
    qb_cols = ["game_id", "team", "expected_qb_id", "expected_qb_name", "expected_qb_source",
               "expected_qb_source_game", "expected_qb_source_timestamp", "actual_primary_qb_id",
               "actual_primary_qb_name", "actual_matches_expected", "actual_qb_attempt_share",
               "qb_prior_games", "qb_prior_dropbacks", "qb_prior_sacks", "qb_prior_sack_rate",
               "qb_prior_hit_allowed_rate", "qb_vulnerability_z", "qb_vulnerability_trailing8_z",
               "qb_vulnerability_trailing16_z", "qb_vulnerability_percentile", "qb_gate_50",
               "qb_gate_100", "qb_gate_200", "ats_result", "ats_margin"]
    g = g.merge(p2[qb_cols], on=["game_id", "team"], validate="one_to_one")
    g = g.merge(p3[["game_id", "team", "team_interceptions", "team_cpoe", "qb_yards_attempt",
                    "espn_opponent_pbwr_rank", "espn_prwr_rank", "espn_rank_edge",
                    "espn_rating_through_week"]],
                on=["game_id", "team"], validate="one_to_one")
    assert len(g) == len(p4) == 2238
    assert not g.duplicated(["game_id", "team"]).any()
    assert np.allclose(g.raw_protection_prior8, p4.raw_protection_prior8, equal_nan=True)
    assert np.allclose(g.actual_hit_rate, g.actual_hits_allowed/g.pass_plays)
    g["adjusted_protection_quintile"] = np.minimum(np.floor(g.adjusted_protection_percentile*5), 4).astype("Int64")
    g["raw_protection_quintile"] = np.minimum(np.floor(g.raw_protection_percentile*5), 4).astype("Int64")
    g["qb_vulnerability_quintile"] = np.minimum(np.floor(g.qb_vulnerability_percentile*5), 4).astype("Int64")
    return g, adjustment


def stability_row(name, kind, x, y):
    pair = pd.DataFrame({"x": x, "y": y}).dropna()
    result = {"metric": name, "test": kind, **helpers.correlation(pair.x, pair.y)}
    if len(pair) >= 20:
        xcut = pair.x.quantile(.8)
        ycut = pair.y.quantile(.8)
        result["worst_quintile_retention"] = float((pair.loc[pair.x >= xcut, "y"] >= ycut).mean())
        xpct = pair.x.rank(pct=True)
        ypct = pair.y.rank(pct=True)
        result["percentile_within_20pct"] = float(((xpct-ypct).abs() <= .2).mean())
    else:
        result["worst_quintile_retention"] = None
        result["percentile_within_20pct"] = None
    return result


def team_stability(g, metric):
    rows = []
    if metric == "raw protection":
        prior_col, prior4_col, actual_col = "raw_protection_prior8", "protection_raw_prior4", "actual_hit_rate"
    elif metric == "adjusted protection":
        prior_col, prior4_col, actual_col = "adjusted_protection_raw", "adjusted_protection_prior4", "current_game_residual"
    else:
        # Defense identity is the offense row's opponent; generated hits are
        # that opponent's actual hits allowed and its dropbacks.
        g = g.rename(columns={"team": "offense", "opponent": "team"})
        prior_col, prior4_col, actual_col = "pass_rush_raw_prior8", "pass_rush_raw_prior4", "actual_hit_rate"
    events = g[g.season <= 2025].sort_values(["team", "season", "week", "kickoff_utc"])
    pairs = []
    for (team, season), part in events.groupby(["team", "season"], sort=True):
        part = part.reset_index(drop=True)
        for i, rec in part.iterrows():
            item = {"team": team, "season": season, "game_id": rec.game_id,
                    "prior8": rec[prior_col], "prior4": rec[prior4_col]}
            for n in [4, 8]:
                future = part.iloc[i:i+n]
                if len(future) == n and future[actual_col].notna().all():
                    item[f"next{n}"] = np.average(future[actual_col], weights=future.pass_plays)
                else:
                    item[f"next{n}"] = np.nan
            pairs.append(item)
    p = pd.DataFrame(pairs)
    for label, a, b in [("prior4_vs_next4", "prior4", "next4"),
                        ("prior8_vs_next4", "prior8", "next4"),
                        ("prior8_vs_next8", "prior8", "next8")]:
        rows.append(stability_row(metric, label, p[a], p[b]))
    halves, years = [], []
    for (team, season), part in events.groupby(["team", "season"]):
        first, second = part[part.week <= 9], part[part.week >= 10]
        def weighted(v):
            valid = v[v[actual_col].notna()]
            return float(np.average(valid[actual_col], weights=valid.pass_plays)) if len(valid) >= 4 else np.nan
        halves.append({"first": weighted(first), "second": weighted(second)})
        years.append({"team": team, "season": season, "full": weighted(part)})
    half = pd.DataFrame(halves)
    rows.append(stability_row(metric, "first_half_vs_second_half", half["first"], half["second"]))
    year = pd.DataFrame(years)
    nxt = year.assign(season=year.season-1)
    year = year.merge(nxt, on=["team", "season"], suffixes=("_n", "_next"))
    rows.append(stability_row(metric, "year_n_vs_year_n_plus_1", year.full_n, year.full_next))
    return rows, p


def qb_stability():
    qb = pd.read_csv(QB_STABILITY)
    rows = []
    for name, first, second, gate in [
        ("QB raw sack rate", "first_half_sack_rate", "second_half_sack_rate", "half"),
        ("QB excess sack rate", "first_half_excess_sack_rate", "second_half_excess_sack_rate", "half"),
        ("QB raw sack rate", "season_sack_rate", "next_year_sack_rate", "year"),
        ("QB excess sack rate", "season_excess_sack_rate", "next_year_excess_sack_rate", "year")]:
        if gate == "half":
            subset = qb[(qb.first_half_dropbacks >= 50) & (qb.second_half_dropbacks >= 50)]
            test = "first_half_vs_second_half"
        else:
            subset = qb[(qb.season_dropbacks >= 100) & (qb.next_year_dropbacks >= 100)]
            test = "year_n_vs_year_n_plus_1"
        rows.append(stability_row(name, test, subset[first], subset[second]))
    return rows


def summary(data, metric, quintile, window):
    result = {"window": window, "metric": metric, "quintile": quintile,
              "n": len(data), "games": data.game_id.nunique(), "small_n_lt_30": len(data) < 30}
    for outcome in OUTCOMES:
        result[f"mean_{outcome}"] = data[outcome].mean()
    return result


def model_fit(train, valid, outcome, label, terms):
    a = train[[outcome, *terms]].dropna()
    b = valid[[outcome, *terms]].dropna()
    x = np.column_stack([np.ones(len(a)), a[terms].to_numpy(float)])
    y = a[outcome].to_numpy(float)
    coefficients = np.linalg.lstsq(x, y, rcond=None)[0]
    pred_a = x@coefficients
    xv = np.column_stack([np.ones(len(b)), b[terms].to_numpy(float)])
    yv = b[outcome].to_numpy(float)
    pred_v = xv@coefficients
    r2 = 1-np.sum((y-pred_a)**2)/np.sum((y-y.mean())**2)
    return {"outcome": outcome, "model": label, "train_n": len(a), "validation_n": len(b),
            "train_r2": float(r2), "validation_rmse": float(np.sqrt(np.mean((yv-pred_v)**2))),
            "validation_mae": float(np.mean(abs(yv-pred_v))),
            "validation_constant_rmse": float(np.sqrt(np.mean((yv-y.mean())**2))),
            "coefficients": json.dumps(dict(zip(["intercept", *terms], map(float, coefficients))))}


def validation_predictions(train, valid, outcomes):
    records = valid[["game_id", "team", "season", "week"]].copy()
    for outcome in outcomes:
        records[f"actual_{outcome}"] = valid[outcome].to_numpy()
        for label, terms in MODELS.items():
            x = np.column_stack([np.ones(len(train)), train[terms].to_numpy(float)])
            coefficients = np.linalg.lstsq(x, train[outcome].to_numpy(float), rcond=None)[0]
            xv = np.column_stack([np.ones(len(valid)), valid[terms].to_numpy(float)])
            records[f"pred_{outcome}_{label[0]}"] = xv@coefficients
    return records


def paired_validation_differences(predictions, outcomes, draws=1000):
    rng = np.random.default_rng(20260923)
    games = list(predictions.groupby("game_id", sort=True).indices.values())
    sampled = rng.integers(0, len(games), size=(draws, len(games)))
    rows = []
    for outcome in outcomes:
        y = predictions[f"actual_{outcome}"].to_numpy()
        losses = {code: (y-predictions[f"pred_{outcome}_{code}"].to_numpy())**2
                  for code in ["A", "B", "C", "D", "E", "F"]}
        for label, first, second in [("B adjusted minus A raw", "B", "A"),
                                     ("D adjusted+QB minus E raw+QB", "D", "E"),
                                     ("E raw+QB minus A raw", "E", "A"),
                                     ("F adjusted+QB+rush minus E raw+QB", "F", "E")]:
            observed = math.sqrt(losses[first].mean())-math.sqrt(losses[second].mean())
            boot = []
            for ix in sampled:
                positions = np.concatenate([games[i] for i in ix])
                boot.append(math.sqrt(losses[first][positions].mean())-
                            math.sqrt(losses[second][positions].mean()))
            low, high = np.quantile(boot, [.025, .975])
            rows.append({"outcome": outcome, "contrast": label, "n": len(y),
                         "rmse_difference": observed, "ci_low": low, "ci_high": high,
                         "method": "game-cluster percentile bootstrap, 1000 draws"})
    return pd.DataFrame(rows)


def qb_switch_bootstrap(changes, controls, draws=1000):
    combined = pd.concat([changes.assign(group=1), controls.assign(group=0)], ignore_index=True)
    combined["cluster"] = combined.team.astype(str) + ":" + combined.season.astype(str)
    combined["abs_hit_change"] = combined.change_hit_rate.abs()
    keys = list(combined.groupby("cluster", sort=True).indices.values())
    rng = np.random.default_rng(20260923)
    sampled = rng.integers(0, len(keys), size=(draws, len(keys)))
    boot = []
    for ix in sampled:
        sample = combined.iloc[np.concatenate([keys[i] for i in ix])]
        boot.append(sample.loc[sample.group == 1, "abs_hit_change"].mean()-
                    sample.loc[sample.group == 0, "abs_hit_change"].mean())
    observed = changes.change_hit_rate.abs().mean()-controls.change_hit_rate.abs().mean()
    lo, hi = np.quantile(boot, [.025, .975])
    return {"changed_n": len(changes), "stable_qb_windows_n": len(controls),
            "changed_mean_abs_hit_rate_change": float(changes.change_hit_rate.abs().mean()),
            "stable_mean_abs_hit_rate_change": float(controls.change_hit_rate.abs().mean()),
            "difference": float(observed), "ci_low": float(lo), "ci_high": float(hi),
            "method": "team-season cluster percentile bootstrap, 1000 draws"}


def segment_stats(data):
    return {"games": len(data), "hit_rate": ratio(data, "actual_hits_allowed", "pass_plays"),
            "sack_rate": ratio(data, "team_sacks", "pass_plays"),
            "pass_epa_db": ratio(data, "team_pass_epa", "pass_plays"),
            "opponent_pregame_rush_rate": data.pass_rush_raw_prior8.mean(),
            "opponent_adjusted_hit_residual": np.average(data.current_game_residual.dropna(),
                weights=data.loc[data.current_game_residual.notna(), "pass_plays"])
                if data.current_game_residual.notna().any() else np.nan,
            "pregame_raw_protection_rate": data.raw_protection_prior8.mean(),
            "pregame_adjusted_protection_rate": data.adjusted_protection_raw.mean()}


def qb_changes(g, changed=True):
    historical = g[(g.season <= 2025)].sort_values(["team", "season", "week"])
    records = []
    for (team, season), part in historical.groupby(["team", "season"]):
        part = part.reset_index(drop=True)
        for i in range(2, len(part)-1):
            before, after = part.iloc[i-2:i], part.iloc[i:i+2]
            old, new = before.actual_primary_qb_id.iloc[0], after.actual_primary_qb_id.iloc[0]
            if pd.isna(old) or pd.isna(new) or ((old != new) != changed):
                continue
            if not before.actual_primary_qb_id.eq(old).all() or not after.actual_primary_qb_id.eq(new).all():
                continue
            if not before.actual_qb_attempt_share.eq(1).all() or not after.actual_qb_attempt_share.eq(1).all():
                continue
            b, a = segment_stats(before), segment_stats(after)
            records.append({"team": team, "season": season, "transition_week": int(after.week.iloc[0]),
                            "qb_changed": changed,
                            "old_qb_id": old, "old_qb_name": before.actual_primary_qb_name.iloc[0],
                            "new_qb_id": new, "new_qb_name": after.actual_primary_qb_name.iloc[0],
                            "old_games": ";".join(before.game_id), "new_games": ";".join(after.game_id),
                            **{f"before_{k}": v for k, v in b.items()},
                            **{f"after_{k}": v for k, v in a.items()},
                            **{f"change_{k}": a[k]-b[k] for k in ["hit_rate", "sack_rate", "pass_epa_db",
                                                                      "opponent_pregame_rush_rate",
                                                                      "opponent_adjusted_hit_residual"]}})
    return pd.DataFrame(records)


def qb_team_changes(g):
    data = g[(g.season <= 2025) & g.actual_primary_qb_id.notna() &
             g.actual_qb_attempt_share.eq(1)].sort_values(["actual_primary_qb_id", "kickoff_utc"])
    records = []
    for qb, part in data.groupby("actual_primary_qb_id", sort=True):
        part = part.reset_index(drop=True)
        stint = (part.team != part.team.shift()).cumsum()
        stints = [(part[stint == sid].team.iloc[0], part[stint == sid]) for sid in stint.unique()]
        for (old_team, old), (new_team, new) in zip(stints, stints[1:]):
            if old_team == new_team or len(old) < 4 or len(new) < 4:
                continue
            before, after = segment_stats(old), segment_stats(new)
            records.append({"qb_id": qb, "qb_name": old.actual_primary_qb_name.iloc[0],
                            "old_team": old_team, "new_team": new_team,
                            "old_first_game": old.game_id.iloc[0], "new_first_game": new.game_id.iloc[0],
                            **{f"old_{k}": v for k, v in before.items()},
                            **{f"new_{k}": v for k, v in after.items()},
                            **{f"change_{k}": after[k]-before[k] for k in ["hit_rate", "sack_rate", "pass_epa_db",
                                                                               "opponent_adjusted_hit_residual",
                                                                               "pregame_raw_protection_rate",
                                                                               "pregame_adjusted_protection_rate"]}})
    return pd.DataFrame(records)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    g, adjustment = load()
    g.to_csv(OUT / "game_level.csv", index=False, float_format="%.12g")
    adjustment.to_csv(OUT / "opponent_adjustment.csv", index=False, float_format="%.12g")
    qb_cols = ["season", "week", "game_id", "kickoff_utc", "team", "expected_qb_id", "expected_qb_name",
               "expected_qb_source", "expected_qb_source_game", "expected_qb_source_timestamp",
               "actual_primary_qb_id", "actual_primary_qb_name", "actual_qb_attempt_share",
               "qb_prior_games", "qb_prior_dropbacks", "qb_prior_sacks", "qb_prior_sack_rate",
               "qb_prior_hit_allowed_rate", "qb_vulnerability_z", "qb_vulnerability_trailing8_z",
               "qb_vulnerability_trailing16_z", "qb_vulnerability_percentile", "qb_gate_50", "qb_gate_100",
               "qb_gate_200"]
    g[qb_cols].to_csv(OUT / "qb_vulnerability.csv", index=False, float_format="%.12g")
    changes = qb_changes(g)
    stable_qb_controls = qb_changes(g, changed=False)
    team_changes = qb_team_changes(g)
    changes.to_csv(OUT / "qb_change_analysis.csv", index=False, float_format="%.12g")
    stable_qb_controls.to_csv(OUT / "qb_change_controls.csv", index=False, float_format="%.12g")
    switch_summary = qb_switch_bootstrap(changes, stable_qb_controls)
    pd.DataFrame([switch_summary]).to_csv(OUT / "qb_change_summary.csv", index=False, float_format="%.12g")
    team_changes.to_csv(OUT / "qb_team_change_analysis.csv", index=False, float_format="%.12g")
    stability, pair_outputs = [], {}
    for metric in ["raw protection", "adjusted protection", "pass rush quality"]:
        rows, pairs = team_stability(g, metric)
        stability += rows
        pair_outputs[metric] = pairs
    raw_pairs = pair_outputs["raw protection"].rename(columns={"prior8": "raw_prior8", "next4": "raw_next4",
                                                            "next8": "raw_next8"})
    adjusted_pairs = pair_outputs["adjusted protection"].rename(columns={"prior8": "adj_prior8",
                                                                      "next4": "adj_next4", "next8": "adj_next8"})
    matched = raw_pairs.merge(adjusted_pairs[["team", "season", "game_id", "adj_prior8", "adj_next4", "adj_next8"]],
                              on=["team", "season", "game_id"], validate="one_to_one")
    for future in [4, 8]:
        eligible = matched[["raw_prior8", f"raw_next{future}", "adj_prior8", f"adj_next{future}"]].dropna()
        stability.append(stability_row("raw protection MATCHED", f"prior8_vs_next{future}",
                                       eligible.raw_prior8, eligible[f"raw_next{future}"]))
        stability.append(stability_row("adjusted protection MATCHED", f"prior8_vs_next{future}",
                                       eligible.adj_prior8, eligible[f"adj_next{future}"]))
    stability += qb_stability()
    pd.DataFrame(stability).to_csv(OUT / "stability_results.csv", index=False, float_format="%.12g")
    for name, pairs in pair_outputs.items():
        pairs.to_csv(OUT / (name.replace(" ", "_") + "_stability_pairs.csv"), index=False, float_format="%.12g")
    hist = g[g.season <= 2025].copy()
    complete = hist[hist[["raw_protection_z", "adjusted_protection_z", "qb_vulnerability_z",
                          "pass_rush_z"]].notna().all(axis=1) & hist.qb_gate_100.astype(bool)].copy()
    train, valid = complete[complete.season <= 2023], complete[complete.season >= 2024]
    comparisons, coefficients = [], []
    for outcome in OUTCOMES:
        for label, terms in MODELS.items():
            comparisons.append(model_fit(train, valid, outcome, label, terms))
            for window, data in [("2022-2023 exploratory", train), ("2024-2025 heldout", valid)]:
                for result in helpers.ols(data, outcome, terms):
                    coefficients.append({"window": window, "signal_form": label, **result})
    pd.DataFrame(comparisons).to_csv(OUT / "model_comparison.csv", index=False, float_format="%.12g")
    pd.DataFrame(comparisons).to_csv(OUT / "validation_results.csv", index=False, float_format="%.12g")
    pred = validation_predictions(train, valid, OUTCOMES)
    pred.to_csv(OUT / "validation_predictions.csv", index=False, float_format="%.12g")
    paired = paired_validation_differences(pred, ["actual_hit_rate", "team_sack_rate", "team_pass_epa_db",
                                                   "team_pass_success_rate"])
    paired.to_csv(OUT / "validation_differences.csv", index=False, float_format="%.12g")
    pd.DataFrame(coefficients).to_csv(OUT / "regression_results.csv", index=False, float_format="%.12g")
    windows = {"2022-2023 exploratory": train, "2024-2025 heldout": valid,
               **{str(y): complete[complete.season == y] for y in range(2022, 2026)}}
    summaries, correlations = [], []
    for window, data in windows.items():
        summaries.append(summary(data, "all complete case", "all", window))
        for metric, col, quint in [("raw protection", "raw_protection_z", "raw_protection_quintile"),
                                   ("adjusted protection", "adjusted_protection_z", "adjusted_protection_quintile"),
                                   ("QB vulnerability", "qb_vulnerability_z", "qb_vulnerability_quintile")]:
            for outcome in OUTCOMES:
                correlations.append({"window": window, "metric": metric, "outcome": outcome,
                                     **helpers.correlation(data[col], data[outcome])})
            for q in range(5):
                summaries.append(summary(data[data[quint] == q], metric, q+1, window))
    pd.DataFrame(summaries).to_csv(OUT / "quintile_summaries.csv", index=False, float_format="%.12g")
    pd.DataFrame(summaries).to_csv(OUT / "season_summaries.csv", index=False, float_format="%.12g")
    overlay = g[(g.season == 2026) & (g.week == 2)].copy()
    overlay["espn_pbwr_rank"] = overlay.espn_opponent_pbwr_rank
    overlay["espn_opponent_prwr_rank"] = overlay.espn_prwr_rank
    overlay["espn_rank_edge"] = overlay.espn_rank_edge
    overlay["raw_adjusted_disagree"] = ((overlay.raw_protection_percentile >= .8) !=
                                         (overlay.adjusted_protection_percentile >= .8))
    overlay_cols = ["game_id", "week", "team", "opponent", "expected_qb_name", "expected_qb_id",
                    "raw_protection_prior8", "raw_protection_percentile", "adjusted_protection_raw",
                    "adjusted_protection_percentile", "qb_vulnerability_z", "qb_vulnerability_percentile",
                    "pass_rush_percentile", "espn_pbwr_rank", "espn_opponent_prwr_rank", "espn_rank_edge",
                    "raw_adjusted_disagree", "team_sacks", "team_sack_rate", "team_pass_epa_db",
                    "team_pass_success_rate", "team_points", "implied_team_total"]
    assert len(overlay) == 32
    overlay[overlay_cols].sort_values("espn_rank_edge", ascending=False).to_csv(
        OUT / "overlay_2026.csv", index=False, float_format="%.12g")
    analysis = {"historical_rows": len(hist), "complete_case_rows": len(complete),
                "train_rows": len(train), "validation_rows": len(valid),
                "per_season_complete": {str(y): len(complete[complete.season == y]) for y in range(2022, 2026)},
                "opponent_adjustment_games": int(g.current_game_residual.notna().sum()),
                "pregame_adjustment_rows": int(g.adjusted_protection_raw.notna().sum()),
                "qb_change_segments": len(changes), "stable_qb_control_windows": len(stable_qb_controls),
                "qb_team_change_segments": len(team_changes),
                "qb_change_abs_hit_rate_mean": float(changes.change_hit_rate.abs().mean()),
                "stable_qb_abs_hit_rate_mean": float(stable_qb_controls.change_hit_rate.abs().mean()),
                "qb_change_control_difference": switch_summary,
                "overlay_rows": len(overlay), "correlations": correlations,
                "opponent_model": "Weighted linear regression of hit rate on opponent's pregame prior-eight generated-hit rate; fit from >=64 completed prior offense-games; weights=dropbacks; no same-kickoff outcomes",
                "adjusted_window": "Dropback-weighted mean residual of last eight prior offense games, >=4 valid residuals",
                "qb_primary": "Phase 2 pregame expected-QB excess sack susceptibility z, >=100 prior dropbacks; not a pure QB trait",
                "inputs": [str(v.relative_to(ROOT)).replace("\\", "/") for v in [P4, P3, P2, QB_STABILITY, H3]]}
    (OUT / "analysis.json").write_text(json.dumps(analysis, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({k: analysis[k] for k in ["historical_rows", "complete_case_rows", "train_rows",
                                               "validation_rows", "opponent_adjustment_games",
                                               "pregame_adjustment_rows", "qb_change_segments",
                                               "qb_team_change_segments", "overlay_rows"]}))


if __name__ == "__main__":
    main()
