#!/usr/bin/env python3
"""Aggregate per-player-season box-score features from the hoopR files already on disk, for position review.

Offline: reads the two player-box Parquet files that scripts/nba-hoopr-fetch.py downloaded (checking their sha256
against the manifest) and writes one JSON file of per-player-season totals. No network, no provider, no credential.

The data is ESPN-derived and private to the owner (docs/nba-props-v1.md). The output stays under data/nba/ (gitignored)
and is never committed or published.

    python -I scripts/nba-hoopr-player-features.py [--raw-dir data/nba/props-v1/raw/hoopr] [--out data/nba/props-v1/player-features.json]

Regular-season games only, did-not-play rows and zero-minute rows excluded, All-Star teams excluded, the same exclusions
as the V1 import. hoopR season 2026 = 2025-26 and 2027 = 2026-27.
"""
import argparse
import hashlib
import io
import json
import math
import os
import sys
from collections import Counter, defaultdict

ALLOWED_PARENT = "data/nba"
SEASONS = {"player_box_2026": "2025-26", "player_box_2027": "2026-27"}
ALL_STAR_TEAMS = {"STARS", "STRIPES", "WORLD"}
REGULAR_SEASON_TYPE = 2
COLUMNS = [
    "season_type", "athlete_id", "athlete_display_name", "team_abbreviation", "minutes", "did_not_play", "starter",
    "points", "rebounds", "offensive_rebounds", "assists", "steals", "blocks", "turnovers",
    "field_goals_attempted", "three_point_field_goals_attempted", "free_throws_attempted", "athlete_position_abbreviation",
]
TOTALS = {
    "pts": "points", "reb": "rebounds", "oreb": "offensive_rebounds", "ast": "assists", "stl": "steals", "blk": "blocks",
    "tov": "turnovers", "fga": "field_goals_attempted", "fg3a": "three_point_field_goals_attempted", "fta": "free_throws_attempted",
}


def confined(root: str, requested: str) -> str:
    allowed = os.path.realpath(os.path.join(root, ALLOWED_PARENT))
    target = os.path.realpath(os.path.join(root, requested))
    if os.path.commonpath([allowed, target]) != allowed:
        raise SystemExit(f"{requested} must be under {ALLOWED_PARENT}/")
    return target


def number(value) -> float:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return 0.0
    return float(value)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--raw-dir", default="data/nba/props-v1/raw/hoopr")
    parser.add_argument("--out", default="data/nba/props-v1/player-features.json")
    args = parser.parse_args()
    root = os.path.realpath(os.path.join(os.path.dirname(__file__), ".."))
    raw_dir = confined(root, args.raw_dir)
    out = confined(root, args.out)

    import pyarrow.parquet as pq

    with open(os.path.join(raw_dir, "manifest.json"), encoding="utf-8") as handle:
        manifest = json.load(handle)
    expected = {f["name"]: f["sha256"] for f in manifest["files"]}

    players = []
    for name, season in SEASONS.items():
        path = os.path.join(raw_dir, name + ".parquet")
        with open(path, "rb") as handle:
            body = handle.read()
        if hashlib.sha256(body).hexdigest() != expected.get(name):
            raise SystemExit(f"{name}.parquet does not match the manifest sha256: refusing to use it")
        # Parse the bytes that were hashed, not the file again.
        frame = pq.read_table(io.BytesIO(body), columns=COLUMNS).to_pandas()
        frame = frame[(frame["season_type"] == REGULAR_SEASON_TYPE) & (~frame["team_abbreviation"].isin(ALL_STAR_TEAMS))]
        frame = frame[(frame["did_not_play"] != True) & (frame["minutes"].fillna(0) > 0)]  # noqa: E712
        groups = defaultdict(lambda: {"games": 0, "starts": 0, "minutes": 0.0, "totals": defaultdict(float), "espn": Counter(), "name": "", "team": ""})
        for row in frame.to_dict("records"):
            if row["athlete_id"] is None or (isinstance(row["athlete_id"], float) and math.isnan(row["athlete_id"])):
                continue
            g = groups[str(int(row["athlete_id"]))]
            g["games"] += 1
            g["starts"] += 1 if bool(row["starter"]) else 0
            g["minutes"] += number(row["minutes"])
            for key, column in TOTALS.items():
                g["totals"][key] += number(row[column])
            code = row["athlete_position_abbreviation"]
            if isinstance(code, str) and code:
                g["espn"][code] += 1
            g["name"] = str(row["athlete_display_name"])
            g["team"] = str(row["team_abbreviation"])
        for athlete_id, g in sorted(groups.items()):
            players.append({
                "season": season, "playerId": athlete_id, "name": g["name"], "team": g["team"], "games": g["games"], "starts": g["starts"],
                "minutes": round(g["minutes"], 1), "totals": {k: g["totals"][k] for k in TOTALS}, "espnPositions": dict(g["espn"]),
            })
        print(f"{season}: {len([p for p in players if p['season'] == season])} players")

    os.makedirs(os.path.dirname(out), exist_ok=True)
    # confined() resolved links already, so `out` is the real path; write a temporary file and replace atomically.
    tmp = out + ".tmp"
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump({"schemaVersion": "jkb-player-features-v1", "private": "hoopR/ESPN-derived; private research only; never commit or publish", "commit": manifest["commit"], "players": players}, handle, separators=(",", ":"))
        handle.write("\n")
    os.replace(tmp, out)
    print(f"wrote {os.path.relpath(out, root)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
