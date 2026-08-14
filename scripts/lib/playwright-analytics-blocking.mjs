const BLOCKED_ANALYTICS_HOSTS = Object.freeze([
  "google-analytics.com",
  "googletagmanager.com",
]);

const blockedRequestsByContext = new WeakMap();

function normalizeHostname(hostname) {
  return hostname.toLowerCase().replace(/\.$/, "");
}

export function isBlockedAnalyticsUrl(url) {
  let hostname;
  try {
    hostname = normalizeHostname(new URL(url).hostname);
  } catch {
    return false;
  }

  return BLOCKED_ANALYTICS_HOSTS.some(
    (blockedHost) =>
      hostname === blockedHost || hostname.endsWith(`.${blockedHost}`),
  );
}

export async function installAnalyticsBlocking(context) {
  if (blockedRequestsByContext.has(context)) return;

  const blockedRequests = [];
  blockedRequestsByContext.set(context, blockedRequests);
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (isBlockedAnalyticsUrl(url)) {
      blockedRequests.push(url);
      await route.abort();
      return;
    }

    await route.fallback();
  });
}

export function getBlockedAnalyticsRequests(context) {
  return [...(blockedRequestsByContext.get(context) ?? [])];
}

export function isAnalyticsBlockingInstalled(context) {
  return blockedRequestsByContext.has(context);
}

export async function createAnalyticsBlockingContext(browser, options = {}) {
  const context = await browser.newContext({
    ...options,
    serviceWorkers: "block",
  });
  await installAnalyticsBlocking(context);
  return context;
}

export async function createAnalyticsBlockingPage(browser, options = {}) {
  const page = await browser.newPage({
    ...options,
    serviceWorkers: "block",
  });
  await installAnalyticsBlocking(page.context());
  return page;
}
