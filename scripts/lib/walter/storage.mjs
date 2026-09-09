import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Private (never published to public/data) capture storage under
 * data/walter/{season}/week-{NN}/games/{AWAY}-{HOME}/{captureType}.json,
 * plus one manifest.json per week tracking ingestion status. Capture files
 * are never overwritten with a strictly worse result -- see
 * `shouldWriteCapture` -- so a bad Saturday run can never destroy a good
 * Thursday capture, and a bad rerun of the same slot can't destroy a good
 * prior run of that same slot either.
 */

export function weekDir(root, season, week) {
  return join(root, "data", "walter", String(season), `week-${String(week).padStart(2, "0")}`);
}

export function gameDir(root, season, week, gameId) {
  const [, , away, home] = gameId.split("_");
  return join(weekDir(root, season, week), "games", `${away}-${home}`);
}

export function captureFilePath(root, season, week, gameId, captureType) {
  return join(gameDir(root, season, week, gameId), `${captureType}.json`);
}

export function manifestPath(root, season, week) {
  return join(weekDir(root, season, week), "manifest.json");
}

/**
 * A candidate capture is only rejected when an existing "ok" capture would
 * be replaced by a non-"ok" one. Everything else (no prior file, equal or
 * better status, a same-day debug rerun) is allowed to write.
 */
export function shouldWriteCapture(existingCapture, candidateCapture) {
  if (!existingCapture) return true;
  if (existingCapture.parseStatus === "ok" && candidateCapture.parseStatus !== "ok") return false;
  return true;
}

export function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function writeJson(filePath, data) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function readManifest(root, season, week) {
  return (
    readJsonIfExists(manifestPath(root, season, week)) ?? {
      schemaVersion: "walter-manifest-v0.1",
      season,
      week,
      captures: {},
    }
  );
}

export function writeManifest(root, season, week, manifest) {
  writeJson(manifestPath(root, season, week), manifest);
}
