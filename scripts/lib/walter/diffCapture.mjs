/**
 * Compares two normalized WalterGameCapture artifacts (same game, consecutive
 * capture types -- e.g. thursday vs wednesday) and produces a CaptureDelta
 * the UI renders as "Changes since {previous capture}". Pure/sync, no I/O.
 */

function diffStringList(previous, current) {
  const prevSet = new Set(previous ?? []);
  const currSet = new Set(current ?? []);
  const added = [...currSet].filter((x) => !prevSet.has(x));
  const removed = [...prevSet].filter((x) => !currSet.has(x));
  return { added, removed };
}

function injurySignature(injury) {
  return `${injury.team}:${injury.sentence}`;
}

export function diffCapture(previousCapture, currentCapture) {
  if (!previousCapture) {
    return {
      comparedTo: null,
      new: [],
      changed: [],
      removed: [],
      newInjuries: [],
      pickChanges: [],
    };
  }

  const angles = diffStringList(previousCapture.uncommonAngles, currentCapture.uncommonAngles);

  const prevInjurySigs = new Set((previousCapture.injuries ?? []).map(injurySignature));
  const newInjuries = (currentCapture.injuries ?? [])
    .filter((inj) => !prevInjurySigs.has(injurySignature(inj)))
    .map((inj) => `${inj.team === "away" ? currentCapture.game.away.name : currentCapture.game.home.name}: ${inj.sentence}`);

  const pickChanges = [];
  const prevPick = previousCapture.betting?.pick;
  const currPick = currentCapture.betting?.pick;
  if (prevPick?.spread !== currPick?.spread) {
    pickChanges.push(`Pick changed: ${prevPick?.spread ?? "no pick"} -> ${currPick?.spread ?? "no pick"}`);
  }
  if (prevPick?.units !== currPick?.units) {
    pickChanges.push(`Confidence changed: ${prevPick?.units ?? "?"} units -> ${currPick?.units ?? "?"} units`);
  }
  if (previousCapture.betting?.total !== currentCapture.betting?.total) {
    pickChanges.push(`Total lean changed: ${previousCapture.betting?.total ?? "none"} -> ${currentCapture.betting?.total ?? "none"}`);
  }

  const changed = [];
  if (previousCapture.snapshot?.thesis !== currentCapture.snapshot?.thesis) {
    changed.push("Snapshot thesis updated");
  }
  const teamBreakdownDiff = diffStringList(
    [...(previousCapture.teamBreakdowns?.away ?? []), ...(previousCapture.teamBreakdowns?.home ?? [])],
    [...(currentCapture.teamBreakdowns?.away ?? []), ...(currentCapture.teamBreakdowns?.home ?? [])],
  );
  if (teamBreakdownDiff.added.length || teamBreakdownDiff.removed.length) {
    changed.push("Team breakdown analysis updated");
  }

  return {
    comparedTo: previousCapture.captureType,
    new: angles.added,
    changed,
    removed: angles.removed,
    newInjuries,
    pickChanges,
  };
}

/**
 * Given the standard capture-type sequence, returns which prior capture type
 * a given capture type should diff against (wednesday has no predecessor).
 */
const CAPTURE_ORDER = ["wednesday", "thursday", "saturday", "sunday"];

export function previousCaptureType(captureType) {
  const idx = CAPTURE_ORDER.indexOf(captureType);
  if (idx <= 0) return null;
  return CAPTURE_ORDER[idx - 1];
}
