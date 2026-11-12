// TEMPORARY (PR #455 verification). Diffs per-test Vitest results between main and the PR head by
// test NAME and ERROR MESSAGE and classifies every difference.
//
//   node compare.cjs <main_out> <pr_out> <harness_dir> <report_dir>
//
// Classification of each test that fails (stably) on at least one side:
//   existing            fails on main with the same message          -> not caused by the PR
//   existing-msg-diff   fails on both, different message             -> review (often a data-dependent fixture)
//   data-fixture        fails only on PR AND its source reads committed repo data files
//                       -> the refreshed data changed what the test sees; verify the data, then fix the fixture
//   regression          fails only on PR and does not read repo data    -> genuine regression candidate
//   new-test            fails on PR, test absent on main
//   environment         failed once but passed on retry, or matches an environment/resource pattern
//   fixed               fails on main, passes on PR
const fs = require("node:fs");
const path = require("node:path");

const [mainOut, prOut, harness, reportDir] = process.argv.slice(2);
fs.mkdirSync(reportDir, { recursive: true });
const ENV_PATTERN = /heap out of memory|ENOMEM|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|ERR_IPC_CHANNEL_CLOSED|Worker exited|Timeout calling|timed out in \d+ms|socket hang up/i;
const DATA_READ = /public\/data|data\/nfl|["'`]data\/|readFileSync|process\.cwd\(\)/;

const rel = (n) => n.replace(/\\/g, "/").replace(/^.*?\/(src\/)/, "$1");
function readSide(dir) {
  const res = { tests: new Map(), retry: new Map(), files: new Set(), crashedFiles: new Set(), absent: new Set() };
  const ls = (re) => fs.readdirSync(dir).filter((f) => re.test(f));
  const read = (name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
  res.absent = new Set(fs.readFileSync(path.join(dir, "absent-files.txt"), "utf8").split("\n").filter(Boolean));
  const listed = fs.readFileSync(path.join(dir, "files.txt"), "utf8").split("\n").filter(Boolean);
  const take = (into, j) => {
    for (const f of j.testResults) {
      const file = rel(f.name);
      if (!f.assertionResults.length && f.status === "failed") into.set(`${file} :: <file failed to load>`, { status: "failed", msg: (f.message || "").split("\n")[0], file });
      for (const a of f.assertionResults) into.set(`${file} :: ${a.fullName}`, { status: a.status, msg: (a.failureMessages || [])[0]?.split("\n")[0] ?? "", file });
      res.files.add(file);
    }
  };
  for (const f of ls(/^batch-\d+\.json$/)) take(res.tests, read(f));
  for (const f of ls(/^retry-\d+\.json$/)) take(res.retry, read(f));
  for (const f of listed) if (!res.files.has(f)) res.crashedFiles.add(f);
  return res;
}
const M = readSide(mainOut), P = readSide(prOut);
const failedStable = (side, name) => {
  const t = side.tests.get(name);
  if (!t || t.status !== "failed") return false;
  const r = side.retry.get(name);
  return !r || r.status === "failed"; // if a retry exists and passed, it was flaky
};
const flaky = (side, name) => side.tests.get(name)?.status === "failed" && side.retry.get(name)?.status === "passed";

const names = new Set([...M.tests.keys(), ...P.tests.keys()]);
const rows = [];
const sourceReadsData = (file) => { try { return DATA_READ.test(fs.readFileSync(path.join(harness, file), "utf8")); } catch { return false; } };
for (const name of [...names].sort()) {
  const m = M.tests.get(name), p = P.tests.get(name);
  const pf = failedStable(P, name), mf = failedStable(M, name);
  const file = (p || m).file;
  const row = { name, file, main: m?.status ?? "absent", pr: p?.status ?? "absent", mainMsg: m?.msg ?? "", prMsg: p?.msg ?? "", class: null };
  if (flaky(P, name) || flaky(M, name)) row.class = "environment";
  else if (pf && mf) row.class = m.msg === p.msg ? "existing" : "existing-msg-diff";
  else if (pf && !mf) {
    if (ENV_PATTERN.test(p.msg)) row.class = "environment";
    else if (!m) row.class = "new-test";
    else row.class = sourceReadsData(file) ? "data-fixture" : "regression";
  } else if (mf && !pf) row.class = "fixed";
  if (row.class) rows.push(row);
}
for (const f of P.crashedFiles) rows.push({ name: `${f} :: <no result on PR run>`, file: f, main: "?", pr: "no-result", mainMsg: "", prMsg: "", class: "environment" });
for (const f of M.crashedFiles) rows.push({ name: `${f} :: <no result on main run>`, file: f, main: "no-result", pr: "?", mainMsg: "", prMsg: "", class: "environment" });

const count = (c) => rows.filter((r) => r.class === c).length;
const totals = {
  testsMain: M.tests.size, testsPr: P.tests.size,
  failingMainStable: [...M.tests.keys()].filter((n) => failedStable(M, n)).length,
  failingPrStable: [...P.tests.keys()].filter((n) => failedStable(P, n)).length,
  testFilesAbsentOnMain: M.absent.size,
  byClass: Object.fromEntries(["existing", "existing-msg-diff", "data-fixture", "regression", "new-test", "environment", "fixed"].map((c) => [c, count(c)])),
};
fs.writeFileSync(path.join(reportDir, "comparison.json"), JSON.stringify({ totals, rows }, null, 1));

const trunc = (s, n = 140) => (s.length > n ? `${s.slice(0, n)}...` : s).replace(/\|/g, "\\|").replace(/\n/g, " ");
const md = [`## Front-end regression comparison: main vs PR`, "", "| metric | value |", "|---|---|",
  `| tests seen (main / PR) | ${totals.testsMain} / ${totals.testsPr} |`,
  `| stable failures (main / PR) | ${totals.failingMainStable} / ${totals.failingPrStable} |`,
  `| test files absent on main (new in PR) | ${totals.testFilesAbsentOnMain} |`, ""];
md.push("| class | count |", "|---|---|", ...Object.entries(totals.byClass).map(([k, v]) => `| ${k} | ${v} |`), "");
for (const c of ["regression", "data-fixture", "new-test", "existing-msg-diff", "environment", "fixed"]) {
  const list = rows.filter((r) => r.class === c);
  if (!list.length) continue;
  md.push(`### ${c} (${list.length})`, "", "| test | main | PR |", "|---|---|---|");
  for (const r of list.slice(0, 80)) md.push(`| ${trunc(r.name, 110)} | ${r.main}${r.mainMsg ? `: ${trunc(r.mainMsg)}` : ""} | ${r.pr}${r.prMsg ? `: ${trunc(r.prMsg)}` : ""} |`);
  md.push("");
}
md.push(`<details><summary>${totals.byClass.existing} existing failures (identical on main)</summary>`, "", ...rows.filter((r) => r.class === "existing").map((r) => `- ${trunc(r.name, 150)}`), "", "</details>");
fs.writeFileSync(path.join(reportDir, "comparison.md"), md.join("\n") + "\n");
console.log(md.slice(0, 22).join("\n"));
const blocking = totals.byClass.regression + totals.byClass["data-fixture"] + totals.byClass["new-test"];
console.log(blocking ? `\nVERDICT: ${blocking} candidate(s) need review` : "\nVERDICT: no PR-introduced failures");
process.exit(blocking ? 1 : 0);
