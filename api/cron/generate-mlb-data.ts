/**
 * Vercel cron job — triggers the GitHub Actions workflow that generates
 * MLB HR/K prop data. Runs hourly from 2 AM to 1 PM ET.
 *
 * Vercel crons are far more reliable than GitHub Actions scheduled crons,
 * which get silently dropped under load (especially at minute 0 and
 * during overnight peak hours).
 *
 * Required env vars (set in Vercel dashboard):
 *   CRON_SECRET          — shared secret to authenticate cron calls
 *   GH_DISPATCH_TOKEN    — GitHub PAT with repo + workflow scope
 *   GH_REPO_OWNER        — e.g. "joeybukowski3"
 *   GH_REPO_NAME         — e.g. "remix-of-bracket-brilliance"
 *   GH_WORKFLOW_ID       — e.g. "generate-mlb-hr-props.yml"
 */

const CRON_SECRET = process.env.CRON_SECRET ?? "";
const GH_TOKEN = process.env.GH_DISPATCH_TOKEN ?? "";
const GH_OWNER = process.env.GH_REPO_OWNER ?? "joeybukowski3";
const GH_REPO = process.env.GH_REPO_NAME ?? "remix-of-bracket-brilliance";
const GH_WORKFLOW = process.env.GH_WORKFLOW_ID ?? "generate-mlb-hr-props.yml";

function isAuthorized(request: Request): boolean {
  if (!CRON_SECRET) return true; // no secret set = open (dev only)
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${CRON_SECRET}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!GH_TOKEN) {
    return Response.json({ ok: false, error: "GH_DISPATCH_TOKEN not configured" }, { status: 500 });
  }

  // Only run during MLB season hours (2 AM – 1 PM ET = 6–17 UTC in EDT)
  const nowUtc = new Date();
  const hourUtc = nowUtc.getUTCHours();
  if (hourUtc < 6 || hourUtc > 17) {
    return Response.json({ ok: true, skipped: true, reason: `Outside active window (UTC hour ${hourUtc})` });
  }

  const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/dispatches`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main" }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[generate-mlb-data cron] GitHub dispatch failed ${res.status}: ${body}`);
    return Response.json({ ok: false, error: `GitHub API ${res.status}`, detail: body }, { status: 502 });
  }

  console.log(`[generate-mlb-data cron] Dispatched ${GH_WORKFLOW} at ${nowUtc.toISOString()}`);
  return Response.json({ ok: true, skipped: false, dispatched: GH_WORKFLOW, at: nowUtc.toISOString() });
}
