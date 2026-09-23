"""Offline QB sack-susceptibility × QB-hit matchup study. Run: python scripts/research/nfl-qb-pressure-trench-study.py"""
from __future__ import annotations

import json
import math
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/nfl/research/qb-pressure-trench"
OUT.mkdir(parents=True, exist_ok=True)
TEAM_ALIAS = {"la": "lar", "was": "wsh", "jac": "jax"}


def abbr(value):
    value = str(value).lower()
    return TEAM_ALIAS.get(value, value)


def load_csv(path):
    return pd.read_csv(ROOT / path, low_memory=False)


def load_json(path):
    return json.loads((ROOT / path).read_text(encoding="utf8"))


def number(value):
    try:
        value = float(value)
        return value if math.isfinite(value) else None
    except (TypeError, ValueError):
        return None


def div(a, b):
    return a / b if a is not None and b is not None and b > 0 else None


def passer_rating(completions, attempts, yards, touchdowns, interceptions):
    if any(v is None for v in [completions, attempts, yards, touchdowns, interceptions]) or attempts <= 0:
        return None
    parts = [(completions / attempts - .3) * 5, (yards / attempts - 3) * .25,
             touchdowns / attempts * 20, 2.375 - interceptions / attempts * 25]
    return sum(max(0, min(2.375, p)) for p in parts) / 6 * 100


def metric_history(history, n=None):
    h = history if n is None else history[-n:]
    dropbacks = sum(r["dropbacks"] for r in h)
    sacks = sum(r["sacks"] for r in h)
    hits = sum(r["hits"] for r in h)
    return {"games": len(h), "dropbacks": dropbacks, "sacks": sacks, "hits": hits,
            "sack_rate": div(sacks, dropbacks), "hit_rate": div(hits, dropbacks)}


def league_fit(prior_qb_games):
    valid = [r for r in prior_qb_games if r["dropbacks"] > 0]
    if len(valid) < 50:
        return None
    x = np.array([r["hits"] / r["dropbacks"] for r in valid])
    y = np.array([r["sacks"] / r["dropbacks"] for r in valid])
    design = np.column_stack([np.ones(len(x)), x])
    intercept, slope = np.linalg.lstsq(design, y, rcond=None)[0]
    residual_sd = np.std(y - (intercept + slope * x), ddof=1)
    return float(intercept), float(slope), float(residual_sd)


def corr(x, y, method="pearson"):
    pair = pd.DataFrame({"x": x, "y": y}).dropna()
    if len(pair) < 3 or pair.x.nunique() <= 1 or pair.y.nunique() <= 1:
        return None
    if method == "spearman":
        return float(pair.x.rank(method="average").corr(pair.y.rank(method="average")))
    return float(pair.x.corr(pair.y))


def summarize(group, subset):
    w = int((subset.ats_result == "W").sum())
    l = int((subset.ats_result == "L").sum())
    p = int((subset.ats_result == "P").sum())
    n = w + l
    if n:
        z, rate = 1.96, w / n
        center = (rate + z*z/(2*n))/(1+z*z/n)
        radius = z * math.sqrt(rate*(1-rate)/n + z*z/(4*n*n))/(1+z*z/n)
        ci = [center-radius, center+radius]
    else:
        ci = [None, None]
    return {"group": group, "n": len(subset), "games": subset.game_id.nunique(), "ats_w": w, "ats_l": l, "ats_p": p,
            "ats_pct": div(w, n), "ats_ci_low": ci[0], "ats_ci_high": ci[1],
            "mean_ats_margin": subset.ats_margin.mean(), "median_ats_margin": subset.ats_margin.median(),
            "su_w": int((subset.su_result == "W").sum()), "su_l": int((subset.su_result == "L").sum()),
            "su_t": int((subset.su_result == "T").sum()),
            "su_pct": div(int((subset.su_result == "W").sum()), int(subset.su_result.isin(["W", "L"]).sum())),
            "mean_score_margin": subset.score_margin.mean(), "mean_qb_team_pass_epa_db": subset.team_pass_epa_db.mean(),
            "mean_sack_rate": subset.team_sack_rate.mean(), "mean_hits_allowed_rate": subset.actual_hits_allowed_rate.mean(),
            "mean_cpoe": subset.team_cpoe.mean(), "mean_yards_attempt": subset.qb_yards_attempt.mean(),
            "mean_pass_success_rate": subset.team_pass_success_rate.mean(),
            "mean_explosive_pass_rate": subset.team_explosive_pass_rate.mean(),
            "mean_qb_completion_pct": subset.qb_completion_pct.mean(),
            "mean_qb_passer_rating": subset.qb_passer_rating.mean(),
            "mean_qb_interceptions": subset.qb_interceptions.mean(), "mean_team_sack_fumbles": subset.team_sack_fumbles.mean(),
            "mean_sacks": subset.team_sacks.mean(), "mean_hits_allowed": subset.actual_hits_allowed.mean()}


def fit_ols(frame, target, predictors):
    sub = frame[[target, "game_id", *predictors]].dropna()
    if len(sub) <= len(predictors) + 5:
        return None
    x = np.column_stack([np.ones(len(sub)), sub[predictors].to_numpy(dtype=float)])
    y = sub[target].to_numpy(dtype=float)
    beta = np.linalg.lstsq(x, y, rcond=None)[0]
    resid = y - x @ beta
    bread = np.linalg.pinv(x.T @ x)
    meat = np.zeros((x.shape[1], x.shape[1]))
    for _, positions in sub.groupby("game_id").indices.items():
        score = x[positions].T @ resid[positions]
        meat += np.outer(score, score)
    clusters = sub.game_id.nunique()
    correction = clusters / (clusters - 1) * (len(sub)-1)/(len(sub)-x.shape[1]) if clusters > 1 else 1
    se = np.sqrt(np.maximum(0, np.diag(bread @ meat @ bread) * correction))
    return {"n": len(sub), "games": clusters, "predictors": ["intercept", *predictors],
            "coefficient": beta.tolist(), "cluster_se": se.tolist(),
            "ci95": [[float(v - 1.96*s), float(v + 1.96*s)] for v, s in zip(beta, se)],
            "p_normal_approx": [math.erfc(abs(v/s)/math.sqrt(2)) if s > 0 else None for v, s in zip(beta, se)],
            "r2": 1 - float(np.sum(resid**2)/np.sum((y-y.mean())**2)) if np.var(y) else None}


def predictions(train, test, target, predictors):
    a = train[[target, *predictors]].dropna()
    b = test[[target, *predictors]].dropna()
    if len(a) < 30 or len(b) < 10:
        return None
    xa = np.column_stack([np.ones(len(a)), a[predictors].to_numpy(dtype=float)])
    xb = np.column_stack([np.ones(len(b)), b[predictors].to_numpy(dtype=float)])
    coef = np.linalg.lstsq(xa, a[target].to_numpy(dtype=float), rcond=None)[0]
    err = xb @ coef - b[target].to_numpy(dtype=float)
    return {"train_n": len(a), "test_n": len(b), "test_mae": float(np.mean(np.abs(err))),
            "test_rmse": float(np.sqrt(np.mean(err**2))), "test_bias": float(np.mean(err)),
            "test_prediction_actual_pearson": corr(pd.Series(xb @ coef), b[target].reset_index(drop=True))}


# Audit-established sources. No fetch, production generator, or Phase 1 write.
team_stats = {}
qb_by_team_game = {}
game_id_by_2022_team_week = {}
for game in load_json("public/data/nfl/2022/results.json")["results"]:
    if game["seasonType"] == "REG":
        for side in ["home", "away"]:
            game_id_by_2022_team_week[(game["week"], game[side + "Abbr"])] = game["gameId"]
for season in range(2022, 2027):
    stats_path = (f"data/nfl/nflverse/stats-team-week-current/stats_team_week_{season}.csv" if season == 2026
                  else f"data/nfl/nflverse/stats-team-week/stats_team_week_{season}.csv")
    for rec in load_csv(stats_path).query("season_type == 'REG'").to_dict("records"):
        team_stats[(rec["game_id"], abbr(rec["team"]))] = rec
    qbs = load_csv(f"data/nfl/nflverse/stats-player-week/stats_player_week_{season}.csv")
    if season == 2022:
        qbs["team"] = qbs.recent_team
        qbs["game_id"] = [game_id_by_2022_team_week.get((week, abbr(team))) for week, team in zip(qbs.week, qbs.team)]
    qbs = qbs[(qbs.position == "QB") & (qbs.season_type == "REG") & (qbs.attempts > 0)]
    for (game_id, team), group in qbs.groupby(["game_id", "team"]):
        records = group.sort_values(["attempts", "player_id"], ascending=[False, True]).to_dict("records")
        qb_by_team_game[(game_id, abbr(team))] = records

epa = {}
success = {}
volume = {}
for season in range(2022, 2027):
    for source, target in [("epa-team-game", epa), ("play-volume-team-game", volume)]:
        file = f"data/nfl/nflverse/{source}/{source.replace('-', '_')}_{season}.csv"
        for rec in load_csv(file).to_dict("records"):
            target[(rec["game_id"], abbr(rec["team"]))] = rec
    if season < 2026:
        for rec in load_csv(f"data/nfl/nflverse/success-team-game/success_team_game_{season}.csv").to_dict("records"):
            success[(rec["game_id"], abbr(rec["team"]))] = rec

source_games = []
with (ROOT / "data/nfl/research/situational-trend-team-games-v1.jsonl").open(encoding="utf8") as file:
    for line in file:
        rec = json.loads(line)
        if 2022 <= rec["season"] <= 2025:
            source_games.append({"season": rec["season"], "week": rec["week"], "game_id": rec["gameId"],
                                 "kickoff_utc": rec["kickoffUtc"], "team": rec["team"], "opponent": rec["opponent"],
                                 "venue": rec["venue"], "team_spread": rec["teamSpread"],
                                 "team_points": rec["teamScore"], "opponent_points": rec["opponentScore"],
                                 "ats_margin": rec["atsCoverMargin"], "ats_result": rec["atsResult"],
                                 "score_margin": rec["pointMargin"], "su_result": rec["suResult"]})
phase1 = load_csv("data/nfl/research/trench-advantage/team_games.csv")
for rec in phase1.to_dict("records"):
    source_games.append({"season": 2026, "week": rec["week"], "game_id": rec["game_id"],
                         "kickoff_utc": rec["kickoff_utc"], "team": rec["team"], "opponent": rec["opponent"],
                         "venue": rec["venue"], "team_spread": rec["team_spread"],
                         "team_points": rec["team_points"], "opponent_points": rec["opponent_points"],
                         "ats_margin": rec["ats_margin"], "ats_result": rec["ats_result"],
                         "score_margin": rec["score_margin"], "su_result": rec["su_result"]})
source_games.sort(key=lambda r: (r["kickoff_utc"], r["game_id"], r["team"]))
archived_week2_qb = {}
with (ROOT / "data/nfl/predictions/2026/02/nfl-passing-direct-ridge.jsonl").open(encoding="utf8") as file:
    for line in file:
        rec = json.loads(line)
        if rec.get("mode") != "production" or rec.get("status") != "projected" or rec["prediction_timestamp"] >= rec["kickoff_utc"]:
            continue
        key = (rec["game_id"], abbr(rec["team"]))
        if key not in archived_week2_qb or rec["prediction_timestamp"] > archived_week2_qb[key]["prediction_timestamp"]:
            archived_week2_qb[key] = rec

team_history = defaultdict(list)
defense_history = defaultdict(list)
qb_history = defaultdict(list)
prior_single_qb_games = []
prior_edges = []
last_qb_team_season = {}
pregame_rows = []
team_rating_rows = []
coverage = defaultdict(int)

for kickoff, batch in pd.DataFrame(source_games).groupby("kickoff_utc", sort=True):
    batch_records = batch.to_dict("records")
    league = league_fit(prior_single_qb_games)
    def league_rates(histories):
        values = [div(sum(h["hits"] for h in hist[-8:]), sum(h["dropbacks"] for h in hist[-8:]))
                  for hist in histories.values() if len(hist) >= 4]
        values = [v for v in values if v is not None]
        return (float(np.mean(values)), float(np.std(values, ddof=1))) if len(values) >= 16 else (None, None)
    off_hit_mean, off_hit_sd = league_rates(team_history)
    def_hit_mean, def_hit_sd = league_rates(defense_history)
    prior_hit_median = float(np.median([r["hits"]/r["dropbacks"] for r in prior_single_qb_games])) if len(prior_single_qb_games) >= 50 else None
    qb_population = []
    if league:
        intercept, slope, residual_sd = league
        active_ids = {qid for (season, _team), qid in last_qb_team_season.items() if season == batch_records[0]["season"]}
        if batch_records[0]["season"] == 2026:
            active_ids.update(str(r["player_id"]).removeprefix("gsis:") for r in archived_week2_qb.values() if r["prediction_timestamp"] < kickoff)
        for qid in active_ids:
            hist = qb_history[qid]
            m = metric_history(hist)
            if m["dropbacks"] >= 100 and residual_sd > 0:
                qb_population.append((m["sack_rate"] - intercept - slope*m["hit_rate"]) / residual_sd)
    for base in batch_records:
        game_id, team, opponent = base["game_id"], base["team"], base["opponent"]
        own = team_stats.get((game_id, team))
        opp = team_stats.get((game_id, opponent))
        own_epa = epa.get((game_id, team))
        own_success = success.get((game_id, team))
        own_volume = volume.get((game_id, team))
        own_qbs = qb_by_team_game.get((game_id, team), [])
        previous_team_qb_id = last_qb_team_season.get((base["season"], team))
        archived_qb = archived_week2_qb.get((game_id, team)) if base["season"] == 2026 and base["week"] == 2 else None
        prior_qb_id = str(archived_qb["player_id"]).removeprefix("gsis:") if archived_qb else previous_team_qb_id
        actual_id = str(own_qbs[0]["player_id"]) if own_qbs else None
        actual_name = str(own_qbs[0]["player_display_name"]) if own_qbs else None
        prior_qb = qb_history[prior_qb_id] if prior_qb_id else []
        m = metric_history(prior_qb)
        m8, m16 = metric_history(prior_qb, 8), metric_history(prior_qb, 16)
        high_hit = [r for r in prior_qb if prior_hit_median is not None and r["hits"]/r["dropbacks"] >= prior_hit_median and r.get("pass_epa_db") is not None]
        low_hit = [r for r in prior_qb if prior_hit_median is not None and r["hits"]/r["dropbacks"] < prior_hit_median and r.get("pass_epa_db") is not None]
        high_hit_epa_drop = (float(np.mean([r["pass_epa_db"] for r in low_hit])) - float(np.mean([r["pass_epa_db"] for r in high_hit]))
                             if len(high_hit) >= 3 and len(low_hit) >= 3 and sum(r["dropbacks"] for r in high_hit) >= 50 and sum(r["dropbacks"] for r in low_hit) >= 50 else None)
        vuln = (m["sack_rate"] - league[0] - league[1]*m["hit_rate"]) / league[2] if league and m["dropbacks"] >= 50 and league[2] > 0 else None
        vuln8 = (m8["sack_rate"] - league[0] - league[1]*m8["hit_rate"]) / league[2] if league and m8["dropbacks"] >= 50 and league[2] > 0 else None
        vuln16 = (m16["sack_rate"] - league[0] - league[1]*m16["hit_rate"]) / league[2] if league and m16["dropbacks"] >= 50 and league[2] > 0 else None
        percentile = ((sum(x < vuln for x in qb_population) + .5*sum(x == vuln for x in qb_population)) / len(qb_population)
                      if vuln is not None and len(qb_population) >= 10 else None)
        tier = ("highly vulnerable" if percentile is not None and percentile >= .90 else
                "vulnerable" if percentile is not None and percentile >= .75 else
                "resilient" if percentile is not None and percentile <= .25 else
                "average" if percentile is not None else "unrated")
        def_hist, off_hist = defense_history[opponent], team_history[team]
        def_metrics, off_metrics = metric_history(def_hist, 8), metric_history(off_hist, 8)
        defense_hit_rate = def_metrics["hit_rate"] if def_metrics["games"] >= 4 else None
        offense_hit_allowed_rate = off_metrics["hit_rate"] if off_metrics["games"] >= 4 else None
        edge = (((defense_hit_rate - def_hit_mean)/def_hit_sd + (offense_hit_allowed_rate - off_hit_mean)/off_hit_sd)/math.sqrt(2)
                if defense_hit_rate is not None and offense_hit_allowed_rate is not None and def_hit_mean is not None
                and off_hit_mean is not None and def_hit_sd and off_hit_sd and def_hit_sd > 0 and off_hit_sd > 0 else None)
        edge_prior_percentile = ((sum(x < edge for x in prior_edges) + .5*sum(x == edge for x in prior_edges))/len(prior_edges)
                                 if edge is not None and len(prior_edges) >= 100 else None)
        prior_volume = volume.get((off_hist[-1]["game_id"], team)) if off_hist else None
        pass_rate = div(number(prior_volume.get("pass_plays")), number(prior_volume.get("eligible_plays"))) if prior_volume else None
        proe = div(number(prior_volume.get("pass_oe_sum")), number(prior_volume.get("pass_oe_count"))) if prior_volume else None
        dropbacks = number(own_epa.get("pass_plays")) if own_epa else None
        qb_share = div(number(own_qbs[0]["attempts"]), sum(number(q["attempts"]) or 0 for q in own_qbs)) if own_qbs else None
        row = {**base, "expected_qb_id": prior_qb_id,
               "expected_qb_name": archived_qb["player_name_at_prediction"] if archived_qb else prior_qb[-1]["name"] if prior_qb else None,
               "expected_qb_source": "archived_week2_prediction" if archived_qb else "previous_team_game" if prior_qb_id else None,
               "expected_qb_source_game": off_hist[-1]["game_id"] if off_hist and not archived_qb else None,
               "expected_qb_source_timestamp": archived_qb["prediction_timestamp"] if archived_qb else None,
               "previous_team_game_qb_id": previous_team_qb_id,
               "actual_primary_qb_id": actual_id, "actual_primary_qb_name": actual_name,
               "actual_matches_expected": prior_qb_id == actual_id if prior_qb_id and actual_id else None,
               "actual_qb_attempt_share": qb_share,
               "qb_prior_games": m["games"], "qb_prior_dropbacks": m["dropbacks"],
               "qb_prior_sacks": m["sacks"], "qb_prior_sack_rate": m["sack_rate"],
               "qb_prior_hit_allowed_rate": m["hit_rate"], "qb_vulnerability_z": vuln,
               "qb_vulnerability_trailing8_z": vuln8, "qb_vulnerability_trailing16_z": vuln16,
               "qb_high_hit_game_epa_drop": high_hit_epa_drop, "qb_prior_high_hit_games": len(high_hit),
               "qb_prior_low_hit_games": len(low_hit),
               "qb_vulnerability_percentile": percentile, "qb_tier": tier,
               "qb_gate_50": m["dropbacks"] >= 50, "qb_gate_100": m["dropbacks"] >= 100,
               "qb_gate_200": m["dropbacks"] >= 200,
               "defense_prior_games": def_metrics["games"], "offense_prior_games": off_metrics["games"],
               "defense_prior_hit_rate": defense_hit_rate, "offense_prior_hit_allowed_rate": offense_hit_allowed_rate,
               "historical_pass_rush_edge_z": edge,
               "edge_prior_percentile": edge_prior_percentile,
               "team_pass_epa_db": div(number(own_epa.get("pass_epa")), dropbacks) if own_epa else None,
               "team_pass_epa": number(own_epa.get("pass_epa")) if own_epa else None,
               "team_pass_success_rate": div(number(own_success.get("pass_success")), number(own_success.get("pass_plays"))) if own_success else None,
               "team_sack_rate": div(number(own.get("sacks_suffered")), dropbacks) if own else None,
               "team_sacks": number(own.get("sacks_suffered")) if own else None,
               "actual_hits_allowed_rate": div(number(opp.get("def_qb_hits")), dropbacks) if opp else None,
               "actual_hits_allowed": number(opp.get("def_qb_hits")) if opp else None,
               "team_cpoe": number(own.get("passing_cpoe")) if own else None,
               "team_interceptions": number(own.get("passing_interceptions")) if own else None,
               "team_sack_fumbles": number(own.get("sack_fumbles")) if own else None,
               "team_explosive_pass_rate": div(number(own.get("passing_20")), number(own.get("attempts"))) if own else None,
               "qb_attempts": number(own_qbs[0]["attempts"]) if own_qbs else None,
               "qb_completions": number(own_qbs[0]["completions"]) if own_qbs else None,
               "qb_interceptions": number(own_qbs[0]["interceptions"]) if own_qbs else None,
               "qb_yards_attempt": div(number(own_qbs[0]["passing_yards"]), number(own_qbs[0]["attempts"])) if own_qbs else None,
               "qb_completion_pct": div(number(own_qbs[0]["completions"]), number(own_qbs[0]["attempts"])) if own_qbs else None,
               "qb_passer_rating": passer_rating(number(own_qbs[0]["completions"]), number(own_qbs[0]["attempts"]),
                                                  number(own_qbs[0]["passing_yards"]), number(own_qbs[0]["passing_tds"]),
                                                  number(own_qbs[0]["interceptions"])) if own_qbs else None,
               "pregame_pass_rate_last_game": pass_rate, "pregame_proe_last_game": proe,
               "league_prior_single_qb_games": len(prior_single_qb_games)}
        pregame_rows.append(row)
        team_rating_rows.append({k: row[k] for k in ["season", "week", "game_id", "kickoff_utc", "team", "opponent", "defense_prior_games", "offense_prior_games", "defense_prior_hit_rate", "offense_prior_hit_allowed_rate", "historical_pass_rush_edge_z", "edge_prior_percentile"]})
        coverage["source_team_games"] += 1
        if own is None or opp is None or own_epa is None:
            coverage["missing_team_stats_or_epa"] += 1
    # Commit outcomes only after every game at this kickoff was rated.
    for base in batch_records:
        game_id, team, opponent = base["game_id"], base["team"], base["opponent"]
        own, opp = team_stats.get((game_id, team)), team_stats.get((game_id, opponent))
        own_epa = epa.get((game_id, team))
        opp_epa = epa.get((game_id, opponent))
        qbs = qb_by_team_game.get((game_id, team), [])
        dropbacks = number(own_epa.get("pass_plays")) if own_epa else None
        sacks = number(own.get("sacks_suffered")) if own else None
        hits = number(opp.get("def_qb_hits")) if opp else None
        if dropbacks and sacks is not None and hits is not None:
            game_entry = {"game_id": game_id, "season": base["season"], "week": base["week"],
                          "kickoff_utc": kickoff, "dropbacks": dropbacks, "sacks": sacks, "hits": hits,
                          "pass_epa_db": div(number(own_epa.get("pass_epa")), dropbacks)}
            team_history[team].append(game_entry)
            defense_dropbacks = number(opp_epa.get("pass_plays")) if opp_epa else None
            defense_hits = number(own.get("def_qb_hits")) if own else None
            if defense_dropbacks and defense_hits is not None:
                defense_history[team].append({"game_id": game_id, "season": base["season"], "week": base["week"],
                                              "kickoff_utc": kickoff, "dropbacks": defense_dropbacks,
                                              "sacks": number(own.get("def_sacks")) or 0, "hits": defense_hits})
            if len(qbs) == 1:
                qid = str(qbs[0]["player_id"])
                qb_entry = {**game_entry, "name": str(qbs[0]["player_display_name"]), "team": team, "qb_id": qid}
                qb_history[qid].append(qb_entry)
                prior_single_qb_games.append(qb_entry)
        if qbs:
            last_qb_team_season[(base["season"], team)] = str(qbs[0]["player_id"])
    prior_edges.extend(r["historical_pass_rush_edge_z"] for r in pregame_rows[-len(batch_records):] if r["historical_pass_rush_edge_z"] is not None)

df = pd.DataFrame(pregame_rows)
assert not df.duplicated(["game_id", "team"]).any()
assert len(df[df.season.between(2022, 2025)]) == 2174
for season, week in [(2022, 1), (2023, 1), (2024, 1), (2025, 1), (2026, 1)]:
    assert df[(df.season == season) & (df.week == week)].expected_qb_id.isna().all()
assert df[df.historical_pass_rush_edge_z.notna()].eval("defense_prior_games >= 4 and offense_prior_games >= 4").all()
assert (df[df.qb_gate_100].qb_prior_dropbacks >= 100).all()

# The percentile references only edges from games completed before this kickoff batch.
df["edge_bucket"] = pd.cut(df.historical_pass_rush_edge_z, [-np.inf, -.5, .5, 1, 1.5, np.inf],
                           labels=["favorable protection", "neutral", "moderate disadvantage", "large disadvantage", "extreme disadvantage"])
df["market_role"] = np.where(df.team_spread < 0, "favorite", np.where(df.team_spread > 0, "underdog", "pickem"))
df["spread_band"] = np.where(df.team_spread.abs() <= 3, "0-3", np.where(df.team_spread.abs() <= 6.5, "3.5-6.5", "7+"))
df["interaction"] = df.historical_pass_rush_edge_z * df.qb_vulnerability_z
df["prior_pass_rate_high"] = df.pregame_pass_rate_last_game >= df.groupby(["season", "week"]).pregame_pass_rate_last_game.transform("median")
df.to_csv(OUT / "game_interactions.csv", index=False)
df[["season", "week", "game_id", "kickoff_utc", "team", "expected_qb_id", "expected_qb_name", "expected_qb_source", "expected_qb_source_game", "expected_qb_source_timestamp", "previous_team_game_qb_id", "qb_prior_games", "qb_prior_dropbacks", "qb_prior_sack_rate", "qb_prior_hit_allowed_rate", "qb_vulnerability_z", "qb_vulnerability_trailing8_z", "qb_vulnerability_trailing16_z", "qb_high_hit_game_epa_drop", "qb_prior_high_hit_games", "qb_prior_low_hit_games", "qb_vulnerability_percentile", "qb_tier", "qb_gate_50", "qb_gate_100", "qb_gate_200"]].to_csv(OUT / "qb_pregame_vulnerability.csv", index=False)
pd.DataFrame(team_rating_rows).to_csv(OUT / "team_pregame_hit_ratings.csv", index=False)

eligible = df[(df.season <= 2025) & df.qb_gate_100 & df.historical_pass_rush_edge_z.notna() & df.qb_vulnerability_percentile.notna()].copy()
windows = {"2022-2025 available": eligible, "2023-2025": eligible[eligible.season >= 2023],
           "2022-2023 explore": eligible[eligible.season <= 2023], "2024-2025 validate": eligible[eligible.season >= 2024],
           "2026 live": df[(df.season == 2026) & df.qb_gate_100 & df.historical_pass_rush_edge_z.notna()]}
windows.update({str(season): eligible[eligible.season == season] for season in range(2022, 2026)})
summaries = []
matrix = []
for window, data in windows.items():
    selectors = {"all": pd.Series(True, index=data.index), "edge top quartile": data.edge_prior_percentile >= .75,
                 "edge top 20%": data.edge_prior_percentile >= .80, "edge top 10%": data.edge_prior_percentile >= .90,
                 "edge z >=0.5": data.historical_pass_rush_edge_z >= .5,
                 "edge z >=1": data.historical_pass_rush_edge_z >= 1,
                 "vulnerable alone": data.qb_tier.isin(["vulnerable", "highly vulnerable"]),
                 "vulnerable + edge z>=1": data.qb_tier.isin(["vulnerable", "highly vulnerable"]) & (data.historical_pass_rush_edge_z >= 1),
                 "resilient + edge z>=1": (data.qb_tier == "resilient") & (data.historical_pass_rush_edge_z >= 1),
                 "vulnerable + neutral/favorable": data.qb_tier.isin(["vulnerable", "highly vulnerable"]) & (data.historical_pass_rush_edge_z <= .5),
                 "vulnerable + edge + underdog": data.qb_tier.isin(["vulnerable", "highly vulnerable"]) & (data.historical_pass_rush_edge_z >= 1) & (data.market_role == "underdog"),
                 "vulnerable + edge + favorite": data.qb_tier.isin(["vulnerable", "highly vulnerable"]) & (data.historical_pass_rush_edge_z >= 1) & (data.market_role == "favorite"),
                 "vulnerable + edge + high prior pass rate": data.qb_tier.isin(["vulnerable", "highly vulnerable"]) & (data.historical_pass_rush_edge_z >= 1) & data.prior_pass_rate_high}
    for label, flag in selectors.items():
        summaries.append({"window": window, **summarize(label, data[flag.fillna(False)])})
    # Gate sensitivity uses a fixed continuous z cutoff, because percentile tiers are calibrated at the primary 100-dropback gate.
    gate_base = df[(df.season.isin(data.season.unique())) & df.historical_pass_rush_edge_z.notna()]
    if window == "2022-2023 explore":
        gate_base = gate_base[gate_base.season <= 2023]
    elif window == "2024-2025 validate":
        gate_base = gate_base[gate_base.season >= 2024]
    for gate in [50, 100, 200]:
        subset = gate_base[(gate_base.qb_prior_dropbacks >= gate) & (gate_base.qb_vulnerability_z >= .5) & (gate_base.historical_pass_rush_edge_z >= 1)]
        summaries.append({"window": window, **summarize(f"fixed z vulnerability >=0.5 + edge >=1 + gate {gate}", subset)})
    for tier in ["resilient", "average", "vulnerable", "highly vulnerable"]:
        for edge in df.edge_bucket.cat.categories:
            matrix.append({"window": window, "tier": tier, "edge_bucket": edge,
                           **summarize(f"{tier} | {edge}", data[(data.qb_tier == tier) & (data.edge_bucket == edge)])})
    for role in ["favorite", "underdog"]:
        for band in ["0-3", "3.5-6.5", "7+"]:
            subset = data[data.qb_tier.isin(["vulnerable", "highly vulnerable"]) & (data.historical_pass_rush_edge_z >= 1) & (data.market_role == role) & (data.spread_band == band)]
            summaries.append({"window": window, **summarize(f"vulnerable + edge + {role} {band}", subset)})
    for venue in ["home", "away"]:
        subset = data[data.qb_tier.isin(["vulnerable", "highly vulnerable"]) & (data.historical_pass_rush_edge_z >= 1) & (data.venue == venue)]
        summaries.append({"window": window, **summarize(f"vulnerable + edge + {venue}", subset)})
pd.DataFrame(summaries).to_csv(OUT / "bucket_summaries.csv", index=False)
pd.DataFrame(matrix).to_csv(OUT / "interaction_matrix.csv", index=False)

# Half-season, next-season, and alternative-window stability use only observed single-QB prior games.
qb_stability = []
stability_fit = league_fit([r for r in prior_single_qb_games if r["season"] <= 2025])
def retrospective_excess(metric):
    return (metric["sack_rate"] - stability_fit[0] - stability_fit[1]*metric["hit_rate"]
            if stability_fit and metric["dropbacks"] > 0 else None)
for qid, history in qb_history.items():
    for season in sorted({r["season"] for r in history}):
        first = [r for r in history if r["season"] == season and r["week"] <= 9]
        second = [r for r in history if r["season"] == season and r["week"] >= 10]
        current = [r for r in history if r["season"] == season]
        nxt = [r for r in history if r["season"] == season + 1]
        a, b, c, d = metric_history(first), metric_history(second), metric_history(nxt), metric_history(current)
        qb_stability.append({"qb_id": qid, "qb_name": history[-1]["name"], "season": season,
                             "first_half_dropbacks": a["dropbacks"], "second_half_dropbacks": b["dropbacks"],
                             "next_year_dropbacks": c["dropbacks"], "first_half_sack_rate": a["sack_rate"],
                             "second_half_sack_rate": b["sack_rate"], "next_year_sack_rate": c["sack_rate"],
                             "season_dropbacks": d["dropbacks"], "season_sack_rate": d["sack_rate"],
                             "first_half_excess_sack_rate": retrospective_excess(a),
                             "second_half_excess_sack_rate": retrospective_excess(b),
                             "season_excess_sack_rate": retrospective_excess(d),
                             "next_year_excess_sack_rate": retrospective_excess(c)})
stability_df = pd.DataFrame(qb_stability)
stability_df.to_csv(OUT / "qb_stability.csv", index=False)
stability = {}
for name, x, y, x_n, y_n in [("half season", "first_half_sack_rate", "second_half_sack_rate", "first_half_dropbacks", "second_half_dropbacks"),
                               ("year to next year", "season_sack_rate", "next_year_sack_rate", "season_dropbacks", "next_year_dropbacks")]:
    part = stability_df[(stability_df[x_n] >= 50) & (stability_df[y_n] >= 50)]
    stability[name] = {"pairs": len(part), "pearson_sack_rate": corr(part[x], part[y]), "spearman_sack_rate": corr(part[x], part[y], "spearman")}
    ex_x, ex_y = (("first_half_excess_sack_rate", "second_half_excess_sack_rate") if name == "half season"
                  else ("season_excess_sack_rate", "next_year_excess_sack_rate"))
    stability[name]["pearson_excess_sack_rate"] = corr(part[ex_x], part[ex_y])
    stability[name]["spearman_excess_sack_rate"] = corr(part[ex_x], part[ex_y], "spearman")
part = eligible.dropna(subset=["qb_vulnerability_trailing8_z", "qb_vulnerability_trailing16_z"])
stability["trailing8_vs_trailing16"] = {"observations": len(part), "pearson": corr(part.qb_vulnerability_trailing8_z, part.qb_vulnerability_trailing16_z)}
stability["career_vs_trailing8"] = {"observations": len(part), "pearson": corr(part.qb_vulnerability_z, part.qb_vulnerability_trailing8_z)}

models = {}
for window in ["2022-2025 available", "2022-2023 explore", "2024-2025 validate", "2026 live"]:
    part = windows[window].copy()
    models[window] = {}
    for target, covariates in [("team_pass_epa_db", []), ("ats_margin", ["team_spread", "home_indicator"]), ("team_sack_rate", [])]:
        part["home_indicator"] = (part.venue == "home").astype(int)
        features = ["historical_pass_rush_edge_z", "qb_vulnerability_z", "interaction", *covariates]
        models[window][target] = fit_ols(part, target, features)
    for label, vulnerability in [("trailing8", "qb_vulnerability_trailing8_z"), ("trailing16", "qb_vulnerability_trailing16_z")]:
        part[f"interaction_{label}"] = part.historical_pass_rush_edge_z * part[vulnerability]
        models[window][f"ats_margin_{label}"] = fit_ols(part, "ats_margin", ["historical_pass_rush_edge_z", vulnerability, f"interaction_{label}", "team_spread", "home_indicator"])
    part["interaction_high_hit_epa_drop"] = part.historical_pass_rush_edge_z * part.qb_high_hit_game_epa_drop
    models[window]["ats_margin_high_hit_epa_drop"] = fit_ols(part, "ats_margin", ["historical_pass_rush_edge_z", "qb_high_hit_game_epa_drop", "interaction_high_hit_epa_drop", "team_spread", "home_indicator"])
train, test = windows["2022-2023 explore"].copy(), windows["2024-2025 validate"].copy()
comparisons = {}
for target in ["ats_margin", "team_pass_epa_db", "team_sack_rate"]:
    comparisons[target] = {}
    for label, predictors in {"A edge": ["historical_pass_rush_edge_z"], "B QB": ["qb_vulnerability_z"],
                              "A+B additive": ["historical_pass_rush_edge_z", "qb_vulnerability_z"],
                              "C interaction": ["historical_pass_rush_edge_z", "qb_vulnerability_z", "interaction"]}.items():
        comparisons[target][label] = predictions(train, test, target, predictors)

espn = load_json("public/data/nfl/matchup-trench-metrics.json")["seasons"]["2026"]["teams"]
espn_rows = []
week2 = df[(df.season == 2026) & (df.week == 2)]
week1 = df[(df.season == 2026) & (df.week == 1)]
week1_game_by_team = {r.team: r.game_id for r in week1.itertuples()}
for rec in week2.to_dict("records"):
    team, opponent = rec["opponent"], rec["team"]  # defense from opposing team, offense from QB team
    defense = espn[team]["metrics"]["def.passRushWinRate"]["espnRank"]
    protection = espn[opponent]["metrics"]["off.passBlockWinRate"]["espnRank"]
    def_game, off_game = week1_game_by_team.get(team), week1_game_by_team.get(opponent)
    def_stats = team_stats.get((def_game, team)) if def_game else None
    off_stats = team_stats.get((off_game, opponent)) if off_game else None
    def_opp_epa = epa.get((def_game, week1[week1.team == team].iloc[0].opponent)) if def_game else None
    off_epa = epa.get((off_game, opponent)) if off_game else None
    week1_def_hit = div(number(def_stats.get("def_qb_hits")), number(def_opp_epa.get("pass_plays"))) if def_stats and def_opp_epa else None
    week1_off_hit_allowed = div(number(team_stats.get((off_game, week1[week1.team == opponent].iloc[0].opponent)).get("def_qb_hits")), number(off_epa.get("pass_plays"))) if off_game and off_epa else None
    espn_rows.append({"game_id": rec["game_id"], "defense": team, "offense": opponent,
                      "espn_prwr_rank": defense, "espn_pbwr_rank": protection,
                      "espn_pass_rush_edge": protection-defense,
                      "proxy_defense_hit_rate": rec["defense_prior_hit_rate"],
                      "proxy_offense_hit_allowed_rate": rec["offense_prior_hit_allowed_rate"],
                      "proxy_edge_z": rec["historical_pass_rush_edge_z"],
                      "week1_defense_hit_rate": week1_def_hit, "week1_offense_hit_allowed_rate": week1_off_hit_allowed,
                      "week1_hit_edge_raw": week1_def_hit + week1_off_hit_allowed if week1_def_hit is not None and week1_off_hit_allowed is not None else None})
espn_df = pd.DataFrame(espn_rows)
espn_df.to_csv(OUT / "espn_proxy_validation_2026.csv", index=False)
validation = {"defense_hit_vs_espn_rank_pearson": corr(espn_df.proxy_defense_hit_rate, -espn_df.espn_prwr_rank),
              "defense_hit_vs_espn_rank_spearman": corr(espn_df.proxy_defense_hit_rate, -espn_df.espn_prwr_rank, "spearman"),
              "offense_hit_allowed_vs_espn_poor_pbwr_pearson": corr(espn_df.proxy_offense_hit_allowed_rate, espn_df.espn_pbwr_rank),
              "offense_hit_allowed_vs_espn_poor_pbwr_spearman": corr(espn_df.proxy_offense_hit_allowed_rate, espn_df.espn_pbwr_rank, "spearman"),
              "edge_pearson": corr(espn_df.proxy_edge_z, espn_df.espn_pass_rush_edge),
              "edge_spearman": corr(espn_df.proxy_edge_z, espn_df.espn_pass_rush_edge, "spearman"),
              "week1_defense_hit_vs_espn_prwr_pearson": corr(espn_df.week1_defense_hit_rate, -espn_df.espn_prwr_rank),
              "week1_offense_hit_allowed_vs_espn_poor_pbwr_pearson": corr(espn_df.week1_offense_hit_allowed_rate, espn_df.espn_pbwr_rank),
              "week1_hit_edge_vs_espn_edge_pearson": corr(espn_df.week1_hit_edge_raw, espn_df.espn_pass_rush_edge),
              "week1_hit_edge_vs_espn_edge_spearman": corr(espn_df.week1_hit_edge_raw, espn_df.espn_pass_rush_edge, "spearman")}
espn_df["espn_percentile"] = espn_df.espn_pass_rush_edge.rank(pct=True)
espn_df["proxy_percentile"] = espn_df.proxy_edge_z.rank(pct=True)
espn_df["rank_disagreement"] = (espn_df.espn_percentile-espn_df.proxy_percentile).abs()
disagreements = espn_df.sort_values("rank_disagreement", ascending=False).head(8).to_dict("records")

phase1_audit = load_csv("data/nfl/research/trench-advantage/major_pass_rush_2026.csv")
overlay = []
for audit in phase1_audit.to_dict("records"):
    # Phase 1 audit has no game ID; week and the ordered team pair identify it.
    row = df[(df.season == 2026) & (df.week == 2) & (df.team == audit["opponent"]) & (df.opponent == audit["team"])]
    assert len(row) == 1
    rec = row.iloc[0].to_dict()
    overlay.append({"game_id": rec["game_id"], "defense": audit["team"], "qb_team": audit["opponent"],
                    "qb_actual_from_weekly_cache": rec["actual_primary_qb_name"], "pregame_projected_qb": rec["expected_qb_name"],
                    "pregame_qb_snapshot_at": rec["expected_qb_source_timestamp"],
                    "projected_vs_week1_incumbent": rec["expected_qb_id"] == rec["previous_team_game_qb_id"],
                    "expected_matches_actual": rec["actual_matches_expected"], "qb_vulnerability_z": rec["qb_vulnerability_z"],
                    "qb_vulnerability_percentile": rec["qb_vulnerability_percentile"], "qb_tier": rec["qb_tier"],
                    "qb_prior_dropbacks": rec["qb_prior_dropbacks"], "espn_prwr_rank": audit["prwr_rank"],
                    "espn_pbwr_rank": audit["opponent_pbwr_rank"], "espn_edge": audit["pass_rush_edge"],
                    "proxy_edge_z": rec["historical_pass_rush_edge_z"], "defense_team_spread": audit["team_spread"],
                    "defense_ats_result": audit["ats_result"], "defense_ats_margin": audit["ats_margin"],
                    "defense_su_result": audit["su_result"], "qb_team_pass_epa_db": rec["team_pass_epa_db"],
                    "qb_team_sacks": rec["team_sacks"], "qb_interceptions": rec["qb_interceptions"]})
pd.DataFrame(overlay).to_csv(OUT / "overlay_2026.csv", index=False)

qb_audit = []
for qid, history in qb_history.items():
    eligible_history = [r for r in history if r["season"] <= 2025]
    m = metric_history(eligible_history)
    if m["dropbacks"] < 200 or not league:
        continue
    latest = eligible[(eligible.expected_qb_id == qid)].sort_values("kickoff_utc")
    if latest.empty:
        continue
    r = latest.iloc[-1]
    if r.qb_prior_dropbacks < 200:
        continue
    qb_audit.append({"qb_id": qid, "qb_name": history[-1]["name"], "pregame_as_of": r.kickoff_utc,
                     "pregame_games": r.qb_prior_games, "pregame_dropbacks": r.qb_prior_dropbacks,
                     "pregame_sack_rate": r.qb_prior_sack_rate, "pregame_hit_allowed_rate": r.qb_prior_hit_allowed_rate,
                     "vulnerability_z": r.qb_vulnerability_z, "trailing8_z": r.qb_vulnerability_trailing8_z,
                     "trailing16_z": r.qb_vulnerability_trailing16_z})
qb_audit_df = pd.DataFrame(qb_audit).sort_values("vulnerability_z", ascending=False)
qb_audit_df.to_csv(OUT / "qb_audit.csv", index=False)

result = {"schema_version": "nfl-qb-pressure-trench-research-v1", "proxy_name": "pregame-hit-rate-edge x prior-QB-excess-sack-rate",
          "coverage": dict(coverage), "windows": {k: {"team_games": len(v), "games": v.game_id.nunique(), "seasons": sorted(v.season.unique().tolist())} for k, v in windows.items()},
          "unavailable_window": {"2021-2025": "2021 player-week QB identity and team QB-hit caches are absent; valid study starts in 2022"},
          "stability": stability, "models": models, "out_of_sample": comparisons, "espn_validation": validation,
          "espn_largest_disagreements": disagreements,
          "unavailable": ["true pressured/clean-pocket splits", "QB-specific EPA/dropback", "individual hurries/pressures", "2021 QB player-week cache", "verified closing odds and timestamps"],
          "phase1_files_modified": False}
(OUT / "analysis.json").write_text(json.dumps(result, indent=2, allow_nan=False, default=lambda x: None if pd.isna(x) else x) + "\n", encoding="utf8")
print(f"Wrote {len(df)} team-games, {len(eligible)} eligible historical QB-games, {len(overlay)} Week 2 overlay games")
