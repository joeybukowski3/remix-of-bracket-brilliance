/**
 * WU6.4 regression fixture -- a trivial script the real spawnTsxCommandRunner
 * can launch to prove argv integrity (no shell, no npx) without touching any
 * provider API. Echoes its own argv (post-script-path) as a JSON array on
 * stdout, and exits with a caller-requested code when `--exit-code=N` is
 * present, so both argv-boundary safety and non-zero-exit propagation can be
 * asserted from one real child process.
 */
const args = process.argv.slice(2);
const exitFlag = args.find((a) => a.startsWith("--exit-code="));
console.log(JSON.stringify(args));
if (exitFlag) {
  process.exitCode = Number(exitFlag.slice("--exit-code=".length));
}
