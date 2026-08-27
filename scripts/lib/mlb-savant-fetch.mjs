/**
 * Shared retryable-fetch helper for Baseball Savant Statcast CSV requests.
 * Savant's search endpoint is slow/rate-limit-prone under concurrent load, so
 * both the opponent-context and league-reference-context modules route
 * through this single retry/backoff policy instead of each rolling their own.
 */
const DEFAULT_TIMEOUT_MS = 45000;
const DEFAULT_RETRIES = 2;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function boundedBackoffMs(attempt) {
  return Math.min(400 * 2 ** attempt, 3000);
}

function isRetryableStatus(status) {
  return status === 429 || (status >= 500 && status < 600);
}

export async function fetchSavantCsv(url, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        headers: { Accept: "text/csv,*/*", "User-Agent": "Mozilla/5.0 (compatible; joeknowsball/1.0)" },
      });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status} for ${url}`);
        error.status = response.status;
        throw error;
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      const isRetryable = error?.name === "AbortError" || isRetryableStatus(error?.status);
      if (attempt < retries && isRetryable) {
        await sleep(boundedBackoffMs(attempt));
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error(`Failed request: ${url}`);
}
