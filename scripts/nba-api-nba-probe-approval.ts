/**
 * Create ONE local approval for the API-NBA coverage probe (no network).
 *
 *   npx tsx scripts/nba-api-nba-probe-approval.ts --approved-by="<name>" [--days=7]
 *
 * Writes data/nba/approvals/api-nba-probe-approval.json with exclusive create:
 * it never overwrites an existing approval, never renews or extends one, and
 * always grants exactly 10 requests for api-sports:nba / api-nba-coverage-probe.
 * Each approval id funds at most one probe run (see apiNbaProbeApproval.ts).
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { API_NBA_PROBE_APPROVAL_PATH, buildProbeApproval } from "../src/lib/nba/props/sources/apiNbaProbeApproval";

const out = (line: string) => process.stderr.write(`${line}\n`);
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main(): Promise<void> {
  const approvedBy = arg("approved-by");
  const days = Number(arg("days") ?? "7");
  if (!approvedBy?.trim()) {
    out('Usage: npx tsx scripts/nba-api-nba-probe-approval.ts --approved-by="<name>" [--days=1..14]');
    process.exitCode = 2;
    return;
  }
  try {
    execFileSync("git", ["check-ignore", "-q", API_NBA_PROBE_APPROVAL_PATH], { stdio: "ignore" });
  } catch {
    out(`Refusing: ${API_NBA_PROBE_APPROVAL_PATH} is not gitignored.`);
    process.exitCode = 2;
    return;
  }
  const approval = buildProbeApproval({ approvedBy, days, now: new Date(), suffix: randomBytes(4).toString("hex") });
  await mkdir(path.dirname(API_NBA_PROBE_APPROVAL_PATH), { recursive: true });
  try {
    await writeFile(API_NBA_PROBE_APPROVAL_PATH, `${JSON.stringify(approval, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      out(`Refusing: ${API_NBA_PROBE_APPROVAL_PATH} already exists. Approvals are never overwritten or extended.`);
      process.exitCode = 2;
      return;
    }
    throw error;
  }
  out(`Created ${API_NBA_PROBE_APPROVAL_PATH}: ${approval.approvalId}, ${approval.maxUnits} requests, expires ${approval.expiresAt}`);
}

main().catch((error: unknown) => {
  out(`nba-api-nba-probe-approval failed: ${error instanceof Error ? error.message : "error"}`);
  process.exitCode = 1;
});
