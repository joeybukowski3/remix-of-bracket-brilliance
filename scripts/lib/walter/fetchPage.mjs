/**
 * Conservative single-page fetch for WalterFootball. This tool is invoked at
 * most four times per NFL week per window URL (Wed/Thu/Sat/Sun), so there is
 * no need for concurrency, aggressive retries, or caching -- a single GET
 * with one retry on transient failure is enough, and keeps traffic to the
 * site minimal per the "do not continuously hammer WalterFootball" mandate.
 */

const USER_AGENT = "JoeKnowsBallResearchBot/1.0 (+https://www.joeknowsball.com/walter; private research aid, low-frequency)";
const TIMEOUT_MS = 15000;

/**
 * @returns {Promise<{ ok: true, html: string, status: number } | { ok: false, error: string, status: number | null }>}
 */
export async function fetchWalterPage(url, { retries = 1 } = {}) {
  let lastError = null;
  let lastStatus = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      lastStatus = response.status;

      if (!response.ok) {
        lastError = `HTTP ${response.status} fetching ${url}`;
        continue;
      }

      const html = await response.text();
      return { ok: true, html, status: response.status };
    } catch (err) {
      clearTimeout(timeout);
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return { ok: false, error: lastError ?? "unknown fetch failure", status: lastStatus };
}
