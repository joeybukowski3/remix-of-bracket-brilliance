/**
 * Plans (never performs) the upload of a private board to the hosted store: validates the file, asks the hosting gate what
 * may leave this computer, and builds the envelope. Pure, so the publish script and the tests share one decision path.
 */
import type { PropsBoardArtifact } from "../propsBoard";
import { decideHosting, type GateLicenses, type HostingDecision } from "./hostingGate";
import { buildEnvelope, HOSTED_BOARD_SCHEMA, type HostedSnapshotEnvelope } from "./redact";

export interface PublishPlan {
  ok: boolean;
  /** Why nothing would be uploaded; null when ok. */
  problem: string | null;
  decision: HostingDecision | null;
  envelope: HostedSnapshotEnvelope | null;
  counts: { entriesIn: number; entriesOut: number; dvpRowsOut: number; envelopeBytes: number };
}

const EMPTY_COUNTS = { entriesIn: 0, entriesOut: 0, dvpRowsOut: 0, envelopeBytes: 0 };
const refuse = (problem: string, decision: HostingDecision | null = null, entriesIn = 0): PublishPlan => ({ ok: false, problem, decision, envelope: null, counts: { ...EMPTY_COUNTS, entriesIn } });

function isPrivateBoard(raw: unknown): raw is PropsBoardArtifact {
  if (typeof raw !== "object" || raw === null) return false;
  const board = raw as Partial<PropsBoardArtifact>;
  return board.schemaVersion === HOSTED_BOARD_SCHEMA && Array.isArray(board.entries) && Array.isArray(board.dvpRows) && typeof board.sources === "object" && board.sources !== null && Array.isArray(board.sources.lines);
}

export function planPublish(raw: unknown, publishedAtUtc: string, licenses?: GateLicenses): PublishPlan {
  if (!isPrivateBoard(raw)) return refuse("the file is not an NBA props board");
  if (raw.privatePreview === undefined) return refuse("only private preview boards are published here; a public board goes to public/data through the public builder", null, raw.entries.length);
  const decision = decideHosting(raw, licenses);
  if (decision.tier === null) return refuse(decision.reason, decision, raw.entries.length);
  const envelope = buildEnvelope(raw, decision.tier, publishedAtUtc);
  const envelopeBytes = Buffer.byteLength(JSON.stringify(envelope));
  return { ok: true, problem: null, decision, envelope, counts: { entriesIn: raw.entries.length, entriesOut: envelope.board.entries.length, dvpRowsOut: envelope.board.dvpRows.length, envelopeBytes } };
}
