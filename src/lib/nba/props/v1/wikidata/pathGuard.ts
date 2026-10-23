/**
 * Confines CLI input and output paths to approved directories, checked twice: as written and after
 * directory links (symlinks, Windows junctions) are resolved. A link inside data/nba/ that points out
 * of the project must not redirect a read or a write, including a dangling link whose target is created later.
 */
import { lstatSync, mkdirSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const toPosix = (p: string) => p.split(path.sep).join("/");

function isWithin(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Whether anything, including a dangling link, exists at `target` (unlike existsSync, which follows links). */
function entryExists(target: string): boolean {
  try {
    lstatSync(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/**
 * The real path of the deepest ancestor of `target` that exists, with the unresolved remainder re-appended.
 * A link that exists but cannot be resolved (dangling) is refused: a later write would follow it once its
 * target appears.
 */
function realpathOfDeepestExisting(target: string): string {
  let current = target;
  const rest: string[] = [];
  while (!entryExists(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    rest.unshift(path.basename(current));
    current = parent;
  }
  try {
    return path.join(realpathSync(current), ...rest);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`"${toPosix(current)}" is a dangling link; refusing to follow it`);
    throw error;
  }
}

/**
 * Resolves `requested` against `root` and returns the absolute path, or throws unless it stays inside
 * one of `allowedDirs` (repo-relative, posix) both lexically and after links are resolved.
 */
export function resolveInside(root: string, requested: string, allowedDirs: readonly string[]): string {
  const absolute = path.resolve(root, requested);
  const allowed = allowedDirs.map((dir) => path.resolve(root, dir));
  if (!allowed.some((dir) => isWithin(absolute, dir))) {
    throw new Error(`path must be under ${allowedDirs.join(" or ")}, got "${toPosix(requested)}"`);
  }
  const realAbsolute = realpathOfDeepestExisting(absolute);
  const realAllowed = allowed.map((dir) => realpathOfDeepestExisting(dir));
  if (!realAllowed.some((dir) => isWithin(realAbsolute, dir))) {
    throw new Error(`path "${toPosix(requested)}" resolves outside ${allowedDirs.join(" or ")} through a directory link`);
  }
  return absolute;
}

/**
 * Writes one file: guards the final path, creates its directories, guards it again now that they exist, then
 * writes to a create-new temporary name and renames, so a half-written or planted file is never the result.
 */
export function writeFileGuarded(root: string, requested: string, allowedDirs: readonly string[], content: string): string {
  const target = resolveInside(root, requested, allowedDirs);
  mkdirSync(path.dirname(target), { recursive: true });
  resolveInside(root, requested, allowedDirs);
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temp, content, { flag: "wx" });
  renameSync(temp, target);
  return target;
}
