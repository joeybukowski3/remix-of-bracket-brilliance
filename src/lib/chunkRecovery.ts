/**
 * Recovery from a stale deploy. Every deploy replaces the hashed JS chunks, so a tab or cached page from before it asks for a
 * chunk that no longer exists. The host answers that request with the app shell (HTML, status 200), the browser refuses it as a
 * module, and the lazy route fails: the visitor is left with no page at all. A reload fetches the new shell and the new chunk.
 *
 * The reload is automatic but guarded: at most once per RELOAD_GUARD_MS, and never when the guard cannot be remembered, so a
 * chunk that stays missing cannot put the page in a reload loop.
 */

const CHUNK_ERROR = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError|Loading chunk [\w-]+ failed/i;

export const RELOAD_GUARD_KEY = "jkb:chunk-reload-at";
export const RELOAD_GUARD_MS = 60_000;

/** True for the errors browsers raise when a lazily loaded module or its stylesheet cannot be fetched. */
export function isChunkLoadError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : typeof error === "string" ? error : "";
  return CHUNK_ERROR.test(text);
}

interface GuardStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function sessionGuard(): GuardStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Reloads the page once to pick up a new deploy. Returns true when a reload was started, false when the guard held it back. */
export function reloadForNewDeploy(options: { now?: number; storage?: GuardStorage | null; reload?: () => void } = {}): boolean {
  const now = options.now ?? Date.now();
  const storage = options.storage === undefined ? sessionGuard() : options.storage;
  const reload = options.reload ?? (() => window.location.reload());
  if (storage === null) return false;
  try {
    const last = Number(storage.getItem(RELOAD_GUARD_KEY));
    if (Number.isFinite(last) && last > 0 && now - last < RELOAD_GUARD_MS) return false;
    storage.setItem(RELOAD_GUARD_KEY, String(now));
  } catch {
    return false;
  }
  reload();
  return true;
}
