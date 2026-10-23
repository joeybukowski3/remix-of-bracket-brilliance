/**
 * Durable ledger of what an approved odds request returned.
 *
 * One request produces one capture file: every normalized line (game, player,
 * bookmaker, market, line, Over and Under prices), the provider's own update
 * times, the license that applied, and the normalization diagnostics (the
 * entries the parser refused). A capture is written with exclusive create and
 * then marked read-only, so nothing in this module can edit or replace one.
 * Re-persisting identical content is a no-op; different content under an
 * existing name is an error. It never deletes.
 *
 * Captures are restricted research data: keep the directory under the gitignored
 * data/nba/. Turning a capture into pregame snapshots is `snapshotsFromCapture`.
 */
import { chmodSync, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, writeSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { sha256Json } from "../canonicalJson";
import { canonicalGameKey, canonicalTeamCode, etGameDate } from "../canonical";
import { DATA_USES } from "../sources/types";
import { buildSnapshot, MARKETS, PipelineValidationError, PROVIDER_MARKET_KEYS, type Market, type NbaPregameSnapshot, type OddsSourceId } from "./contracts";
import { DEFAULT_CAPTURE_POLICY } from "./captureWindow";
import { ODDS_SOURCE_LICENSES, ODDS_SOURCE_PROFILES } from "./oddsSources";
import type { ProviderPropLine } from "./pregameJob";

export const LINE_CAPTURE_SCHEMA = "nba-odds-line-capture-v1";

/** Provider team names (The Odds API spelling and common variants) to canonical codes. Unknown names stay null; nothing is guessed. */
const TEAM_NAME_CODES: Readonly<Record<string, string>> = Object.freeze({
  "atlanta hawks": "ATL", "boston celtics": "BOS", "brooklyn nets": "BKN", "charlotte hornets": "CHA", "chicago bulls": "CHI", "cleveland cavaliers": "CLE",
  "dallas mavericks": "DAL", "denver nuggets": "DEN", "detroit pistons": "DET", "golden state warriors": "GSW", "houston rockets": "HOU", "indiana pacers": "IND",
  "los angeles clippers": "LAC", "la clippers": "LAC", "los angeles lakers": "LAL", "la lakers": "LAL", "memphis grizzlies": "MEM", "miami heat": "MIA",
  "milwaukee bucks": "MIL", "minnesota timberwolves": "MIN", "new orleans pelicans": "NOP", "new york knicks": "NYK", "oklahoma city thunder": "OKC", "orlando magic": "ORL",
  "philadelphia 76ers": "PHI", "phoenix suns": "PHX", "portland trail blazers": "POR", "sacramento kings": "SAC", "san antonio spurs": "SAS", "toronto raptors": "TOR",
  "utah jazz": "UTA", "washington wizards": "WAS",
});

export const teamCodeFromName = (name: string): string | null => TEAM_NAME_CODES[name.trim().toLowerCase().replace(/\s+/g, " ")] ?? canonicalTeamCode(name);

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/).refine((s) => !Number.isNaN(Date.parse(s)), "invalid instant");
const sha = z.string().regex(/^[0-9a-f]{64}$/);
const market = z.enum(MARKETS);
const MAX_DIAGNOSTICS = 2000;

const captureLine = z.object({
  playerName: z.string().min(1),
  bookmaker: z.string().min(1),
  market,
  line: z.number().min(0).finite(),
  overPrice: z.number().int(),
  underPrice: z.number().int(),
  sourceLastUpdateUtc: iso.nullable(),
  rawProviderRef: z.object({ eventId: z.string().min(1), bookmakerKey: z.string().min(1), marketKey: z.string().min(1), overOutcomeIndex: z.number().int().min(0), underOutcomeIndex: z.number().int().min(0) }).nullable(),
});

export const lineCaptureSchema = z
  .object({
    schemaVersion: z.literal(LINE_CAPTURE_SCHEMA),
    captureId: z.string(),
    capturedAtUtc: iso,
    /** One-use approval that funded the request; null for a capture that was not approval-gated (for example a scheduled capture). */
    approvalId: z.string().min(1).nullable(),
    requestRef: z.string().min(1).nullable(),
    creditsCharged: z.number().min(0).nullable(),
    source: z.object({ sourceId: z.enum(["the-odds-api", "parlayapi", "manual-import", "synthetic-odds"]), method: z.enum(["api", "manual-import", "synthetic"]) }),
    event: z.object({
      sourceEventId: z.string().min(1),
      commenceTimeUtc: iso,
      homeTeamName: z.string().min(1),
      awayTeamName: z.string().min(1),
      homeTeam: z.string().nullable(),
      awayTeam: z.string().nullable(),
      canonicalGameKey: z.string().nullable(),
    }),
    /** The rights recorded when the capture was made. Later use takes the narrower of this and the current record. */
    license: z.object({ status: z.string().min(1), permittedUses: z.array(z.enum(DATA_USES)), basis: z.string().min(1), reviewedOn: z.string().min(1) }),
    lines: z.array(captureLine),
    diagnostics: z.object({
      /** Entries the normalizer refused, exactly as reported (first MAX_DIAGNOSTICS). */
      unmatched: z.array(z.string()),
      unmatchedCount: z.number().int().min(0),
      lineCount: z.number().int().min(0),
      usageIssue: z.string().nullable(),
    }),
    contentSha256: sha,
  })
  .superRefine((c, ctx) => {
    const bad = (p: string[], message: string) => ctx.addIssue({ code: "custom", path: p, message });
    if (c.diagnostics.lineCount !== c.lines.length) bad(["diagnostics", "lineCount"], "does not match the stored lines");
    if (c.license.permittedUses.includes("raw-redistribution") && c.source.method !== "synthetic") bad(["license", "permittedUses"], "raw redistribution is never granted to captured lines");
    const { contentSha256: _hash, captureId: _id, ...body } = c;
    const hash = sha256Json(body);
    if (c.contentSha256 !== hash) bad(["contentSha256"], "content hash mismatch");
    if (c.captureId !== `cap_${hash.slice(0, 32)}`) bad(["captureId"], "id does not match the content hash");
  });
export type NbaLineCapture = z.infer<typeof lineCaptureSchema>;

export function parseLineCapture(input: unknown): NbaLineCapture {
  const parsed = lineCaptureSchema.safeParse(input);
  if (!parsed.success) throw new PipelineValidationError("line capture", parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`));
  return parsed.data;
}

export interface LineCaptureInput {
  sourceId: OddsSourceId;
  capturedAtUtc: string;
  approvalId: string | null;
  requestRef: string | null;
  creditsCharged: number | null;
  event: { sourceEventId: string; commenceTimeUtc: string; homeTeamName: string; awayTeamName: string };
  lines: readonly ProviderPropLine[];
  unmatched: readonly string[];
  usageIssue: string | null;
}

/** Derives the ids, game key, license block and hash, then validates. Lines are kept exactly as normalized; none is dropped or repaired. */
export function buildLineCapture(input: LineCaptureInput): NbaLineCapture {
  const license = ODDS_SOURCE_LICENSES[input.sourceId];
  const homeTeam = teamCodeFromName(input.event.homeTeamName);
  const awayTeam = teamCodeFromName(input.event.awayTeamName);
  const body = {
    schemaVersion: LINE_CAPTURE_SCHEMA,
    capturedAtUtc: input.capturedAtUtc,
    approvalId: input.approvalId,
    requestRef: input.requestRef,
    creditsCharged: input.creditsCharged,
    source: { sourceId: input.sourceId, method: ODDS_SOURCE_PROFILES[input.sourceId].method },
    event: { ...input.event, homeTeam, awayTeam, canonicalGameKey: canonicalGameKey({ gameDate: etGameDate(input.event.commenceTimeUtc), homeCode: homeTeam, awayCode: awayTeam }) },
    license: { status: license.status, permittedUses: [...license.permittedUses], basis: license.basis, reviewedOn: license.reviewedOn },
    lines: input.lines.map((l) => ({ playerName: l.playerName, bookmaker: l.sportsbook, market: l.market, line: l.line, overPrice: l.overPrice, underPrice: l.underPrice, sourceLastUpdateUtc: l.lastUpdateUtc, rawProviderRef: l.rawProviderRef ?? null })),
    diagnostics: { unmatched: input.unmatched.slice(0, MAX_DIAGNOSTICS), unmatchedCount: input.unmatched.length, lineCount: input.lines.length, usageIssue: input.usageIssue },
  };
  const hash = sha256Json(body);
  return parseLineCapture({ ...body, captureId: `cap_${hash.slice(0, 32)}`, contentSha256: hash });
}

export interface CaptureReceipt {
  status: "stored" | "duplicate";
  captureId: string;
  file: string;
}
/** Where an approved request's response is made durable. Must resolve before the caller reports the request finished. */
export type LineCaptureSink = (capture: NbaLineCapture) => Promise<CaptureReceipt>;

const safeName = (s: string): string => s.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60);

export function captureFileName(capture: NbaLineCapture): string {
  return `${capture.capturedAtUtc.replace(/[:.]/g, "-")}_${safeName(capture.event.sourceEventId)}_${capture.captureId.slice(4, 12)}.json`;
}

/** Write-once file ledger. Exclusive create, fsync, then read-only; never overwrites, never removes. */
export function fileLineCaptureSink(dir: string): LineCaptureSink {
  return async (capture) => {
    const checked = parseLineCapture(capture);
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, captureFileName(checked));
    const text = `${JSON.stringify(checked, null, 2)}\n`;
    let fd: number;
    try {
      fd = openSync(file, "wx", 0o444);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (parseLineCapture(JSON.parse(readFileSync(file, "utf8"))).contentSha256 !== checked.contentSha256) throw new Error(`capture ${path.basename(file)} already exists with different content`);
      return { status: "duplicate", captureId: checked.captureId, file };
    }
    try {
      writeSync(fd, text);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    try {
      chmodSync(file, 0o444);
    } catch {
      // read-only marking is best effort on filesystems without POSIX modes; exclusive create already prevents replacement
    }
    return { status: "stored", captureId: checked.captureId, file };
  };
}

/** Every capture in a directory, oldest first. A corrupt or tampered file fails the read rather than being skipped. */
export function readLineCaptures(dir: string): NbaLineCapture[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      try {
        // The ledger is regular files only; a link could point a build at a file that is not part of it.
        if (!lstatSync(path.join(dir, name)).isFile()) throw new Error("not a regular file");
        return parseLineCapture(JSON.parse(readFileSync(path.join(dir, name), "utf8")));
      } catch (error) {
        throw new Error(`capture ${name} is invalid: ${error instanceof Error ? error.message : String(error)}`);
      }
    })
    .sort((a, b) => a.capturedAtUtc.localeCompare(b.capturedAtUtc) || a.captureId.localeCompare(b.captureId));
}

export interface CaptureConversion {
  snapshots: NbaPregameSnapshot[];
  rejected: Array<{ player: string; bookmaker: string; market: Market; reason: string }>;
}

export interface CaptureConversionOptions {
  /** Team of a player, from a roster source. A name that resolves outside the game's two teams is treated as unknown. */
  teamOf?: (playerName: string) => string | null;
  /** Rights in force now; the narrower of these and the capture's recorded rights applies. */
  currentLicenses?: typeof ODDS_SOURCE_LICENSES;
  maxAgeMinutes?: number;
}

/**
 * Re-validates a capture's lines as pregame snapshots. A line outside the
 * 45-240 minute window, or in a game whose teams could not be identified, is
 * reported as rejected with the reason, never adjusted.
 */
export function snapshotsFromCapture(capture: NbaLineCapture, options: CaptureConversionOptions = {}): CaptureConversion {
  const { event } = capture;
  const rejectAll = (reason: string): CaptureConversion => ({ snapshots: [], rejected: capture.lines.map((l) => ({ player: l.playerName, bookmaker: l.bookmaker, market: l.market, reason })) });
  if (!event.canonicalGameKey || !event.homeTeam || !event.awayTeam) return rejectAll("game teams could not be mapped to canonical codes");
  const current = (options.currentLicenses ?? ODDS_SOURCE_LICENSES)[capture.source.sourceId];
  const permittedUses = capture.license.permittedUses.filter((use) => current.permittedUses.includes(use));
  const snapshots: NbaPregameSnapshot[] = [];
  const rejected: CaptureConversion["rejected"] = [];
  for (const l of capture.lines) {
    const rostered = options.teamOf?.(l.playerName) ?? null;
    const team = rostered === event.homeTeam || rostered === event.awayTeam ? rostered : null;
    try {
      snapshots.push(
        buildSnapshot({
          game: { canonicalGameKey: event.canonicalGameKey, sourceEventId: event.sourceEventId, tipoffUtc: event.commenceTimeUtc, awayTeam: event.awayTeam, homeTeam: event.homeTeam, neutralSite: false },
          player: { canonicalPlayerId: null, sourcePlayerName: l.playerName, sourcePlayerId: null, team },
          market: l.market,
          source: { sourceId: capture.source.sourceId, method: capture.source.method, sportsbook: l.bookmaker, sourceMarketKey: PROVIDER_MARKET_KEYS[l.market], ...(l.rawProviderRef ? { rawProviderRef: l.rawProviderRef } : {}), playerIdentityAmbiguous: team === null },
          line: l.line,
          overPrice: l.overPrice,
          underPrice: l.underPrice,
          sourceLastUpdateUtc: l.sourceLastUpdateUtc,
          capturedAtUtc: capture.capturedAtUtc,
          maxAgeMinutes: options.maxAgeMinutes ?? DEFAULT_CAPTURE_POLICY.maxLineAgeMinutes,
          projection: { unavailableReason: "no projection supplied" },
          permissions: { permittedUses, licenseBasis: capture.license.basis, licenseReviewedOn: capture.license.reviewedOn, attestation: null },
          provenance: { runId: null, importBatchId: capture.captureId, creditsCharged: capture.creditsCharged },
        }),
      );
    } catch (error) {
      if (!(error instanceof PipelineValidationError)) throw error;
      rejected.push({ player: l.playerName, bookmaker: l.bookmaker, market: l.market, reason: error.message.slice(0, 200) });
    }
  }
  return { snapshots, rejected };
}
