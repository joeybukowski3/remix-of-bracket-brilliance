"""Phase 4: pregame protection and rush components, persistence, and validation.

Run: python -B scripts/research/nfl-protection-vs-pass-rush-study.py
Inputs are retained Phase 2/3 research artifacts; no network or production writes.
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
OUT = ROOT / "data/nfl/research/protection-vs-pass-rush"
P3 = ROOT / "data/nfl/research/trench-offensive-disruption/game_level.csv"
P2 = ROOT / "data/nfl/research/qb-pressure-trench/team_pregame_hit_ratings.csv"
P3_HELPERS = ROOT / "scripts/research/nfl-trench-offensive-disruption-study.py"
SEED = 20260923

spec = importlib.util.spec_from_file_location("phase3_research_helpers", P3_HELPERS)
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)

OUTCOMES = ["team_sack_rate", "team_sacks", "team_pass_epa_db", "team_pass_success_rate",
            "team_explosive_pass_rate", "team_points", "team_total_margin"]
MODEL_OUTCOMES = ["team_sack_rate", "team_pass_epa_db", "team_pass_success_rate", "team_total_margin"]
MODEL_FORMS = {
    "A protection": ["protection_z"],
    "B rush": ["pass_rush_z"],
    "C additive": ["protection_z", "pass_rush_z"],
    "D interaction": ["protection_z", "pass_rush_z", "component_interaction"],
}
PROTECTION_LABELS = ["elite protection", "good", "average", "poor", "very poor"]
RUSH_LABELS = ["very poor rush", "poor", "average", "good", "elite rush"]


def rate(events):
    denom = sum(x[1] for x in events)
    return sum(x[0] for x in events) / denom if denom > 0 else np.nan


def weighted_rate(events, half_life=4):
    values = events[-16:]
    if not values:
        return np.nan
    weights = np.array([2 ** (-(len(values)-1-i)/half_life) for i in range(len(values))])
    return float(np.dot(weights, [x[0] for x in values]) / np.dot(weights, [x[1] for x in values]))


def percentile(value, reference):
    if not np.isfinite(value) or len(reference) < 16:
        return np.nan
    a = np.asarray(reference)
    return float((np.sum(a < value) + .5*np.sum(a == value))/len(a))


def rolling_components(p3):
    """Process same-kickoff games as a batch, then update both team histories."""
    source = p3.sort_values(["kickoff_utc", "game_id", "team"]).copy()
    assert not source.duplicated(["game_id", "team"]).any()
    off_hist, def_hist = defaultdict(list), defaultdict(list)
    records = []
    for kickoff, batch in source.groupby("kickoff_utc", sort=True):
        league_off = [rate(v[-8:]) for v in off_hist.values() if len(v) >= 4]
        league_def = [rate(v[-8:]) for v in def_hist.values() if len(v) >= 4]
        league_off = [v for v in league_off if np.isfinite(v)]
        league_def = [v for v in league_def if np.isfinite(v)]
        o_mean = np.mean(league_off) if len(league_off) >= 16 else np.nan
        d_mean = np.mean(league_def) if len(league_def) >= 16 else np.nan
        o_sd = np.std(league_off, ddof=1) if len(league_off) >= 16 else np.nan
        d_sd = np.std(league_def, ddof=1) if len(league_def) >= 16 else np.nan
        for row in batch.itertuples():
            own = off_hist[row.team]
            opposing_def = def_hist[row.opponent]
            record = {"game_id": row.game_id, "team": row.team,
                      "offense_prior_games": len(own), "defense_prior_games": len(opposing_def)}
            for stem, hist in [("protection", own), ("pass_rush", opposing_def)]:
                for window in [4, 8, 16]:
                    gate = 8 if window == 16 else 4
                    record[f"{stem}_raw_prior{window}"] = rate(hist[-window:]) if len(hist) >= gate else np.nan
                season_hist = [x for x in hist if x[2] == row.season]
                record[f"{stem}_raw_season_to_date"] = rate(season_hist) if len(season_hist) >= 4 else np.nan
                record[f"{stem}_raw_ewma"] = weighted_rate(hist) if len(hist) >= 4 else np.nan
            op = record["protection_raw_prior8"]
            rush = record["pass_rush_raw_prior8"]
            record["protection_z"] = (op-o_mean)/o_sd if np.isfinite(op) and o_sd > 0 else np.nan
            record["pass_rush_z"] = (rush-d_mean)/d_sd if np.isfinite(rush) and d_sd > 0 else np.nan
            record["protection_percentile"] = percentile(op, league_off)
            record["pass_rush_percentile"] = percentile(rush, league_def)
            records.append(record)
        # Current outcomes become history only after every simultaneous kickoff
        # has received its pregame features.
        by_key = {(r.game_id, r.team): r for r in batch.itertuples()}
        for row in batch.itertuples():
            other = by_key[(row.game_id, row.opponent)]
            off_hist[row.team].append((float(row.actual_hits_allowed), float(row.pass_plays), row.season))
            def_hist[row.team].append((float(other.actual_hits_allowed), float(other.pass_plays), row.season))
    features = pd.DataFrame(records)
    features["component_interaction"] = features.protection_z * features.pass_rush_z
    features["additive_matchup_z"] = (features.protection_z + features.pass_rush_z)/math.sqrt(2)
    features["protection_quintile"] = np.minimum(np.floor(features.protection_percentile*5), 4).astype("Int64")
    features["rush_quintile"] = np.minimum(np.floor(features.pass_rush_percentile*5), 4).astype("Int64")
    return features


def load():
    p3 = pd.read_csv(P3, low_memory=False)
    features = rolling_components(p3)
    game = p3.merge(features, on=["game_id", "team"], how="left", validate="one_to_one",
                    suffixes=("", "_reconstructed"))
    p2 = pd.read_csv(P2)
    p2 = p2[["game_id", "team", "defense_prior_hit_rate", "offense_prior_hit_allowed_rate",
             "historical_pass_rush_edge_z"]]
    game = game.merge(p2, on=["game_id", "team"], suffixes=("", "_p2"), validate="one_to_one")
    assert np.allclose(game.protection_raw_prior8, game.offense_prior_hit_allowed_rate_p2, equal_nan=True, atol=1e-12)
    assert np.allclose(game.pass_rush_raw_prior8, game.defense_prior_hit_rate_p2, equal_nan=True, atol=1e-12)
    assert np.allclose(game.additive_matchup_z, game.historical_pass_rush_edge_z_p2, equal_nan=True, atol=1e-12)
    game["protection_quintile_label"] = game.protection_quintile.map(dict(enumerate(PROTECTION_LABELS)))
    game["rush_quintile_label"] = game.rush_quintile.map(dict(enumerate(RUSH_LABELS)))
    game["risk_group"] = np.select(
        [(game.protection_percentile >= .8) & (game.pass_rush_percentile >= .8),
         (game.protection_percentile >= .8) & (game.pass_rush_percentile < .2),
         (game.protection_percentile < .2) & (game.pass_rush_percentile >= .8)],
        ["very poor protection + elite rush", "very poor protection + very poor rush",
         "elite protection + elite rush"], default="other")
    return game


def stability_row(kind, test, x, y, cohort="all", source_pct=None, target_pct=None):
    pair = pd.DataFrame({"x": x, "y": y}).dropna()
    out = {"component": kind, "test": test, "cohort": cohort,
           **helpers.correlation(pair.x, pair.y)}
    if len(pair) >= 10:
        xq1, xq3 = pair.x.quantile([.25, .75])
        yq1, yq3 = pair.y.quantile([.25, .75])
        top = pair.x >= xq3
        bottom = pair.x <= xq1
        out["top_quartile_retention"] = float((pair.loc[top, "y"] >= yq3).mean())
        out["bottom_quartile_retention"] = float((pair.loc[bottom, "y"] <= yq1).mean())
    else:
        out["top_quartile_retention"] = None
        out["bottom_quartile_retention"] = None
    if source_pct is not None and target_pct is not None:
        p = pd.DataFrame({"x": source_pct, "y": target_pct}).dropna()
        out["rank_retention_n"] = len(p)
        out["rank_retention_within_20pct"] = float(((p.x-p.y).abs() <= .20).mean()) if len(p) else None
    return out


def stability(game, kind):
    """Future rates are evaluation targets only, never pregame features."""
    if kind == "protection":
        events = game[["game_id", "season", "week", "team", "kickoff_utc", "actual_hits_allowed", "pass_plays",
                       "protection_raw_prior4", "protection_raw_prior8", "protection_raw_prior16",
                       "protection_raw_season_to_date", "protection_raw_ewma", "protection_percentile"]].copy()
        count_col = "actual_hits_allowed"
        pct_col = "protection_percentile"
    else:
        # Each offense row carries the opposing defense's pregame rush rating
        # and the hits that defense generated against this offense.
        events = game[["game_id", "season", "week", "opponent", "kickoff_utc",
                       "pass_rush_raw_prior4", "pass_rush_raw_prior8", "pass_rush_raw_prior16",
                       "pass_rush_raw_season_to_date", "pass_rush_raw_ewma", "pass_rush_percentile",
                       "actual_hits_allowed", "pass_plays"]].copy()
        events = events.rename(columns={"opponent": "team", "actual_hits_allowed": "generated_hits"})
        count_col = "generated_hits"
        pct_col = "pass_rush_percentile"
    events = events[events.season <= 2025].sort_values(["team", "season", "week", "kickoff_utc"])
    details = []
    for (team, season), part in events.groupby(["team", "season"], sort=True):
        part = part.reset_index(drop=True)
        ev = list(zip(part[count_col], part.pass_plays))
        for i, row in part.iterrows():
            item = {"team": team, "season": season, "week": row.week,
                    "game_id": row.game_id, "pregame_prior8": row[f"{kind}_raw_prior8"],
                    "pregame_percentile": row[pct_col]}
            for alt in ["prior4", "prior16", "season_to_date", "ewma"]:
                item[f"pregame_{alt}"] = row[f"{kind}_raw_{alt}"]
            for prior, future in [(4, 4), (8, 4), (8, 8)]:
                item[f"prior{prior}_at_game"] = rate(ev[max(0, i-prior):i]) if i >= prior else np.nan
                item[f"next{future}_from_game"] = rate(ev[i:i+future]) if i+future <= len(ev) else np.nan
            details.append(item)
    detail = pd.DataFrame(details)
    rows = []
    for prior, future in [(4, 4), (8, 4), (8, 8)]:
        rows.append(stability_row(kind, f"prior{prior}_vs_next{future}", detail[f"prior{prior}_at_game"],
                                  detail[f"next{future}_from_game"]))
    for alt in ["prior4", "prior8", "prior16", "season_to_date", "ewma"]:
        x = detail.pregame_prior8 if alt == "prior8" else detail[f"pregame_{alt}"]
        rows.append(stability_row(kind, f"pregame_{alt}_vs_next4", x, detail.next4_from_game))
    for season, part in detail.groupby("season"):
        rows.append(stability_row(kind, "prior8_vs_next4", part.prior8_at_game,
                                  part.next4_from_game, str(season)))
    # Overlapping weekly pregame windows are intentionally separated from the
    # nonoverlapping forward tests above.
    detail = detail.sort_values(["team", "season", "week"])
    shifted = detail.groupby(["team", "season"]).pregame_percentile.shift(-1)
    rows.append(stability_row(kind, "next_game_pregame_percentile_OVERLAPPING",
                              detail.pregame_percentile, shifted,
                              source_pct=detail.pregame_percentile, target_pct=shifted))
    half, year = [], []
    for (team, season), part in events.groupby(["team", "season"]):
        first = part[part.week <= 9]
        second = part[part.week >= 10]
        if len(first) >= 4 and len(second) >= 4:
            half.append({"team": team, "season": season,
                         "first": rate(list(zip(first[count_col], first.pass_plays))),
                         "second": rate(list(zip(second[count_col], second.pass_plays)))})
        year.append({"team": team, "season": season,
                     "full": rate(list(zip(part[count_col], part.pass_plays))),
                     "last8": rate(list(zip(part.tail(8)[count_col], part.tail(8).pass_plays))),
                     "first4": rate(list(zip(part.head(4)[count_col], part.head(4).pass_plays))),
                     "first8": rate(list(zip(part.head(8)[count_col], part.head(8).pass_plays)))})
    halves = pd.DataFrame(half)
    years = pd.DataFrame(year)
    rows.append(stability_row(kind, "first_half_vs_second_half", halves["first"], halves["second"]))
    next_year = years.assign(season=years.season-1)
    pairs = years.merge(next_year, on=["team", "season"], suffixes=("_n", "_next"))
    for label, left, right in [("year_n_vs_year_n_plus_1", "full_n", "full_next"),
                               ("last8_vs_next_first4", "last8_n", "first4_next"),
                               ("last8_vs_next_first8", "last8_n", "first8_next")]:
        rows.append(stability_row(kind, label, pairs[left], pairs[right]))
        for season, part in pairs.groupby("season"):
            rows.append(stability_row(kind, label, part[left], part[right], f"{season}_to_{season+1}"))
    return pd.DataFrame(rows), detail


def outcome_summary(data, label, dimension):
    row = {"group": label, "dimension": dimension, "n": len(data), "games": data.game_id.nunique(),
           "small_n_lt_25": len(data) < 25}
    for outcome in OUTCOMES:
        row[f"mean_{outcome}"] = data[outcome].mean()
        row[f"median_{outcome}"] = data[outcome].median()
    return row


def cluster_difference(a, b, outcome, draws=1000):
    """Fixed contrast with paired game resampling across both selections."""
    union = pd.concat([a.assign(_group=1), b.assign(_group=0)], ignore_index=True)
    union = union[["game_id", "_group", outcome]].dropna()
    if union._group.nunique() != 2 or len(union) < 10:
        return {"n_a": len(a), "n_b": len(b), "difference": None, "ci_low": None, "ci_high": None}
    observed = union.loc[union._group == 1, outcome].mean() - union.loc[union._group == 0, outcome].mean()
    grouped = union.groupby(["game_id", "_group"])[outcome].agg(["sum", "count"]).unstack("_group", fill_value=0)
    n = len(grouped)
    rng = np.random.default_rng(SEED)
    ix = rng.integers(0, n, size=(draws, n))
    amean = grouped[("sum", 1)].to_numpy()[ix].sum(axis=1) / grouped[("count", 1)].to_numpy()[ix].sum(axis=1)
    bmean = grouped[("sum", 0)].to_numpy()[ix].sum(axis=1) / grouped[("count", 0)].to_numpy()[ix].sum(axis=1)
    ci = np.quantile(amean-bmean, [.025, .975])
    return {"n_a": len(a), "n_b": len(b), "difference": float(observed),
            "ci_low": float(ci[0]), "ci_high": float(ci[1])}


def model_fit(train, validation, outcome, label, terms):
    tr = train[[outcome, *terms]].dropna()
    va = validation[[outcome, *terms]].dropna()
    x = np.column_stack([np.ones(len(tr)), tr[terms].to_numpy(dtype=float)])
    y = tr[outcome].to_numpy(dtype=float)
    coef = np.linalg.lstsq(x, y, rcond=None)[0]
    yh = x@coef
    rss = np.sum((y-yh)**2)
    tss = np.sum((y-y.mean())**2)
    k = len(terms)
    adj_r2 = 1-(rss/(len(tr)-k-1))/(tss/(len(tr)-1)) if tss > 0 else np.nan
    xv = np.column_stack([np.ones(len(va)), va[terms].to_numpy(dtype=float)])
    vy = va[outcome].to_numpy(dtype=float)
    pred = xv@coef
    base = np.full(len(va), y.mean())
    return {"outcome": outcome, "model": label, "train_n": len(tr), "validation_n": len(va),
            "train_adjusted_r2": float(adj_r2), "train_rmse": float(np.sqrt(np.mean((y-yh)**2))),
            "validation_rmse": float(np.sqrt(np.mean((vy-pred)**2))),
            "validation_mae": float(np.mean(abs(vy-pred))),
            "validation_constant_rmse": float(np.sqrt(np.mean((vy-base)**2))),
            "validation_r2_vs_train_mean": float(1-np.mean((vy-pred)**2)/np.mean((vy-base)**2)),
            "train_coefficients": json.dumps(dict(zip(["intercept", *terms], map(float, coef))))}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    g = load()
    selected = ["season", "week", "game_id", "kickoff_utc", "team", "opponent", "venue", "team_spread",
                "closing_total", "implied_team_total", "team_total_margin", "team_points", "team_sack_rate",
                "team_sacks", "pass_plays", "team_pass_epa_db", "team_pass_epa", "team_pass_success_rate",
                "team_explosive_pass_rate", "actual_hits_allowed", "historical_pass_rush_edge_z",
                "offense_prior_games", "defense_prior_games", "protection_z", "pass_rush_z",
                "protection_percentile", "pass_rush_percentile", "protection_quintile",
                "rush_quintile", "protection_quintile_label", "rush_quintile_label", "risk_group",
                "component_interaction", "additive_matchup_z"]
    selected += [f"{stem}_raw_{window}" for stem in ["protection", "pass_rush"]
                 for window in ["prior4", "prior8", "prior16", "season_to_date", "ewma"]]
    assert not g.duplicated(["game_id", "team"]).any()
    g[selected].to_csv(OUT / "game_level.csv", index=False, float_format="%.12g")
    protection, protection_pairs = stability(g, "protection")
    rush, rush_pairs = stability(g, "pass_rush")
    protection.to_csv(OUT / "protection_stability.csv", index=False, float_format="%.12g")
    rush.to_csv(OUT / "pass_rush_stability.csv", index=False, float_format="%.12g")
    protection_pairs.to_csv(OUT / "protection_stability_pairs.csv", index=False, float_format="%.12g")
    rush_pairs.to_csv(OUT / "pass_rush_stability_pairs.csv", index=False, float_format="%.12g")
    historical = g[(g.season <= 2025) & g.protection_z.notna() & g.pass_rush_z.notna()].copy()
    exploratory = historical[historical.season <= 2023]
    heldout = historical[historical.season >= 2024]
    windows = {"2022-2023 exploratory": exploratory, "2024-2025 heldout": heldout,
               "2022-2025 full": historical}
    windows.update({str(y): historical[historical.season == y] for y in [2022, 2023, 2024, 2025]})
    season_rows, threshold_rows, matrix_rows, correlations = [], [], [], []
    for name, data in windows.items():
        season_rows.append({"window": name, **outcome_summary(data, "all", "all")})
        for component, var in [("protection", "protection_z"), ("pass_rush", "pass_rush_z")]:
            for outcome in OUTCOMES:
                correlations.append({"window": name, "component": component, "outcome": outcome,
                                     **helpers.correlation(data[var], data[outcome])})
            for q in range(5):
                field = "protection_quintile" if component == "protection" else "rush_quintile"
                labels = PROTECTION_LABELS if component == "protection" else RUSH_LABELS
                season_rows.append({"window": name,
                                    **outcome_summary(data[data[field] == q], labels[q], component)})
            pct = "protection_percentile" if component == "protection" else "pass_rush_percentile"
            for cutoff in [.5, .75, .8, .9]:
                subset = data[data[pct] >= cutoff]
                threshold_rows.append({"window": name, "threshold": f"{component} top {round((1-cutoff)*100)}%",
                                       **outcome_summary(subset, "", component)})
        for pq in range(5):
            for rq in range(5):
                cell = data[(data.protection_quintile == pq) & (data.rush_quintile == rq)]
                matrix_rows.append({"window": name, "protection_quintile": pq+1,
                                    "protection_label": PROTECTION_LABELS[pq], "rush_quintile": rq+1,
                                    "rush_label": RUSH_LABELS[rq], **outcome_summary(cell, "", "matrix")})
        for p_cut in [.5, .75, .8, .9]:
            subset = data[(data.protection_percentile >= p_cut) & (data.pass_rush_percentile >= .8)]
            threshold_rows.append({"window": name,
                                   "threshold": f"protection top {round((1-p_cut)*100)}% + rush top 20%",
                                   **outcome_summary(subset, "", "combined")})
    pd.DataFrame(season_rows).to_csv(OUT / "season_summaries.csv", index=False, float_format="%.12g")
    pd.DataFrame(threshold_rows).to_csv(OUT / "threshold_summaries.csv", index=False, float_format="%.12g")
    pd.DataFrame(matrix_rows).to_csv(OUT / "interaction_matrix.csv", index=False, float_format="%.12g")
    alternative_rows = []
    for window, data in windows.items():
        for component in ["protection", "pass_rush"]:
            for variant in ["prior4", "prior8", "prior16", "season_to_date", "ewma"]:
                for outcome in ["team_sack_rate", "team_pass_epa_db", "team_pass_success_rate"]:
                    alternative_rows.append({"window": window, "component": component, "variant": variant,
                                             "outcome": outcome,
                                             **helpers.correlation(data[f"{component}_raw_{variant}"], data[outcome])})
    pd.DataFrame(alternative_rows).to_csv(OUT / "window_comparison.csv", index=False, float_format="%.12g")
    regressions, comparisons = [], []
    for name, data in windows.items():
        for outcome in MODEL_OUTCOMES:
            for label, terms in MODEL_FORMS.items():
                for row in helpers.ols(data, outcome, terms):
                    regressions.append({"window": name, **row, "signal_form": label})
    for outcome in MODEL_OUTCOMES:
        for label, terms in MODEL_FORMS.items():
            comparisons.append(model_fit(exploratory, heldout, outcome, label, terms))
    pd.DataFrame(regressions).to_csv(OUT / "regression_results.csv", index=False, float_format="%.12g")
    pd.DataFrame(comparisons).to_csv(OUT / "model_comparison.csv", index=False, float_format="%.12g")
    pd.DataFrame(comparisons).to_csv(OUT / "validation_results.csv", index=False, float_format="%.12g")
    contrast_rows = []
    contrast_defs = [
        ("very poor protection: elite vs very poor rush", (4, 4), (4, 0)),
        ("very poor protection: average vs very poor rush", (4, 2), (4, 0)),
        ("very poor protection: elite vs average rush", (4, 4), (4, 2)),
        ("elite rush: very poor vs elite protection", (4, 4), (0, 4)),
        ("elite rush: average vs elite protection", (2, 4), (0, 4)),
        ("elite rush: very poor vs average protection", (4, 4), (2, 4)),
    ]
    for window, data in windows.items():
        for label, (ap, ar), (bp, br) in contrast_defs:
            a = data[(data.protection_quintile == ap) & (data.rush_quintile == ar)]
            b = data[(data.protection_quintile == bp) & (data.rush_quintile == br)]
            for outcome in MODEL_OUTCOMES:
                contrast_rows.append({"window": window, "contrast": label, "outcome": outcome,
                                      **cluster_difference(a, b, outcome)})
    pd.DataFrame(contrast_rows).to_csv(OUT / "matchup_contrasts.csv", index=False, float_format="%.12g")
    overlay = g[(g.season == 2026) & (g.week == 2)].copy()
    overlay["espn_pbwr_rank"] = overlay.espn_opponent_pbwr_rank
    overlay["espn_opponent_prwr_rank"] = overlay.espn_prwr_rank
    overlay["espn_defensive_rank_edge"] = overlay.espn_rank_edge
    overlay["offense"] = overlay.team
    overlay["defense"] = overlay.opponent
    overlay_cols = ["game_id", "week", "offense", "defense", "espn_pbwr_rank", "espn_opponent_prwr_rank",
                    "espn_defensive_rank_edge", "protection_raw_prior8", "pass_rush_raw_prior8",
                    "protection_z", "pass_rush_z", "protection_percentile", "pass_rush_percentile",
                    "protection_quintile_label", "rush_quintile_label", "risk_group",
                    "team_sack_rate", "team_sacks", "team_pass_epa_db", "team_pass_success_rate",
                    "team_points", "implied_team_total", "team_total_margin"]
    assert len(overlay) == 32 and overlay.espn_rating_through_week.eq(1).all()
    overlay[overlay_cols].sort_values("espn_defensive_rank_edge", ascending=False).to_csv(
        OUT / "overlay_2026.csv", index=False, float_format="%.12g")
    analysis = {"historical_rows": len(historical), "historical_games": historical.game_id.nunique(),
                "exploratory_rows": len(exploratory), "heldout_rows": len(heldout),
                "season_rows": {str(y): len(historical[historical.season == y]) for y in range(2022, 2026)},
                "overlay_week2_rows": len(overlay),
                "primary_specification": "prior-eight hits divided by dropbacks, minimum four prior games; z and percentiles from all eligible team histories at kickoff",
                "all_simultaneous_games_batched": True, "quintile_definition": "floor(5*pregame league percentile), capped at 4",
                "stability_persistence_note": "future rates are evaluation targets, not pregame features; week-to-week pregame percentile windows overlap",
                "correlations": correlations,
                "inputs": [str(P3.relative_to(ROOT)).replace("\\", "/"),
                           str(P2.relative_to(ROOT)).replace("\\", "/"),
                           str(P3_HELPERS.relative_to(ROOT)).replace("\\", "/")]}
    (OUT / "analysis.json").write_text(json.dumps(analysis, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({k: analysis[k] for k in ["historical_rows", "historical_games", "exploratory_rows",
                                               "heldout_rows", "season_rows", "overlay_week2_rows"]}))


if __name__ == "__main__":
    main()
