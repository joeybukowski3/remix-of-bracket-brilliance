#!/usr/bin/env python3
"""Fetch the hoopR 2024-25 player box scores, at the SAME pinned commit as the existing import, for private validation.

One file only: nba/player_box/parquet/player_box_2025.parquet (hoopR season 2025 = 2024-25). It is downloaded at the commit
recorded in the existing manifest.json (so all three seasons describe one snapshot of hoopR), size-capped, redirects
refused, written together with a sha256 manifest of its own (manifest-prior-season.json). The existing manifest.json and
the production import are not touched: the V1 board never sees 2024-25.

Rights (read before using the output): hoopR is CC BY 4.0, but ESPN is the upstream source and its commercial and public
reuse terms are UNRESOLVED. The owner approved using this data for private analysis (2026-10-23) and for this validation
(2026-10-26). That is not ESPN's permission; nothing built from it may be published. Output stays under data/nba/
(gitignored).

    python -I scripts/nba-hoopr-fetch-prior-season.py --confirm-owner-decision [--raw-dir data/nba/props-v1/raw/hoopr]

Needs `pyarrow`. It reuses the download, confinement and conversion code of scripts/nba-hoopr-fetch.py.
"""
import argparse
import hashlib
import importlib.util
import json
import os
import sys
from datetime import datetime, timezone

# Loading the sibling script must not leave a __pycache__ next to the source.
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
SPEC = {"name": "player_box_2025", "path": "nba/player_box/parquet/player_box_2025.parquet", "kind": "player_box"}
OWNER_DECISIONS = "2026-10-23 (private analysis) and 2026-10-26 (validation of V1 improvements); not ESPN permission"


def load_fetch_module():
    spec = importlib.util.spec_from_file_location("nba_hoopr_fetch", os.path.join(HERE, "nba-hoopr-fetch.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    fetch = load_fetch_module()
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--confirm-owner-decision", action="store_true", help="required: records the owner's approval of private analysis of hoopR/ESPN data")
    parser.add_argument("--raw-dir", default=fetch.DEFAULT_OUT)
    args = parser.parse_args()
    if not args.confirm_owner_decision:
        print("Refusing to download: pass --confirm-owner-decision to confirm the owner's decisions (private analysis only; not ESPN permission).", file=sys.stderr)
        return 2
    root = os.path.realpath(os.path.join(HERE, ".."))
    out = fetch.confined(root, args.raw_dir)
    with open(os.path.join(out, "manifest.json"), encoding="utf-8") as handle:
        existing = json.load(handle)
    commit = existing["commit"]
    if not fetch.COMMIT_PATTERN.fullmatch(str(commit)):
        raise SystemExit("the existing manifest has no 40-character commit hash; run scripts/nba-hoopr-fetch.py first")

    # A manifest left from an earlier run must never describe files from this one.
    manifest_path = os.path.join(out, "manifest-prior-season.json")
    if os.path.lexists(manifest_path):
        os.remove(manifest_path)

    url = fetch.RAW.format(commit=commit, path=SPEC["path"])
    body = fetch.get(url)
    retrieved = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    parquet_path = os.path.join(out, SPEC["name"] + ".parquet")
    json_path = os.path.join(out, SPEC["name"] + ".json")
    for target in (parquet_path, json_path):
        if os.path.islink(target):
            raise SystemExit(f"{os.path.relpath(target, root)} is a link; refusing to write through it")
    with open(parquet_path, "wb") as handle:
        handle.write(body)
    rows = fetch.convert(parquet_path, SPEC["kind"])
    with open(json_path, "w", encoding="utf-8") as handle:
        json.dump({"kind": SPEC["kind"], "rows": rows}, handle, allow_nan=False, separators=(",", ":"))

    manifest = {
        "schemaVersion": "jkb-hoopr-manifest-v1",
        "sourceId": "hoopr-espn",
        "repository": fetch.REPO,
        "commit": commit,
        "retrievedAtUtc": retrieved,
        "seasonMapping": {"2025": "2024-25"},
        "files": [{"name": SPEC["name"], "kind": SPEC["kind"], "url": url, "path": SPEC["path"], "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest(), "rows": len(rows), "json": SPEC["name"] + ".json"}],
        "license": {"repository": "CC BY 4.0 (credit hoopR, link the license, indicate changes)", "upstream": "ESPN; reuse terms unresolved"},
        "rightsNotice": fetch.RIGHTS_NOTICE,
        "ownerDecision": OWNER_DECISIONS,
    }
    if os.path.islink(manifest_path):
        raise SystemExit(f"{os.path.relpath(manifest_path, root)} is a link; refusing to write through it")
    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")
    print(f"{SPEC['name']}: {len(body)} bytes, {len(rows)} rows at commit {commit}")
    print(f"manifest written to {os.path.relpath(manifest_path, root)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
