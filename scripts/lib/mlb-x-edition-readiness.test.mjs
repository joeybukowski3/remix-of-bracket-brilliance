/**
 * mlb-x-edition-readiness.test.mjs
 * Run via: node --test scripts/lib/mlb-x-edition-readiness.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  Caption,
  LanguageMode,
  Stage,
  Decision,
  easternParts,
  ReadinessStatus,
  resolveEditionReadiness,
} from "./mlb-x-edition-readiness.mjs";

const SLATE = "2026-07-21";

/** Everything a run needs, so each test varies exactly one thing. */
function input(overrides = {}) {
  return {
    now: "2026-07-21T14:00:00Z", // 10:00 ET (EDT)
    slateDate: SLATE,
    market: "k",
    edition: "morning",
    firstGameTime: "2026-07-21T22:40:00Z",
    gamesScheduled: 15,
    artifactSlateDate: SLATE,
    artifactGeneratedAt: "2026-07-21T13:00:00Z",
    artifactFreshnessStatus: "fresh",
    validPicks: 5,
    selectedGames: [824409],
    selectedLineupStatus: null,
    image: { exists: true, slateDate: SLATE, generatedAt: "2026-07-21T13:30:00Z", width: 1200, height: 675, source: "render", path: "/tmp/x.png" },
    receipt: { exists: false, outcome: null, postId: null },
    liveMode: true,
    allowLivePost: true,
    credentialsPresent: true,
    verifiedAccount: true,
    ...overrides,
  };
}
const confirmed = (o = {}) => input({ edition: "confirmed", ...o });
/** now such that first pitch (22:40Z) is `mins` minutes away. */
const minsOut = (mins) => new Date(Date.parse("2026-07-21T22:40:00Z") - mins * 60_000).toISOString();

describe("Eastern time handling", () => {
  it("is DST-correct rather than a fixed offset", () => {
    // July -> EDT (UTC-4)
    assert.equal(easternParts("2026-07-21T14:00:00Z").date, "2026-07-21");
    assert.equal(easternParts("2026-07-21T14:00:00Z").hour, 10);
    // January -> EST (UTC-5): the same UTC clock reads an hour earlier.
    assert.equal(easternParts("2026-01-21T14:00:00Z").hour, 9);
  });

  it("keeps the ET calendar date, not the UTC one", () => {
    // 02:00Z on the 22nd is still 22:00 ET on the 21st.
    const p = easternParts("2026-07-22T02:00:00Z");
    assert.equal(p.date, "2026-07-21");
    assert.equal(p.hour, 22);
  });
});

describe("morning edition window", () => {
  it("waits before 09:45 ET", () => {
    const r = resolveEditionReadiness(input({ now: "2026-07-21T13:30:00Z" })); // 09:30 ET
    assert.equal(r.decision, Decision.WAIT);
    assert.equal(r.status, ReadinessStatus.NOT_DUE);
  });

  it("posts at the 09:45 ET boundary", () => {
    const r = resolveEditionReadiness(input({ now: "2026-07-21T13:45:00Z" }));
    assert.equal(r.decision, Decision.POST);
  });

  it("posts at 10:00 ET, the target", () => {
    assert.equal(resolveEditionReadiness(input()).decision, Decision.POST);
  });

  it("posts at the 11:15 ET boundary", () => {
    const r = resolveEditionReadiness(input({ now: "2026-07-21T15:15:00Z" }));
    assert.equal(r.decision, Decision.POST);
  });

  it("skips after 11:15 ET", () => {
    const r = resolveEditionReadiness(input({ now: "2026-07-21T15:16:00Z" }));
    assert.equal(r.decision, Decision.SKIP);
    assert.equal(r.status, ReadinessStatus.MISSED_WINDOW);
  });

  it("holds the window in EST as well as EDT", () => {
    // 15:00Z in January is 10:00 EST -- same wall clock, different offset.
    const r = resolveEditionReadiness(input({
      now: "2026-01-21T15:00:00Z", slateDate: "2026-01-21",
      artifactSlateDate: "2026-01-21",
      image: { exists: true, slateDate: "2026-01-21", width: 1200, height: 675 },
    }));
    assert.equal(r.decision, Decision.POST);
  });
});

describe("morning edition requires no lineup confirmation", () => {
  it("posts K with no opposing batting orders at all", () => {
    const r = resolveEditionReadiness(input({ market: "k", selectedLineupStatus: null }));
    assert.equal(r.decision, Decision.POST);
    assert.equal(r.status, ReadinessStatus.READY_TO_POST);
    assert.equal(r.caption, Caption.MORNING_K);
  });

  it("posts HR with zero confirmed batting orders -- the 2026-07-21 case", () => {
    const r = resolveEditionReadiness(input({
      market: "hr",
      selectedLineupStatus: { total: 5, confirmed: 0 },
    }));
    assert.equal(r.decision, Decision.POST);
    assert.equal(r.caption, Caption.MORNING_HR);
  });

  it("never claims lineups are confirmed", () => {
    for (const market of ["k", "hr"]) {
      const r = resolveEditionReadiness(input({ market }));
      assert.equal(r.confirmationComplete, false);
      assert.ok(!/confirmed lineups/i.test(r.caption));
      assert.match(r.caption, /Check final lineups before betting\./);
    }
  });

  it("is not blocked by any 11:00 ET earliest-post floor", () => {
    // 10:00 ET is before the old K_EARLIEST_POST_ET_HOUR = 11 floor.
    assert.equal(resolveEditionReadiness(input({ market: "k" })).decision, Decision.POST);
  });
});

describe("confirmed edition window", () => {
  it("waits earlier than 2h20m out", () => {
    const r = resolveEditionReadiness(confirmed({ now: minsOut(141) }));
    assert.equal(r.decision, Decision.WAIT);
    assert.equal(r.status, ReadinessStatus.NOT_DUE);
  });

  it("opens at exactly 2h20m out, in the preferred stage", () => {
    const r = resolveEditionReadiness(confirmed({ now: minsOut(140), selectedLineupStatus: [{ confirmed: true }] }));
    assert.equal(r.decision, Decision.POST);
    assert.equal(r.stage, Stage.PREFERRED);
  });

  it("switches to the fallback stage below 1h40m out", () => {
    const pref = resolveEditionReadiness(confirmed({ now: minsOut(100), selectedLineupStatus: [{ confirmed: false }] }));
    assert.equal(pref.stage, Stage.PREFERRED);
    const fb = resolveEditionReadiness(confirmed({ now: minsOut(99), selectedLineupStatus: [{ confirmed: false }] }));
    assert.equal(fb.stage, Stage.FALLBACK);
  });

  it("closes at 1h15m out", () => {
    const open = resolveEditionReadiness(confirmed({ now: minsOut(75), selectedLineupStatus: [{ confirmed: false }] }));
    assert.equal(open.decision, Decision.POST);
    const closed = resolveEditionReadiness(confirmed({ now: minsOut(74), selectedLineupStatus: [{ confirmed: false }] }));
    assert.equal(closed.decision, Decision.SKIP);
    assert.equal(closed.status, ReadinessStatus.MISSED_WINDOW);
  });

  it("never publishes once the first game has started", () => {
    const r = resolveEditionReadiness(confirmed({ now: minsOut(-1), selectedLineupStatus: [{ confirmed: true }] }));
    assert.equal(r.decision, Decision.SKIP);
    assert.equal(r.status, ReadinessStatus.FIRST_GAME_STARTED);
  });

  it("skips cleanly with no first game time", () => {
    const r = resolveEditionReadiness(confirmed({ firstGameTime: null }));
    assert.equal(r.status, ReadinessStatus.NO_GAMES);
  });
});

describe("confirmed edition lineup policy", () => {
  it("publishes immediately in the preferred stage when all selections are confirmed", () => {
    const r = resolveEditionReadiness(confirmed({
      now: minsOut(130),
      selectedLineupStatus: [{ confirmed: true }, { confirmed: true }, { confirmed: true }],
    }));
    assert.equal(r.decision, Decision.POST);
    assert.equal(r.status, ReadinessStatus.READY_TO_POST);
    assert.equal(r.confirmationComplete, true);
    assert.equal(r.caption, Caption.CONFIRMED_COMPLETE);
  });

  it("evaluates only the selected recommendations, not the whole slate", () => {
    // 15 games scheduled, only the two selected ones confirmed -- still ready.
    const r = resolveEditionReadiness(confirmed({
      now: minsOut(130), gamesScheduled: 15,
      selectedGames: [824409, 823437],
      selectedLineupStatus: [{ confirmed: true }, { confirmed: true }],
    }));
    assert.equal(r.decision, Decision.POST);
    assert.equal(r.confirmationComplete, true);
  });

  it("waits in the preferred stage when a selection is unconfirmed", () => {
    const r = resolveEditionReadiness(confirmed({
      now: minsOut(130),
      selectedLineupStatus: [{ confirmed: true }, { confirmed: false }],
    }));
    assert.equal(r.decision, Decision.WAIT);
    assert.equal(r.status, ReadinessStatus.WAITING_FOR_SELECTED_LINEUPS);
    assert.equal(r.caption, null);
  });

  it("publishes in the fallback stage despite incomplete confirmation", () => {
    const r = resolveEditionReadiness(confirmed({
      now: minsOut(90),
      selectedLineupStatus: [{ confirmed: true }, { confirmed: false }],
    }));
    assert.equal(r.decision, Decision.POST);
    assert.equal(r.status, ReadinessStatus.READY_TO_FALLBACK_POST);
    assert.equal(r.confirmationComplete, false);
    assert.equal(r.caption, Caption.CONFIRMED_INCOMPLETE);
    assert.ok(r.warnings.includes("SELECTED_LINEUP_CONFIRMATION_INCOMPLETE"));
    assert.deepEqual(r.blockers, []);
  });

  it("publishes in the fallback stage with no confirmation data at all", () => {
    const r = resolveEditionReadiness(confirmed({ now: minsOut(90), selectedLineupStatus: null }));
    assert.equal(r.decision, Decision.POST);
    assert.equal(r.caption, Caption.CONFIRMED_INCOMPLETE);
  });

  it("never says lineups are confirmed unless every selection satisfies the policy", () => {
    for (const status of [null, [{ confirmed: false }], [{ confirmed: true }, { confirmed: false }], { total: 3, confirmed: 2 }]) {
      const r = resolveEditionReadiness(confirmed({ now: minsOut(90), selectedLineupStatus: status }));
      assert.equal(r.confirmationComplete, false);
      assert.notEqual(r.caption, Caption.CONFIRMED_COMPLETE);
      assert.ok(!/confirmed lineups/i.test(r.caption ?? ""));
    }
  });

  it("treats an empty selection as unconfirmed rather than vacuously complete", () => {
    const r = resolveEditionReadiness(confirmed({ now: minsOut(130), selectedLineupStatus: [] }));
    assert.equal(r.decision, Decision.WAIT);
    assert.equal(r.confirmationComplete, false);
  });
});

describe("planner and poster cannot disagree", () => {
  it("returns one verdict driving both shouldRunPoster and shouldPost", () => {
    // The 2026-07-21 split: planner READY, poster WAITING for the opposing
    // lineup. One function now answers both questions from one input.
    const waiting = resolveEditionReadiness(confirmed({
      now: minsOut(130),
      selectedLineupStatus: [{ confirmed: false }],
    }));
    assert.equal(waiting.shouldRunPoster, false);
    assert.equal(waiting.shouldPost, false);

    const ready = resolveEditionReadiness(confirmed({
      now: minsOut(130),
      selectedLineupStatus: [{ confirmed: true }],
    }));
    assert.equal(ready.shouldRunPoster, true);
    assert.equal(ready.shouldPost, true);
  });

  it("is deterministic for identical input", () => {
    const args = confirmed({ now: minsOut(120), selectedLineupStatus: [{ confirmed: true }] });
    assert.deepEqual(resolveEditionReadiness(args), resolveEditionReadiness(args));
  });
});

describe("hard blockers", () => {
  it("blocks prior-slate artifact data", () => {
    const r = resolveEditionReadiness(input({ artifactSlateDate: "2026-07-20" }));
    assert.equal(r.decision, Decision.BLOCKED);
    assert.equal(r.status, ReadinessStatus.INVALID_SLATE);
  });

  it("blocks zero valid picks but allows fewer than three", () => {
    assert.equal(resolveEditionReadiness(input({ validPicks: 0 })).status, ReadinessStatus.NO_VALID_PICKS);
    const two = resolveEditionReadiness(input({ validPicks: 2 }));
    assert.equal(two.decision, Decision.POST);
    assert.ok(two.warnings.includes("FEWER_THAN_THREE_PICKS"));
  });

  it("blocks a missing, wrong-slate, or unusable image", () => {
    assert.equal(resolveEditionReadiness(input({ image: { exists: false } })).status, ReadinessStatus.IMAGE_FAILED);
    assert.equal(
      resolveEditionReadiness(input({ image: { exists: true, slateDate: "2026-07-20", width: 1200, height: 675 } })).status,
      ReadinessStatus.IMAGE_FAILED,
    );
    assert.equal(
      resolveEditionReadiness(input({ image: { exists: true, slateDate: SLATE, width: 0, height: 0 } })).status,
      ReadinessStatus.IMAGE_FAILED,
    );
  });

  it("blocks invalid X configuration only in live mode", () => {
    assert.equal(resolveEditionReadiness(input({ liveMode: true, verifiedAccount: false })).status, ReadinessStatus.CONFIGURATION_ERROR);
    assert.equal(resolveEditionReadiness(input({ liveMode: true, credentialsPresent: false })).status, ReadinessStatus.CONFIGURATION_ERROR);
    assert.equal(resolveEditionReadiness(input({ liveMode: true, allowLivePost: false })).status, ReadinessStatus.CONFIGURATION_ERROR);
    // Dry runs need no credentials.
    assert.equal(
      resolveEditionReadiness(input({ liveMode: false, allowLivePost: false, credentialsPresent: false, verifiedAccount: false })).decision,
      Decision.POST,
    );
  });

  it("skips when no games are scheduled", () => {
    assert.equal(resolveEditionReadiness(input({ gamesScheduled: 0 })).status, ReadinessStatus.NO_GAMES);
  });
});

describe("optional enrichment never eliminates a post", () => {
  it("downgrades non-fresh but current-slate artifact data to a warning", () => {
    const r = resolveEditionReadiness(input({ artifactFreshnessStatus: "stale" }));
    assert.equal(r.decision, Decision.POST);
    assert.ok(r.warnings.includes("ARTIFACT_FRESHNESS_STALE"));
    assert.deepEqual(r.blockers, []);
  });

  it("warns rather than blocks when the image slate date is unknown", () => {
    const r = resolveEditionReadiness(input({ image: { exists: true, width: 1200, height: 675 } }));
    assert.equal(r.decision, Decision.POST);
    assert.ok(r.warnings.includes("IMAGE_SLATE_DATE_UNKNOWN"));
  });
});

describe("edition receipts", () => {
  it("skips an edition already posted", () => {
    const r = resolveEditionReadiness(input({ receipt: { exists: true, outcome: "POSTED", postId: "123" } }));
    assert.equal(r.decision, Decision.SKIP);
    assert.equal(r.status, ReadinessStatus.ALREADY_POSTED);
  });

  it("retries after a non-posting outcome, and after a POSTED record with no id", () => {
    for (const receipt of [
      { exists: true, outcome: "ATTEMPTED", postId: null },
      { exists: true, outcome: "FAILED", postId: null },
      { exists: true, outcome: "RENDERED", postId: null },
      { exists: true, outcome: "POSTED", postId: "  " },
    ]) {
      assert.equal(resolveEditionReadiness(input({ receipt })).decision, Decision.POST);
    }
  });
});

describe("approved contract shape", () => {
  it("returns every documented field", () => {
    const r = resolveEditionReadiness(input());
    for (const key of [
      "decision", "status", "stage", "languageMode", "caption", "confirmationComplete",
      "shouldPost", "shouldRunPoster", "warnings", "blockers", "detail",
      "receiptKey", "nextEligibleAt", "windowClosesAt",
    ]) {
      assert.ok(key in r, `missing field: ${key}`);
    }
  });

  it("carries the edition receipt key on every decision", () => {
    assert.equal(resolveEditionReadiness(input()).receiptKey, "mlb-k-2026-07-21-morning");
    assert.equal(resolveEditionReadiness(confirmed({ market: "hr", now: minsOut(130) })).receiptKey, "mlb-hr-2026-07-21-confirmed");
    // Present even on a blocked decision.
    assert.equal(resolveEditionReadiness(input({ validPicks: 0 })).receiptKey, "mlb-k-2026-07-21-morning");
  });

  it("reports the lifecycle stage", () => {
    assert.equal(resolveEditionReadiness(input({ now: "2026-07-21T13:30:00Z" })).stage, Stage.BEFORE_WINDOW);
    assert.equal(resolveEditionReadiness(input()).stage, Stage.MORNING);
    assert.equal(resolveEditionReadiness(input({ now: "2026-07-21T15:16:00Z" })).stage, Stage.AFTER_WINDOW);
    assert.equal(resolveEditionReadiness(confirmed({ now: minsOut(130), selectedLineupStatus: [{ confirmed: true }] })).stage, Stage.PREFERRED);
    assert.equal(resolveEditionReadiness(confirmed({ now: minsOut(90), selectedLineupStatus: [{ confirmed: false }] })).stage, Stage.FALLBACK);
  });

  it("reports languageMode consistently with the caption", () => {
    assert.equal(resolveEditionReadiness(input()).languageMode, LanguageMode.MORNING);
    assert.equal(resolveEditionReadiness(confirmed({ now: minsOut(130), selectedLineupStatus: [{ confirmed: true }] })).languageMode, LanguageMode.CONFIRMED);
    assert.equal(resolveEditionReadiness(confirmed({ now: minsOut(90), selectedLineupStatus: [{ confirmed: false }] })).languageMode, LanguageMode.PREGAME_FALLBACK);
    // No caption, no language mode.
    assert.equal(resolveEditionReadiness(confirmed({ now: minsOut(130), selectedLineupStatus: [{ confirmed: false }] })).languageMode, null);
  });

  it("reports windowClosesAt and nextEligibleAt", () => {
    const early = resolveEditionReadiness(input({ now: "2026-07-21T13:30:00Z" }));
    assert.equal(early.windowClosesAt, "2026-07-21T15:15:00.000Z"); // 11:15 ET
    assert.equal(early.nextEligibleAt, "2026-07-21T13:45:00.000Z"); // 09:45 ET
    // Waiting on lineups points at the guaranteed fallback publication point.
    const waiting = resolveEditionReadiness(confirmed({ now: minsOut(130), selectedLineupStatus: [{ confirmed: false }] }));
    assert.equal(waiting.nextEligibleAt, new Date(Date.parse("2026-07-21T22:40:00Z") - 100 * 60_000).toISOString());
    assert.equal(waiting.windowClosesAt, new Date(Date.parse("2026-07-21T22:40:00Z") - 75 * 60_000).toISOString());
  });
});
