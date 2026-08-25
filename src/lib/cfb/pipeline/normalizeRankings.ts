import { getJkbTeamIdForCfbdName } from "../../../data/cfb/externalTeamMapping";
import { getTeamMetadataById } from "../../../data/cfb/teamMetadata";

/**
 * Official college-football poll normalization (AP / CFP Playoff Committee).
 *
 * This layer is deliberately pure: it takes a raw CFBD `/rankings` payload and
 * produces a validated, deterministic official-ranking selection. It never
 * touches JKB model math — official polls are a comparison/display layer only.
 *
 * Team identity: CFBD's `/rankings` `ranks[]` entries are name-keyed (`school`),
 * not id-keyed. When the payload does carry a numeric team id we prefer it via
 * the caller-supplied id map; otherwise we fall back to the SAME canonical
 * alias table already used by the schedule/odds pipeline
 * (`getJkbTeamIdForCfbdName`). That table is exact-match-after-normalization —
 * there is no fuzzy/nearest-name matching anywhere in this path, so an
 * unrecognized school is reported as an error rather than silently mapped.
 */

export type CfbOfficialPollKind = "ap" | "cfp";

export type CfbdRankingEntryRaw = {
  rank: number;
  /** CFBD's canonical field. */
  school?: string;
  /** Tolerated alias seen on some CFBD response shapes. */
  team?: string;
  conference?: string | null;
  firstPlaceVotes?: number | null;
  points?: number | null;
  /** Present only on payload shapes that carry a numeric team id. */
  teamId?: number | null;
  schoolId?: number | null;
};

export type CfbdPollRaw = {
  poll: string;
  ranks: CfbdRankingEntryRaw[];
};

export type CfbdRankingWeekRaw = {
  season: number;
  seasonType: string;
  week: number;
  polls: CfbdPollRaw[];
};

/** One validated official rank row, joined to a production JKB team id. */
export type CfbOfficialRankEntry = {
  teamId: string;
  rank: number;
  /** Source school string exactly as published, retained for provenance/audit. */
  sourceName: string;
  firstPlaceVotes: number | null;
  points: number | null;
};

/** A validated, currently-active official poll. */
export type CfbOfficialPollSelection = {
  kind: CfbOfficialPollKind;
  /** Poll name exactly as published by the source. */
  pollName: string;
  seasonType: string;
  week: number;
  entries: CfbOfficialRankEntry[];
};

export type CfbOfficialPollResult =
  | { ok: true; selection: CfbOfficialPollSelection }
  /**
   * `reason` distinguishes the three non-failure "no official rank" cases from
   * a genuine data problem:
   * - "absent": the poll legitimately does not exist yet (e.g. no CFP poll
   *   before November). NOT an error condition for callers/workflows.
   * - "invalid": a poll was found but failed validation — callers must keep
   *   last-known-good rather than publishing it.
   */
  | { ok: false; reason: "absent" | "invalid"; errors: string[] };

const OFFICIAL_POLL_SIZE = 25;

const SEASON_TYPE_ORDER: Readonly<Record<string, number>> = Object.freeze({
  preseason: 0,
  regular: 1,
  postseason: 2,
});

function normalizePollName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Poll-name matchers. CFBD publishes the committee poll as "Playoff Committee
 * Rankings"; the other spellings are tolerated so a source-side rename does not
 * silently drop CFP support.
 */
const POLL_NAME_MATCHERS: Readonly<Record<CfbOfficialPollKind, (name: string) => boolean>> =
  Object.freeze({
    ap: (name) => name === "ap top 25" || name === "ap poll" || name === "associated press",
    cfp: (name) =>
      name === "playoff committee rankings" ||
      name === "cfp rankings" ||
      name === "college football playoff rankings" ||
      name === "cfp",
  });

export function matchesPollKind(pollName: string, kind: CfbOfficialPollKind): boolean {
  return POLL_NAME_MATCHERS[kind](normalizePollName(pollName));
}

function seasonTypeOrdinal(seasonType: string): number {
  return SEASON_TYPE_ORDER[seasonType.toLowerCase()] ?? 1;
}

function entrySchool(entry: CfbdRankingEntryRaw): string {
  return (entry.school ?? entry.team ?? "").trim();
}

function entryExternalId(entry: CfbdRankingEntryRaw): number | null {
  const id = entry.teamId ?? entry.schoolId ?? null;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

/**
 * Active-poll selection rule (deterministic, single rule for both polls):
 * take the LATEST published week for that poll kind in the payload, ordered by
 * (seasonType ordinal, week). For AP that naturally yields the preseason poll
 * while it is the only one published, and rolls forward to each new weekly poll
 * as it appears. For CFP it yields nothing until the committee's first release.
 */
export function selectLatestPoll(
  weeks: readonly CfbdRankingWeekRaw[],
  kind: CfbOfficialPollKind,
): { week: CfbdRankingWeekRaw; poll: CfbdPollRaw } | null {
  let best: { week: CfbdRankingWeekRaw; poll: CfbdPollRaw } | null = null;
  for (const week of weeks) {
    if (!Array.isArray(week?.polls)) continue;
    for (const poll of week.polls) {
      if (!poll || typeof poll.poll !== "string" || !matchesPollKind(poll.poll, kind)) continue;
      if (
        best === null ||
        seasonTypeOrdinal(week.seasonType) > seasonTypeOrdinal(best.week.seasonType) ||
        (seasonTypeOrdinal(week.seasonType) === seasonTypeOrdinal(best.week.seasonType) &&
          week.week > best.week.week)
      ) {
        best = { week, poll };
      }
    }
  }
  return best;
}

/**
 * Rank-sequence validation, tie-aware.
 *
 * The AP and CFP polls DO publish ties: when two teams finish with identical
 * point totals they share a rank and the poll skips the slots the tie consumed.
 * The real 2026 preseason AP poll does exactly this — USC and BYU are both #14
 * with 839 points each, and the poll resumes at #16 with no #15. Treating a
 * shared rank as a duplicate would reject a perfectly valid poll.
 *
 * So instead of "ranks are exactly the set 1..25", the invariant is a walk:
 * groups of equal rank must appear in ascending order, each group's rank must
 * equal the running position, and a group of K teams advances the position by
 * K. A well-formed 25-team poll therefore always ends at position 26.
 *
 * A shared rank is only legitimate when the tied teams have equal poll points;
 * a shared rank with differing points is a source data error, not a tie.
 */
function validateRankSequence(entries: readonly CfbOfficialRankEntry[]): string[] {
  if (entries.length === 0) return [];
  const errors: string[] = [];

  const byRank = new Map<number, CfbOfficialRankEntry[]>();
  for (const entry of entries) {
    const group = byRank.get(entry.rank);
    if (group) group.push(entry);
    else byRank.set(entry.rank, [entry]);
  }

  let position = 1;
  let sequenceBroken = false;
  for (const rank of [...byRank.keys()].sort((a, b) => a - b)) {
    const group = byRank.get(rank) as CfbOfficialRankEntry[];
    if (rank !== position) {
      errors.push(
        `rank ${rank} breaks the poll sequence: expected ${position} at this position ` +
          `(${group.map((entry) => entry.sourceName).join(", ")})`,
      );
      sequenceBroken = true;
      break;
    }
    if (group.length > 1) {
      const points = group.map((entry) => entry.points);
      if (points.every((value) => value !== null) && new Set(points).size > 1) {
        errors.push(
          `rank ${rank} is shared by ${group.length} teams with differing poll points ` +
            `(${group.map((entry) => `${entry.sourceName}=${entry.points}`).join(", ")}) — not a legitimate tie`,
        );
      }
    }
    position += group.length;
  }

  if (!sequenceBroken && entries.length === OFFICIAL_POLL_SIZE && position !== OFFICIAL_POLL_SIZE + 1) {
    errors.push(
      `poll sequence covers positions 1-${position - 1}, expected 1-${OFFICIAL_POLL_SIZE}`,
    );
  }

  return errors;
}

/**
 * Strict validation. Returns every problem found rather than the first, so a
 * failing refresh reports actionable detail instead of one symptom.
 */
export function validateOfficialPollEntries(
  entries: readonly CfbOfficialRankEntry[],
): string[] {
  const errors: string[] = [];

  if (entries.length !== OFFICIAL_POLL_SIZE) {
    errors.push(`expected exactly ${OFFICIAL_POLL_SIZE} ranked teams, received ${entries.length}`);
  }

  const ranks = entries.map((entry) => entry.rank);
  const uniqueRanks = new Set(ranks);

  const teamIds = entries.map((entry) => entry.teamId);
  const uniqueTeamIds = new Set(teamIds);
  if (uniqueTeamIds.size !== teamIds.length) {
    const duplicates = [...new Set(teamIds.filter((id, index) => teamIds.indexOf(id) !== index))];
    errors.push(`duplicate teams: ${duplicates.sort().join(", ")}`);
  }

  const outOfRange = [...uniqueRanks]
    .filter((rank) => !Number.isInteger(rank) || rank < 1 || rank > OFFICIAL_POLL_SIZE)
    .sort((a, b) => a - b);
  if (outOfRange.length > 0) {
    errors.push(`ranks outside 1-${OFFICIAL_POLL_SIZE}: ${outOfRange.join(", ")}`);
  }

  errors.push(...validateRankSequence(entries));

  // Production metadata holds FBS teams only, so an id that fails this lookup
  // is either an FCS/unknown school or a mapping regression — never publish it.
  const unknown = entries.filter((entry) => getTeamMetadataById(entry.teamId) === undefined);
  if (unknown.length > 0) {
    errors.push(
      `team ids absent from production metadata (non-FBS or unmapped): ${unknown
        .map((entry) => `${entry.teamId} (${entry.sourceName})`)
        .join(", ")}`,
    );
  }

  return errors;
}

/**
 * Normalize + validate one poll kind out of a raw CFBD `/rankings` payload.
 *
 * `externalIdToTeamId` is optional and takes precedence when the payload
 * carries numeric team ids (the strongest canonical identifier). Name matching
 * is the documented fallback, and is exact-after-normalization only.
 */
export function normalizeOfficialPoll(
  weeks: readonly CfbdRankingWeekRaw[],
  kind: CfbOfficialPollKind,
  externalIdToTeamId?: ReadonlyMap<number, string>,
): CfbOfficialPollResult {
  const found = selectLatestPoll(weeks, kind);
  if (found === null) {
    return { ok: false, reason: "absent", errors: [`no ${kind.toUpperCase()} poll present in payload`] };
  }

  const rawRanks = Array.isArray(found.poll.ranks) ? found.poll.ranks : [];
  if (rawRanks.length === 0) {
    return {
      ok: false,
      reason: "absent",
      errors: [`${found.poll.poll} (week ${found.week.week}) contained no ranked teams`],
    };
  }

  const unmapped: string[] = [];
  const entries: CfbOfficialRankEntry[] = [];
  for (const raw of rawRanks) {
    const sourceName = entrySchool(raw);
    const externalId = entryExternalId(raw);
    const teamId =
      (externalId !== null ? externalIdToTeamId?.get(externalId) ?? null : null) ??
      (sourceName ? getJkbTeamIdForCfbdName(sourceName) : null);
    if (teamId === null) {
      unmapped.push(sourceName || `[unnamed rank ${raw.rank}]`);
      continue;
    }
    entries.push({
      teamId,
      rank: Number(raw.rank),
      sourceName,
      firstPlaceVotes: typeof raw.firstPlaceVotes === "number" ? raw.firstPlaceVotes : null,
      points: typeof raw.points === "number" ? raw.points : null,
    });
  }

  const errors = validateOfficialPollEntries(entries);
  if (unmapped.length > 0) {
    errors.unshift(`unmapped source team names (no silent fuzzy match): ${unmapped.join(", ")}`);
  }
  if (errors.length > 0) {
    return { ok: false, reason: "invalid", errors };
  }

  return {
    ok: true,
    selection: {
      kind,
      pollName: found.poll.poll,
      seasonType: found.week.seasonType,
      week: found.week.week,
      // Deterministic output: rank-ascending, then team id so that tied teams
      // sharing a rank still serialize in a stable, source-order-independent way.
      entries: [...entries].sort((a, b) => a.rank - b.rank || a.teamId.localeCompare(b.teamId)),
    },
  };
}

/** Convert a validated selection into the artifact's compact rank map. */
export function toRankMap(
  selection: CfbOfficialPollSelection | null,
): Readonly<Record<string, number>> {
  if (selection === null) return Object.freeze({});
  return Object.freeze(
    Object.fromEntries(
      [...selection.entries]
        .sort((a, b) => a.teamId.localeCompare(b.teamId))
        .map((entry) => [entry.teamId, entry.rank]),
    ),
  );
}
