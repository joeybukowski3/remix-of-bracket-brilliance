import { personIdentityKey, stableId } from "./identity.mjs";

const TERMINAL_TYPES = new Set(["retirement", "unsigned_departure"]);
const ADDITION_TYPES = new Set(["free_agent_signing", "trade_addition", "waiver_claim", "draft_selection", "re_signing"]);
const DEPARTURE_TYPES = new Set(["trade_departure", "release", "retirement", "unsigned_departure"]);

function sourceRefKey(ref) {
  return [ref?.sourceId ?? "unknown-source", ref?.sourceRowId ?? "no-row"].join("|");
}

function mergeSourceRefs(a = [], b = []) {
  const byKey = new Map();
  for (const ref of [...a, ...b]) byKey.set(sourceRefKey(ref), ref);
  return [...byKey.values()].sort((x, y) => sourceRefKey(x).localeCompare(sourceRefKey(y)));
}

function transactionMergeKey(tx) {
  if (tx?.transactionId) return `id:${tx.transactionId}`;
  return stableId([
    "tx",
    tx?.type,
    tx?.transactionDate,
    personIdentityKey(tx?.player),
    tx?.fromTeamId ?? "none",
    tx?.toTeamId ?? "none",
  ]);
}

function comparableTx(tx) {
  return {
    type: tx.type,
    movementId: tx.movementId ?? null,
    player: personIdentityKey(tx.player),
    position: tx.position ?? null,
    fromTeamId: tx.fromTeamId ?? null,
    toTeamId: tx.toTeamId ?? null,
    transactionDate: tx.transactionDate ?? null,
    expectedRole: tx.expectedRole ?? null,
  };
}

function mergeDuplicateTransaction(existing, next, conflicts) {
  const a = comparableTx(existing);
  const b = comparableTx(next);
  for (const key of ["type", "movementId", "player", "position", "fromTeamId", "toTeamId", "transactionDate"]) {
    if (a[key] !== b[key]) {
      conflicts.push({
        conflictId: stableId(["transaction-conflict", existing.transactionId ?? transactionMergeKey(existing), key]),
        severity: ["transactionDate", "fromTeamId", "toTeamId"].includes(key) ? "critical" : "warning",
        category: "transaction",
        message: `duplicate transaction ${existing.transactionId ?? transactionMergeKey(existing)} has conflicting ${key}`,
        transactionIds: [existing.transactionId, next.transactionId].filter(Boolean),
      });
    }
  }
  return {
    ...existing,
    evidenceStatus: existing.evidenceStatus === "verified" || next.evidenceStatus !== "verified" ? existing.evidenceStatus : next.evidenceStatus,
    sourceRefs: mergeSourceRefs(existing.sourceRefs, next.sourceRefs),
    notes: [existing.notes, next.notes].filter(Boolean).filter((note, index, notes) => notes.indexOf(note) === index).join(" | ") || null,
  };
}

function movementSort(a, b) {
  return String(a.transactionDate).localeCompare(String(b.transactionDate)) || String(a.transactionId).localeCompare(String(b.transactionId));
}

function validateMovementChain(movementId, transactions) {
  const conflicts = [];
  const sorted = [...transactions].sort(movementSort);
  const identities = new Set(sorted.map((tx) => personIdentityKey(tx.player)));
  if (identities.size > 1) {
    conflicts.push({
      conflictId: stableId(["movement-conflict", movementId, "player"]),
      severity: "critical",
      category: "transaction",
      message: `movement ${movementId} contains multiple player identities`,
      transactionIds: sorted.map((tx) => tx.transactionId).filter(Boolean),
    });
  }
  const tradeAdditions = sorted.filter((tx) => tx.type === "trade_addition");
  const tradeDepartures = sorted.filter((tx) => tx.type === "trade_departure");
  if (tradeAdditions.length === 0 || tradeDepartures.length === 0) {
    conflicts.push({
      conflictId: stableId(["movement-conflict", movementId, "missing-side"]),
      severity: "critical",
      category: "transaction",
      message: `trade movement ${movementId} must include at least one trade departure and one trade addition`,
      transactionIds: sorted.map((tx) => tx.transactionId).filter(Boolean),
    });
  }

  const departureDestinations = new Set(tradeDepartures.map((tx) => tx.toTeamId).filter(Boolean));
  const additionTeams = new Set(tradeAdditions.map((tx) => tx.toTeamId).filter(Boolean));
  for (const destination of departureDestinations) {
    if (!additionTeams.has(destination)) {
      conflicts.push({
        conflictId: stableId(["movement-conflict", movementId, "destination", destination]),
        severity: "critical",
        category: "transaction",
        message: `trade movement ${movementId} has departure destination ${destination} without matching addition`,
        transactionIds: sorted.map((tx) => tx.transactionId).filter(Boolean),
      });
    }
  }

  return {
    movementId,
    playerKey: [...identities].sort()[0] ?? null,
    transactionIds: sorted.map((tx) => tx.transactionId).filter(Boolean),
    teams: [...new Set(sorted.flatMap((tx) => [tx.fromTeamId, tx.toTeamId]).filter(Boolean))].sort(),
    conflicts,
  };
}

export function reconcileTransactions(transactions) {
  const conflicts = [];
  const warnings = [];
  const byKey = new Map();

  for (const tx of transactions ?? []) {
    const key = transactionMergeKey(tx);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...tx, sourceRefs: mergeSourceRefs(tx.sourceRefs) });
      continue;
    }
    byKey.set(key, mergeDuplicateTransaction(existing, tx, conflicts));
  }

  const reconciled = [...byKey.values()].sort(movementSort);
  const byPlayer = new Map();
  for (const tx of reconciled) {
    const key = personIdentityKey(tx.player);
    byPlayer.set(key, [...(byPlayer.get(key) ?? []), tx]);
  }

  for (const [playerKey, rows] of byPlayer) {
    const chronological = [...rows].sort(movementSort);
    let currentTeam = null;
    let retired = false;
    for (const tx of chronological) {
      if (retired && ADDITION_TYPES.has(tx.type)) {
        conflicts.push({
          conflictId: stableId(["transaction-conflict", playerKey, "post-retirement", tx.transactionId]),
          severity: "critical",
          category: "transaction",
          message: `${playerKey} has an addition after retirement without explicit reinstatement support`,
          transactionIds: [tx.transactionId].filter(Boolean),
        });
      }
      if (currentTeam && tx.fromTeamId && currentTeam !== tx.fromTeamId && DEPARTURE_TYPES.has(tx.type)) {
        warnings.push({
          warningId: stableId(["transaction-warning", playerKey, "team-gap", tx.transactionId]),
          category: "transaction",
          message: `${playerKey} departs ${tx.fromTeamId} after last known team ${currentTeam}`,
        });
      }
      if (ADDITION_TYPES.has(tx.type)) currentTeam = tx.toTeamId ?? currentTeam;
      if (DEPARTURE_TYPES.has(tx.type)) currentTeam = tx.toTeamId ?? null;
      if (TERMINAL_TYPES.has(tx.type)) retired = tx.type === "retirement";
    }
  }

  const movementGroups = new Map();
  for (const tx of reconciled) {
    if (!tx.movementId) continue;
    movementGroups.set(tx.movementId, [...(movementGroups.get(tx.movementId) ?? []), tx]);
  }
  const movements = [];
  for (const [movementId, rows] of movementGroups) {
    const movement = validateMovementChain(movementId, rows);
    conflicts.push(...movement.conflicts);
    movements.push({ ...movement, conflicts: movement.conflicts.map((conflict) => conflict.conflictId) });
  }

  return {
    transactions: reconciled,
    movements: movements.sort((a, b) => a.movementId.localeCompare(b.movementId)),
    conflicts: conflicts.sort((a, b) => a.conflictId.localeCompare(b.conflictId)),
    warnings: warnings.sort((a, b) => a.warningId.localeCompare(b.warningId)),
  };
}

export function collectDatasetTransactions(dataset) {
  return (dataset?.teams ?? []).flatMap((team) => team.transactions ?? []);
}
