#!/usr/bin/env bash
# TEMPORARY (PR #455 verification). Runs the NFL front-end Vitest files in small single-worker
# batches against one checkout and writes machine-readable JSON per batch, then a retry pass for
# the files that failed (to separate flaky/environment failures from stable ones).
#
#   run-batches.sh <code_dir> <harness_dir> <out_dir> [chunk=12]
#
# <code_dir>    revision under test (main or the PR head)
# <harness_dir> PR head checkout: supplies the test list and the single shared vitest.config.ts
#
# Tests only: nothing here regenerates datasets or calls any provider.
set -uo pipefail
code="$1"; harness="$2"; out="$3"; chunk="${4:-12}"
mkdir -p "$out"
cd "$code" || exit 9

# Identical Vitest configuration for both revisions.
cp "$harness/vitest.config.ts" ./vitest.config.ts

# Identical test list: derived from the PR checkout, filtered to files that exist in this revision.
( cd "$harness" && find src/lib/nfl src/components/nfl src/pages/nfl src/hooks \( -name '*.test.ts' -o -name '*.test.tsx' \) | sort ) > "$out/all-files.txt"
# Isolation mode: if an only-files.txt list is committed next to this script, run just those files,
# ONE PER PROCESS. Files sharing a process leak DOM into each other, and which files share a batch
# differs between revisions whenever one revision has an extra test file, so batched results are
# not comparable file-for-file; per-file processes are.
only="$harness/scripts/ci/tmp-compare/only-files.txt"
if [ -f "$only" ]; then
  grep -Fxf "$only" "$out/all-files.txt" > "$out/all-files.filtered" && mv "$out/all-files.filtered" "$out/all-files.txt"
  chunk=1
  echo "isolation mode: $(wc -l < "$out/all-files.txt") files, one per process"
fi
: > "$out/files.txt"; : > "$out/absent-files.txt"
while IFS= read -r f; do if [ -f "$f" ]; then echo "$f" >> "$out/files.txt"; else echo "$f" >> "$out/absent-files.txt"; fi; done < "$out/all-files.txt"
echo "revision $(git rev-parse HEAD): $(wc -l < "$out/files.txt") test files, $(wc -l < "$out/absent-files.txt") absent in this revision"

export NODE_OPTIONS=--max-old-space-size=4096
run_batch() { # <label> <files...>
  local label="$1"; shift
  echo "=== batch $label ($# files) $(date -u +%H:%M:%S)"
  timeout 1500 npx vitest run "$@" --pool=forks --poolOptions.forks.singleFork=true --no-file-parallelism \
    --reporter=json --outputFile="$out/$label.json" > "$out/$label.stdout" 2>&1
  echo "    exit=$? json=$([ -s "$out/$label.json" ] && echo yes || echo MISSING)"
}

n=0; total=$(wc -l < "$out/files.txt"); i=0
while [ "$i" -lt "$total" ]; do
  files=$(sed -n "$((i+1)),$((i+chunk))p" "$out/files.txt" | tr '\n' ' ')
  # shellcheck disable=SC2086
  run_batch "batch-$(printf '%02d' "$n")" $files
  i=$((i+chunk)); n=$((n+1))
done

# Retry pass: only files that had a failing test or whose batch produced no JSON.
node -e '
const fs=require("fs"),path=require("path");const out=process.argv[1];
const failed=new Set();const listed=fs.readFileSync(path.join(out,"files.txt"),"utf8").split("\n").filter(Boolean);
const seen=new Set();
for(const f of fs.readdirSync(out).filter(f=>/^batch-\d+\.json$/.test(f))){
  const j=JSON.parse(fs.readFileSync(path.join(out,f),"utf8"));
  for(const t of j.testResults){const rel=t.name.replace(/\\/g,"/").replace(/^.*?\/(src\/)/,"$1");seen.add(rel);
    if(t.status==="failed"||t.assertionResults.some(a=>a.status==="failed"))failed.add(rel)}}
for(const f of listed)if(!seen.has(f))failed.add(f); // never reported (batch crash)
fs.writeFileSync(path.join(out,"retry-files.txt"),[...failed].sort().join("\n")+"\n");
console.log("retry candidates:",failed.size)
' "$out"

rchunk=$([ "$chunk" = 1 ] && echo 1 || echo 6)
r=0; rtotal=$(grep -c . "$out/retry-files.txt" || true); i=0
while [ "$i" -lt "$rtotal" ]; do
  files=$(sed -n "$((i+1)),$((i+rchunk))p" "$out/retry-files.txt" | tr '\n' ' ')
  # shellcheck disable=SC2086
  run_batch "retry-$(printf '%02d' "$r")" $files
  i=$((i+rchunk)); r=$((r+1))
done
echo "done"
