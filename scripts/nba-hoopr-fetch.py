#!/usr/bin/env python3
"""Fetch the hoopR NBA player box scores and schedule for the props board V1, and convert them to JSON.

hoopR (sportsdataverse/hoopR-nba-data) publishes ESPN-derived NBA data as Parquet files in its repository. This
script downloads exactly three of them, pinned to one commit, and writes them with a manifest:

    nba/player_box/parquet/player_box_2026.parquet   hoopR season 2026 = 2025-26
    nba/player_box/parquet/player_box_2027.parquet   hoopR season 2027 = 2026-27
    nba/schedules/parquet/nba_schedule_2027.parquet  the 2026-27 schedule (upcoming games for the slate)

Rights (read before using the output): the repository is CC BY 4.0 (credit hoopR, link the license, note changes),
but ESPN is the upstream source and its terms on commercial and public reuse are UNRESOLVED. The owner decided on
2026-10-23 to use this data for private analysis and preview. That decision is not ESPN's permission; nothing built
from this data may be published (see src/lib/nba/props/sources/licenses.ts and docs/nba-props-v1.md).

Safety: three files only, GitHub hosts only (redirects refused), size-capped, no retry, nothing written until all three downloads succeed, descriptive User-Agent, output confined to
data/nba/ (gitignored), and an explicit flag so the download cannot happen by accident. Needs `pyarrow`.

    python scripts/nba-hoopr-fetch.py --confirm-owner-decision [--out-dir data/nba/props-v1/raw/hoopr]
"""
import argparse
import hashlib
import json
import math
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

REPO = "sportsdataverse/hoopR-nba-data"
API_COMMIT = f"https://api.github.com/repos/{REPO}/commits/main"
RAW = "https://raw.githubusercontent.com/" + REPO + "/{commit}/{path}"
USER_AGENT = "JKB-NBA-V1/0.1 (https://github.com/joeybukowski3/remix-of-bracket-brilliance; private analysis of hoopR-nba-data; 3 files)"
MAX_BYTES = 5 * 1024 * 1024
TIMEOUT_S = 60
DEFAULT_OUT = "data/nba/props-v1/raw/hoopr"
ALLOWED_PARENT = "data/nba"

FILES = [
    {"name": "player_box_2026", "path": "nba/player_box/parquet/player_box_2026.parquet", "kind": "player_box"},
    {"name": "player_box_2027", "path": "nba/player_box/parquet/player_box_2027.parquet", "kind": "player_box"},
    {"name": "nba_schedule_2027", "path": "nba/schedules/parquet/nba_schedule_2027.parquet", "kind": "schedule"},
]
COLUMNS = {
    "player_box": [
        "game_id", "season", "season_type", "game_date", "game_date_time", "athlete_id", "athlete_display_name",
        "team_id", "team_abbreviation", "opponent_team_id", "opponent_team_abbreviation", "home_away", "minutes",
        "points", "rebounds", "assists", "starter", "did_not_play", "reason", "athlete_position_abbreviation",
    ],
    "schedule": ["id", "date", "game_date", "season", "season_type", "status_type_name", "status_type_state", "status_type_completed", "home_abbreviation", "away_abbreviation"],
}
RIGHTS_NOTICE = (
    "hoopR-nba-data is CC BY 4.0 over its data, code and documentation. ESPN is the upstream source and its commercial and "
    "public reuse terms are unresolved. The owner's 2026-10-23 decision allows private analysis and preview only; it is not "
    "ESPN's permission and does not allow publication."
)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """A redirect could send the request, and the User-Agent, to another host: refuse it."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError(f"unexpected redirect ({code}) from {req.full_url}")


OPENER = urllib.request.build_opener(NoRedirect)
COMMIT_PATTERN = re.compile(r"^[0-9a-f]{40}$")


def get(url: str, as_json: bool = False):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json" if as_json else "*/*"})
    with OPENER.open(request, timeout=TIMEOUT_S) as response:
        if response.status != 200:
            raise RuntimeError(f"HTTP {response.status} for {url}")
        declared = response.headers.get("Content-Length")
        if declared is not None and int(declared) > MAX_BYTES:
            raise RuntimeError(f"{url} declares {declared} bytes, over the {MAX_BYTES} cap")
        body = response.read(MAX_BYTES + 1)
    if len(body) > MAX_BYTES:
        raise RuntimeError(f"{url} exceeded the {MAX_BYTES}-byte cap")
    return json.loads(body) if as_json else body


def confined(root: str, requested: str) -> str:
    """The absolute path of `requested`, which must stay inside <root>/data/nba after links are resolved."""
    allowed = os.path.realpath(os.path.join(root, ALLOWED_PARENT))
    target = os.path.realpath(os.path.join(root, requested))
    if os.path.commonpath([allowed, target]) != allowed:
        raise SystemExit(f"--out-dir must be under {ALLOWED_PARENT}/, got {requested}")
    return target


def clean(value):
    """JSON-safe scalar: NaN and NaT become null, dates and timestamps become ISO text."""
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if hasattr(value, "isoformat"):
        if value != value:  # NaT
            return None
        return value.isoformat()
    if hasattr(value, "item"):
        value = value.item()
        if isinstance(value, float) and math.isnan(value):
            return None
    return value


def convert(parquet_path: str, kind: str):
    import pyarrow.parquet as pq

    names = pq.ParquetFile(parquet_path).schema_arrow.names
    missing = [c for c in COLUMNS[kind] if c not in names]
    if missing:
        raise SystemExit(f"{os.path.basename(parquet_path)} is missing expected column(s): {', '.join(missing)}")
    # Only the needed columns are read, so a crafted file cannot make the other columns expand in memory.
    frame = pq.read_table(parquet_path, columns=COLUMNS[kind]).to_pandas()
    return [{c: clean(v) for c, v in row.items()} for row in frame.to_dict("records")]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--confirm-owner-decision", action="store_true", help="required: records that the owner approved using hoopR/ESPN for private analysis on 2026-10-23")
    parser.add_argument("--out-dir", default=DEFAULT_OUT)
    args = parser.parse_args()
    if not args.confirm_owner_decision:
        print("Refusing to download: pass --confirm-owner-decision to confirm the owner's 2026-10-23 decision (private analysis only; not ESPN permission).", file=sys.stderr)
        return 2
    root = os.path.realpath(os.path.join(os.path.dirname(__file__), ".."))
    out = confined(root, args.out_dir)
    os.makedirs(out, exist_ok=True)

    # A manifest left from an earlier run must never describe files from this one.
    manifest_path = os.path.join(out, "manifest.json")
    if os.path.lexists(manifest_path):
        os.remove(manifest_path)

    commit = get(API_COMMIT, as_json=True)["sha"]
    if not COMMIT_PATTERN.fullmatch(str(commit)):
        raise SystemExit("the GitHub API did not return a 40-character commit hash")
    retrieved = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    # Download every file before writing any, so a failure on file 2 or 3 leaves nothing half-written.
    downloads = [(spec, RAW.format(commit=commit, path=spec["path"])) for spec in FILES]
    bodies = [get(url) for _, url in downloads]
    entries = []
    for (spec, url), body in zip(downloads, bodies):
        parquet_path = os.path.join(out, spec["name"] + ".parquet")
        json_path = os.path.join(out, spec["name"] + ".json")
        for target in (parquet_path, json_path):
            if os.path.islink(target):
                raise SystemExit(f"{os.path.relpath(target, root)} is a link; refusing to write through it")
        with open(parquet_path, "wb") as handle:
            handle.write(body)
        rows = convert(parquet_path, spec["kind"])
        with open(json_path, "w", encoding="utf-8") as handle:
            json.dump({"kind": spec["kind"], "rows": rows}, handle, allow_nan=False, separators=(",", ":"))
        entries.append({"name": spec["name"], "kind": spec["kind"], "url": url, "path": spec["path"], "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest(), "rows": len(rows), "json": spec["name"] + ".json"})
        print(f"{spec['name']}: {len(body)} bytes, {len(rows)} rows")

    manifest = {
        "schemaVersion": "jkb-hoopr-manifest-v1",
        "sourceId": "hoopr-espn",
        "repository": REPO,
        "commit": commit,
        "retrievedAtUtc": retrieved,
        "seasonMapping": {"2026": "2025-26", "2027": "2026-27"},
        "files": entries,
        "license": {"repository": "CC BY 4.0 (credit hoopR, link the license, indicate changes)", "upstream": "ESPN; reuse terms unresolved"},
        "rightsNotice": RIGHTS_NOTICE,
        "ownerDecision": "2026-10-23: use hoopR/ESPN as the NBA player-statistics source for private analysis and preview; not ESPN permission",
    }
    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")
    print(f"commit {commit}; manifest written to {os.path.relpath(os.path.join(out, 'manifest.json'), root)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
