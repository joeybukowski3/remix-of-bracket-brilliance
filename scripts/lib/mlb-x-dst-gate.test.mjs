import test from "node:test";
import assert from "node:assert/strict";
import { formatEtClock, getCurrentEasternTime, resolveDstGateResult } from "./mlb-x-dst-gate.mjs";

// Real UTC timestamps, real Intl/ICU timezone conversion -- no mocking.
// A summer date is unambiguously EDT (UTC-4); a winter date is
// unambiguously EST (UTC-5) for America/New_York.
const EDT_DATE = "2026-07-15"; // clearly within DST
const EST_DATE = "2026-01-15"; // clearly outside DST

function etOfUtc(dateStr, utcHour, utcMinute) {
  const iso = `${dateStr}T${String(utcHour).padStart(2, "0")}:${String(utcMinute).padStart(2, "0")}:00Z`;
  return getCurrentEasternTime(new Date(iso));
}

test("getCurrentEasternTime correctly applies the EDT offset (UTC-4) in summer", () => {
  const et = etOfUtc(EDT_DATE, 17, 45);
  assert.deepEqual(et, { hour: 13, minute: 45 });
});

test("getCurrentEasternTime correctly applies the EST offset (UTC-5) in winter", () => {
  const et = etOfUtc(EST_DATE, 18, 45);
  assert.deepEqual(et, { hour: 13, minute: 45 });
});

const TARGETS = [
  { label: "HR backstop", target: { hour: 13, minute: 45 }, edtCronUtc: [17, 45], estCronUtc: [18, 45] },
  { label: "K backstop", target: { hour: 13, minute: 50 }, edtCronUtc: [17, 50], estCronUtc: [18, 50] },
  { label: "Numerology schedule", target: { hour: 11, minute: 0 }, edtCronUtc: [15, 0], estCronUtc: [16, 0] },
];

for (const { label, target, edtCronUtc, estCronUtc } of TARGETS) {
  test(`${label}: during EDT, only the EDT-aligned UTC cron entry proceeds`, () => {
    const edtFiring = etOfUtc(EDT_DATE, ...edtCronUtc);
    const estPairedFiringDuringEdt = etOfUtc(EDT_DATE, ...estCronUtc);

    const edtResult = resolveDstGateResult(edtFiring, target);
    const estPairedResult = resolveDstGateResult(estPairedFiringDuringEdt, target);

    assert.equal(edtResult.isDstMatch, true, `${label}: the EDT-aligned cron (${formatEtClock(edtFiring)} ET) must match the ${formatEtClock(target)} ET target`);
    assert.equal(estPairedResult.isDstMatch, false, `${label}: the EST-paired cron firing during EDT (${formatEtClock(estPairedFiringDuringEdt)} ET) must NOT match -- it's exactly one hour off`);
  });

  test(`${label}: during EST, only the EST-aligned UTC cron entry proceeds`, () => {
    const estFiring = etOfUtc(EST_DATE, ...estCronUtc);
    const edtPairedFiringDuringEst = etOfUtc(EST_DATE, ...edtCronUtc);

    const estResult = resolveDstGateResult(estFiring, target);
    const edtPairedResult = resolveDstGateResult(edtPairedFiringDuringEst, target);

    assert.equal(estResult.isDstMatch, true, `${label}: the EST-aligned cron (${formatEtClock(estFiring)} ET) must match the ${formatEtClock(target)} ET target`);
    assert.equal(edtPairedResult.isDstMatch, false, `${label}: the EDT-paired cron firing during EST (${formatEtClock(edtPairedFiringDuringEst)} ET) must NOT match -- it's exactly one hour off`);
  });
}

test("resolveDstGateResult: exact match has diffMinutes 0", () => {
  const result = resolveDstGateResult({ hour: 13, minute: 45 }, { hour: 13, minute: 45 });
  assert.equal(result.isDstMatch, true);
  assert.equal(result.diffMinutes, 0);
});

test("resolveDstGateResult: a firing within tolerance (GitHub Actions scheduling jitter) still matches", () => {
  const result = resolveDstGateResult({ hour: 13, minute: 52 }, { hour: 13, minute: 45 }, 10);
  assert.equal(result.isDstMatch, true);
  assert.equal(result.diffMinutes, 7);
});

test("resolveDstGateResult: exactly at the tolerance boundary still matches (inclusive)", () => {
  const result = resolveDstGateResult({ hour: 13, minute: 55 }, { hour: 13, minute: 45 }, 10);
  assert.equal(result.isDstMatch, true);
  assert.equal(result.diffMinutes, 10);
});

test("resolveDstGateResult: one minute past tolerance does not match", () => {
  const result = resolveDstGateResult({ hour: 13, minute: 56 }, { hour: 13, minute: 45 }, 10);
  assert.equal(result.isDstMatch, false);
  assert.equal(result.diffMinutes, 11);
});

test("formatEtClock pads single-digit hours/minutes", () => {
  assert.equal(formatEtClock({ hour: 9, minute: 5 }), "09:05");
});
