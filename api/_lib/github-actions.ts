/** Minimal GitHub REST client for the MLB refresh backup cron. Never logs the token. */

const API = "https://api.github.com";
const BRANCH = "main";
const REQUEST_TIMEOUT_MS = 15_000;

export interface GithubRepo {
  owner: string;
  repo: string;
  token: string;
}

export class GithubApiError extends Error {
  constructor(
    readonly status: number,
    readonly operation: string,
  ) {
    super(`GitHub API ${status} during ${operation}`);
  }
}

async function github(
  { token }: GithubRepo,
  path: string,
  operation: string,
  init: { method?: string; accept?: string; body?: unknown } = {},
): Promise<Response> {
  const response = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: init.accept ?? "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok && response.status !== 404) throw new GithubApiError(response.status, operation);
  return response;
}

const runsPath = ({ owner, repo }: GithubRepo, workflow: string, query: string) =>
  `/repos/${owner}/${repo}/actions/workflows/${workflow}/runs?branch=${BRANCH}&${query}`;

export async function readRepoFile(gh: GithubRepo, repoPath: string): Promise<string | null> {
  const response = await github(gh, `/repos/${gh.owner}/${gh.repo}/contents/${repoPath}?ref=${BRANCH}`, "read-file", {
    accept: "application/vnd.github.raw+json",
  });
  return response.status === 404 ? null : response.text();
}

async function countRuns(gh: GithubRepo, workflow: string, status: string): Promise<number> {
  const response = await github(gh, runsPath(gh, workflow, `status=${status}&per_page=1`), "list-runs");
  if (response.status === 404) throw new GithubApiError(404, "list-runs");
  const body = (await response.json()) as { total_count?: number };
  return typeof body.total_count === "number" ? body.total_count : 0;
}

export async function countActiveRuns(gh: GithubRepo, workflow: string): Promise<number> {
  const [queued, inProgress] = await Promise.all([countRuns(gh, workflow, "queued"), countRuns(gh, workflow, "in_progress")]);
  return queued + inProgress;
}

export async function recentSuccessfulRunTimes(gh: GithubRepo, workflow: string): Promise<string[]> {
  const response = await github(gh, runsPath(gh, workflow, "status=success&per_page=10"), "list-successful-runs");
  if (response.status === 404) throw new GithubApiError(404, "list-successful-runs");
  const body = (await response.json()) as { workflow_runs?: Array<{ created_at?: string }> };
  return (body.workflow_runs ?? []).flatMap((run) => (run.created_at ? [run.created_at] : []));
}

export async function dispatchWorkflow(gh: GithubRepo, workflow: string): Promise<void> {
  const response = await github(gh, `/repos/${gh.owner}/${gh.repo}/actions/workflows/${workflow}/dispatches`, "dispatch", {
    method: "POST",
    body: { ref: BRANCH },
  });
  if (response.status === 404) throw new GithubApiError(404, "dispatch");
}
