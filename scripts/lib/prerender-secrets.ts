/**
 * Guard against server-only secrets leaking into prerendered HTML.
 *
 * The prerender never reads process.env into what it renders, so this is a
 * belt-and-braces check: every generated document is scanned for the values
 * of the server-only environment variables used by the api/ handlers (Vercel
 * builds) and the GitHub workflow secrets (workflows also run `npm run
 * build`). prerender-secrets.test.ts keeps the list in sync with both. Values
 * are never logged -- only the variable NAME is reported.
 */
export const SERVER_ONLY_ENV_KEYS = [
  // api/ handlers
  "BRACKET_SOURCE_URL_ESPN",
  "BRACKET_SOURCE_URL_NCAA",
  "BRACKET_SYNC_SECRET",
  "BUTTONDOWN_API_KEY",
  "CRON_SECRET",
  "NUMEROLOGY_EMAIL_RECEIVER_TOKEN",
  "ODDS_API_KEY",
  "POLYMARKET_SUPER_BOWL_EVENT_ID",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
  // .github/workflows secrets
  "CFBD_API_KEY",
  "GITHUB_TOKEN",
  "GOOGLE_SERVICE_ACCOUNT_KEY",
  "GOOGLE_SHEET_ID",
  "GROK_API_KEY",
  "JKB_X_ACCESS_SECRET",
  "JKB_X_ACCESS_TOKEN",
  "JKB_X_API_KEY",
  "JKB_X_API_SECRET",
  "NUMEROLOGY_EMAIL_WEBHOOK_TOKEN",
  "NUMEROLOGY_EMAIL_WEBHOOK_URL",
  "ODDS_API_KEY_BACKUP",
  "OPENAI_API_KEY",
  "PARLAYAPI",
  "PGA_API_KEY",
  "THERUNDOWNAPI",
  "THE_ODDS_API_KEY",
  "XAI_API_KEY",
] as const;

/**
 * api/ env names that are deliberately NOT treated as secrets: flags and
 * public values that may legitimately appear anywhere.
 */
export const NON_SECRET_API_ENV_KEYS = [
  "NODE_ENV",
  "BRACKET_SYNC_SEASON",
  "BUTTONDOWN_ALLOW_TEST_SEND",
  "BUTTONDOWN_CONTEXT",
  "BUTTONDOWN_EMAIL_STATUS",
  // VITE_* values are compiled into the public client bundle by design.
  "VITE_SUPABASE_URL",
] as const;

/** Shorter values (flags, "1", "true") are too likely to occur by coincidence to scan for. */
const MIN_SCANNED_SECRET_LENGTH = 8;

/**
 * Names of server-only variables whose present value occurs in `html`.
 * A value that is also a public VITE_* value (e.g. SUPABASE_URL ===
 * VITE_SUPABASE_URL) is already public and is not reported.
 */
export function findLeakedSecretNames(html: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const publicValues = new Set(
    Object.entries(env)
      .filter(([key, value]) => key.startsWith("VITE_") && value)
      .map(([, value]) => value as string),
  );
  return SERVER_ONLY_ENV_KEYS.filter((key) => {
    const value = env[key];
    if (!value || value.length < MIN_SCANNED_SECRET_LENGTH || publicValues.has(value)) return false;
    return html.includes(value);
  });
}
