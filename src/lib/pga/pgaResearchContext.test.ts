import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCrossoverAngles,
  buildMajorSwingWorkload,
  buildPostOpenAngles,
  classifyFedExCupStatus,
  FedExCupBucket,
  MajorSwingWorkloadBucket,
  OpenFinishBucket,
  OpenResultTier,
  ScottishOpenParticipation,
} from "../../../scripts/lib/pga-post-open-angles.mjs";
import {
  buildResearchContext,
  collectSelectedPlayers,
  enforceOddsLanguage,
  validateArticle,
  validateArticleRecommendations,
} from "../../../scripts/generate-pga-best-bets.mjs";

const openRound = (player: string, finishPosition: number | null, status = "finished") => ({
  player,
  eventName: "The Open Championship",
  eventDate: "2026-07-19",
  finishPosition,
  finishText: finishPosition ? `T${finishPosition}` : "MC",
  status,
});

const scottishRound = (player: string, finishPosition: number | null, status = "finished") => ({
  player,
  eventName: "Genesis Scottish Open",
  eventDate: "2026-07-12",
  finishPosition,
  finishText: finishPosition ? `T${finishPosition}` : "MC",
  status,
});

describe("Open finish buckets", () => {
  const bucketFor = (position: number) =>
    buildPostOpenAngles("Test Player", { rounds: [openRound("Test Player", position)] }).openFinishBucket;

  it("splits 21-30 and 31-40 while the legacy T21_40 contract is preserved", () => {
    expect(bucketFor(25)).toBe(OpenFinishBucket.T21_30);
    expect(bucketFor(35)).toBe(OpenFinishBucket.T31_40);
    // Legacy consumers still see the merged tier for both.
    const legacy25 = buildPostOpenAngles("Test Player", { rounds: [openRound("Test Player", 25)] }).openResult;
    const legacy35 = buildPostOpenAngles("Test Player", { rounds: [openRound("Test Player", 35)] }).openResult;
    expect(legacy25).toBe(OpenResultTier.T21_40);
    expect(legacy35).toBe(OpenResultTier.T21_40);
  });

  it("covers every precise bucket boundary", () => {
    expect(bucketFor(1)).toBe(OpenFinishBucket.TOP_5);
    expect(bucketFor(5)).toBe(OpenFinishBucket.TOP_5);
    expect(bucketFor(6)).toBe(OpenFinishBucket.TOP_10);
    expect(bucketFor(11)).toBe(OpenFinishBucket.T11_20);
    expect(bucketFor(21)).toBe(OpenFinishBucket.T21_30);
    expect(bucketFor(31)).toBe(OpenFinishBucket.T31_40);
    expect(bucketFor(41)).toBe(OpenFinishBucket.T41_PLUS);
    expect(buildPostOpenAngles("P", { rounds: [openRound("P", null, "missed_cut")] }).openFinishBucket)
      .toBe(OpenFinishBucket.MISSED_CUT);
    expect(buildPostOpenAngles("P", { rounds: [] }).openFinishBucket).toBe(OpenFinishBucket.DID_NOT_PLAY);
  });
});

describe("Scottish Open persistence", () => {
  it("persists finish position, text, status and rounds played", () => {
    const angles = buildPostOpenAngles("P", {
      rounds: [scottishRound("P", 12), scottishRound("P", 12), scottishRound("P", 12), scottishRound("P", 12)],
    });
    expect(angles.scottish).toEqual({
      participation: ScottishOpenParticipation.PLAYED_MADE_CUT,
      finishPosition: 12,
      finishText: "T12",
      status: "finished",
      roundsPlayed: 4,
    });
  });

  it("uses null for unavailable values rather than inferring them", () => {
    const skipped = buildPostOpenAngles("P", { rounds: [] }).scottish;
    expect(skipped.participation).toBe(ScottishOpenParticipation.SKIPPED);
    expect(skipped.finishPosition).toBeNull();
    expect(skipped.finishText).toBeNull();
    expect(skipped.roundsPlayed).toBe(0);

    const missedCut = buildPostOpenAngles("P", {
      rounds: [scottishRound("P", null, "missed_cut"), scottishRound("P", null, "missed_cut")],
    }).scottish;
    expect(missedCut.participation).toBe(ScottishOpenParticipation.PLAYED_MISSED_CUT);
    expect(missedCut.finishPosition).toBeNull();
    expect(missedCut.roundsPlayed).toBe(2);
  });
});

describe("majorSwingWorkload", () => {
  it("buckets the canonical round counts", () => {
    expect(buildMajorSwingWorkload(8).bucket).toBe(MajorSwingWorkloadBucket.EIGHT_ROUNDS);
    expect(buildMajorSwingWorkload(6).bucket).toBe(MajorSwingWorkloadBucket.SIX_ROUNDS);
    expect(buildMajorSwingWorkload(4).bucket).toBe(MajorSwingWorkloadBucket.FOUR_ROUNDS);
    expect(buildMajorSwingWorkload(2).bucket).toBe(MajorSwingWorkloadBucket.TWO_ROUNDS);
    expect(buildMajorSwingWorkload(0).bucket).toBe(MajorSwingWorkloadBucket.NO_TRACKED_ROUNDS);
  });

  it("uses OTHER_TRACKED_ROUNDS for unusual counts", () => {
    for (const count of [1, 3, 5, 7, 9]) {
      expect(buildMajorSwingWorkload(count).bucket).toBe(MajorSwingWorkloadBucket.OTHER_TRACKED_ROUNDS);
    }
  });

  it("uses UNKNOWN when identity matching or source validity is insufficient", () => {
    const unknown = buildMajorSwingWorkload(4, { identityResolved: false });
    expect(unknown.bucket).toBe(MajorSwingWorkloadBucket.UNKNOWN);
    expect(unknown.rounds).toBeNull();
    expect(buildMajorSwingWorkload(Number.NaN).bucket).toBe(MajorSwingWorkloadBucket.UNKNOWN);
  });

  it("records honest scope, coverage and tracked events -- never a generic two-week claim", () => {
    const workload = buildMajorSwingWorkload(0, { windowStart: "2026-07-09", windowEnd: "2026-07-23" });
    expect(workload.scope).toBe("open_and_scottish_only");
    expect(workload.coverage).toBe("partial");
    expect(workload.windowStart).toBe("2026-07-09");
    expect(workload.windowEnd).toBe("2026-07-23");
    expect(workload.trackedEvents).toEqual(["The Open Championship", "Genesis Scottish Open"]);
    // Zero must never be presented as rest.
    expect(workload.bucket).toBe(MajorSwingWorkloadBucket.NO_TRACKED_ROUNDS);
    expect(JSON.stringify(workload)).not.toMatch(/rested|fresh/i);
  });

  it("preserves the legacy workloadRoundCount alongside the structured field", () => {
    const angles = buildPostOpenAngles("P", {
      rounds: [openRound("P", 10), openRound("P", 10), scottishRound("P", 5), scottishRound("P", 5)],
    });
    expect(angles.workloadRoundCount).toBe(4);
    expect(angles.majorSwingWorkload.rounds).toBe(4);
    expect(angles.majorSwingWorkload.bucket).toBe(MajorSwingWorkloadBucket.FOUR_ROUNDS);
  });
});

describe("FedExCup buckets", () => {
  const rows = [
    { player: "Safe Edge", rank: 50, points: 100 },
    { player: "Bubble Low", rank: 51, points: 90 },
    { player: "Bubble High", rank: 80, points: 80 },
    { player: "Chasing", rank: 81, points: 70 },
  ];

  it("classifies exactly at the 50/51/80/81 boundaries", () => {
    expect(classifyFedExCupStatus(rows, "Safe Edge").bucket).toBe(FedExCupBucket.SAFE_TOP_50);
    expect(classifyFedExCupStatus(rows, "Bubble Low").bucket).toBe(FedExCupBucket.BUBBLE_51_80);
    expect(classifyFedExCupStatus(rows, "Bubble High").bucket).toBe(FedExCupBucket.BUBBLE_51_80);
    expect(classifyFedExCupStatus(rows, "Chasing").bucket).toBe(FedExCupBucket.CHASING_81_PLUS);
  });

  it("persists rank and points, and reports UNRANKED without inventing a rank", () => {
    expect(classifyFedExCupStatus(rows, "Safe Edge")).toMatchObject({ rank: 50, points: 100 });
    const unranked = classifyFedExCupStatus(rows, "Nobody");
    expect(unranked.bucket).toBe(FedExCupBucket.UNRANKED);
    expect(unranked.rank).toBeNull();
    expect(unranked.points).toBeNull();
  });
});

describe("selected-player union and research context scope", () => {
  const pick = (player: string) => ({ player, tournamentRank: 1, powerRank: 1, topStats: [], bullets: ["b"], odds: null });

  it("collects the unique union across all four markets", () => {
    const players = collectSelectedPlayers({
      outrights: [pick("Alpha"), pick("Bravo")],
      top5: [pick("Bravo"), pick("Charlie")],
      top10: [pick("Delta")],
      top20: [pick("Alpha"), pick("Echo")],
    });
    expect(players).toEqual(["Alpha", "Bravo", "Charlie", "Delta", "Echo"]);
  });

  it("builds context for selected players outside the top 25 and skips unselected top-25 rows", () => {
    const modelRows = [
      { player: "Unselected Star", rank: 1, modelScore: "90" },
      { player: "Deep Pick", rank: 40, modelScore: "60" },
    ];
    const context = buildResearchContext(["Deep Pick"], { modelRows });
    expect(Object.keys(context)).toHaveLength(1);
    expect(context["deep pick"].model.tournamentRank).toBe(40);
    expect(context["unselected star"]).toBeUndefined();
  });
});

describe("crossover angles", () => {
  it("constructs supported crossover groups deterministically", () => {
    const angles = buildCrossoverAngles({
      openFinishBucket: OpenFinishBucket.T11_20,
      scottish: { participation: ScottishOpenParticipation.PLAYED_MADE_CUT },
      majorSwingWorkload: { bucket: MajorSwingWorkloadBucket.EIGHT_ROUNDS },
      fedex: { bucket: FedExCupBucket.BUBBLE_51_80 },
      model: { tournamentRank: 5, powerRank: 6 },
    });
    const ids = angles.map((a) => a.id);
    expect(ids).toContain("strong_open_bubble_top_model");
    expect(ids).toContain("heavy_workload_motivated");
  });

  it("creates no unsupported crossover group and never forces one", () => {
    expect(buildCrossoverAngles({
      openFinishBucket: OpenFinishBucket.DID_NOT_PLAY,
      scottish: { participation: ScottishOpenParticipation.PLAYED_MADE_CUT },
      majorSwingWorkload: { bucket: MajorSwingWorkloadBucket.UNKNOWN },
      fedex: { bucket: FedExCupBucket.UNRANKED },
      model: { tournamentRank: 60, powerRank: 61 },
    })).toEqual([]);
    expect(buildCrossoverAngles(null)).toEqual([]);
    expect(buildCrossoverAngles({})).toEqual([]);
  });
});

describe("odds-null language restriction", () => {
  const unpriced = {
    player: "Jake Knapp",
    odds: null,
    risk: "Putting variance.",
    bullets: ["price looks like value relative to tournamentRank 2", "Ranks first in SG total at 2.002."],
  };

  it("strips price-value language from unpriced picks", () => {
    const [result] = enforceOddsLanguage([unpriced], "outrights");
    expect(result.bullets).toEqual(["Ranks first in SG total at 2.002."]);
    expect(result.bullets.join(" ")).not.toMatch(/price|market value|mispric/i);
  });

  it("substitutes one truthful line rather than leaving a pick with no case", () => {
    const [result] = enforceOddsLanguage([{ ...unpriced, bullets: ["the price looks like value"] }], "outrights");
    expect(result.bullets).toHaveLength(1);
    expect(result.bullets[0]).toMatch(/no market price was available/i);
  });

  it("leaves priced picks free to discuss market value", () => {
    const priced = { ...unpriced, odds: { outright: "+2500" } };
    const [result] = enforceOddsLanguage([priced], "outrights");
    expect(result.bullets).toEqual(priced.bullets);
    expect(result.bullets[0]).toMatch(/price looks like value/i);
  });

  it("resolves per-market odds so a market-priced pick keeps its language", () => {
    const top10Priced = { ...unpriced, odds: { top10: "-120" } };
    expect(enforceOddsLanguage([top10Priced], "top10")[0].bullets).toEqual(unpriced.bullets);
    // Same pick has no top20 price, so top20 language is restricted.
    expect(enforceOddsLanguage([top10Priced], "top20")[0].bullets).not.toContain(unpriced.bullets[0]);
  });
});

describe("article validation", () => {
  const base = {
    title: "T", introduction: "I", conclusion: "C",
    sections: [{ heading: "A", body: "a" }, { heading: "B", body: "b" }, { heading: "C", body: "c" }],
  };

  it("remains backward compatible with legacy articles lacking the new fields", () => {
    const result = validateArticle(base);
    expect(result).not.toBeNull();
    expect(result.keyTakeaways).toEqual([]);
    expect(result.playersToApproachCautiously).toEqual([]);
  });

  it("validates keyTakeaways and playersToApproachCautiously when present", () => {
    const result = validateArticle({
      ...base,
      keyTakeaways: [{ text: "Knapp leads.", players: ["Jake Knapp"] }, { text: "", players: [] }],
      playersToApproachCautiously: [{ player: "Rasmus Højgaard", reason: "Heavy workload." }, { player: "X", reason: "" }],
    });
    expect(result.keyTakeaways).toEqual([{ text: "Knapp leads.", players: ["Jake Knapp"] }]);
    expect(result.playersToApproachCautiously).toEqual([{ player: "Rasmus Højgaard", reason: "Heavy workload." }]);
  });

  it("rejects recommendations naming unselected players", () => {
    const article = validateArticle({ ...base, keyTakeaways: [{ text: "Back Outsider.", players: ["Outsider"] }] });
    const { valid, violations } = validateArticleRecommendations(article, { selectedPlayers: ["Jake Knapp"] });
    expect(valid).toBe(false);
    expect(violations[0]).toMatch(/unselected player: Outsider/);
  });

  it("accepts recommendations confined to the frozen selection", () => {
    const article = validateArticle({ ...base, keyTakeaways: [{ text: "Back Knapp.", players: ["Jake Knapp"] }] });
    expect(validateArticleRecommendations(article, { selectedPlayers: ["Jake Knapp"] }).valid).toBe(true);
  });
});

describe("generator end-to-end (dry run, stored fixture)", () => {
  it("includes top5 in article inputs, persists context, and leaves production data untouched", () => {
    const repoRoot = process.cwd();
    const productionArtifact = path.join(repoRoot, "public", "data", "pga", "best-bets.json");
    const hashBefore = createHash("sha256").update(readFileSync(productionArtifact)).digest("hex");

    const root = mkdtempSync(path.join(tmpdir(), "pga-research-"));
    const dataDir = path.join(root, "public", "data", "pga");
    mkdirSync(dataDir, { recursive: true });
    const writeJson = (name: string, value: unknown) => writeFileSync(path.join(dataDir, name), JSON.stringify(value));

    const players = ["Alpha One", "Bravo Two", "Charlie Three", "Delta Four"];
    writeJson("current-field.json", {
      tournament: "Test Open", tournamentId: "R1", validated: true,
      source: "pga-tour-official-field", alternatesExcluded: true,
      players, startDate: "2026-07-23",
    });
    writeJson("current-tournament.json", {
      tournamentName: "Test Open", tournamentId: "R1", courseName: "Test CC",
      rows: players.map((player, i) => ({ player, rank: i + 1, modelScore: "80", sgTotal: "1.5", sgApp: "0.5" })),
    });
    writeJson("next-tournament.json", { tournamentName: "Other", rows: [] });
    writeJson("power-rankings.json", { rows: players.map((player, i) => ({ player, rank: i + 20 })) });
    writeJson("player-stats-raw.json", []);
    writeJson("course-weights.json", []);
    writeJson("round-history-pga.json", {
      rounds: [
        openRound("Alpha One", 3), openRound("Alpha One", 3),
        scottishRound("Bravo Two", null, "missed_cut"),
      ],
    });
    writeJson("fedex-standings.json", { rows: [{ player: "Alpha One", rank: 12, points: 900 }] });

    const mkPick = (player: string) => ({
      player, tournamentRank: 1, powerRank: 21,
      topStats: ["SG Total=1.5", "SG APP=0.5"], bullets: ["Strong approach play."],
      risk: "Variance.", angles: [],
    });
    const fixturePath = path.join(root, "fixture.json");
    writeFileSync(fixturePath, JSON.stringify({
      "combined-picks-1": { outrights: [mkPick("Alpha One")], top5: [mkPick("Charlie Three")] },
      "combined-picks-2": { top10: [mkPick("Bravo Two")], top20: [mkPick("Delta Four")] },
    }));

    try {
      execFileSync(process.execPath, [
        path.resolve(repoRoot, "scripts/generate-pga-best-bets.mjs"),
        "--dry-run", `--fixture=${fixturePath}`,
      ], { cwd: root, env: { ...process.env, GROK_API_KEY: "test-key", ODDS_API_KEY: "" } });

      const artifactsDir = path.join(root, "artifacts", "pga-best-bets");
      const payload = JSON.parse(readFileSync(path.join(artifactsDir, "dry-run-payload.json"), "utf8"));
      const prompts = JSON.parse(readFileSync(path.join(artifactsDir, "dry-run-prompts.json"), "utf8"));
      const articlePrompt = prompts.find((p: { label: string }) => p.label === "article")?.prompt ?? "";

      // Top-5 is part of the frozen selection handed to the article.
      expect(articlePrompt).toContain("Top-5 targets: Charlie Three");
      // Research classifications reach the prompt.
      expect(articlePrompt).toContain("openFinish=TOP_5");
      expect(articlePrompt).toContain("majorSwingWorkload=");
      expect(articlePrompt).toContain("fedex=SAFE_TOP_50 rank #12");
      // A player absent from the standings is reported UNRANKED, never guessed.
      expect(articlePrompt).toContain("fedex=UNRANKED");
      expect(articlePrompt).toMatch(/contextual research factors/i);
      // With no odds anywhere, price-value language is forbidden outright.
      expect(articlePrompt).toMatch(/NO market prices are available/);

      // Context covers the union of all four markets.
      expect(payload.selectedPlayers.sort()).toEqual([...players].sort());
      expect(Object.keys(payload.researchContext)).toHaveLength(4);
      expect(payload.researchContext["alpha one"].majorSwingWorkload.bucket).toBe(MajorSwingWorkloadBucket.TWO_ROUNDS);
      expect(payload.researchContext["delta four"].majorSwingWorkload.bucket).toBe(MajorSwingWorkloadBucket.NO_TRACKED_ROUNDS);
      expect(payload.dataLimitations.join(" ")).toMatch(/does not necessarily mean the player rested/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }

    // The production artifact must be byte-identical after the run.
    expect(createHash("sha256").update(readFileSync(productionArtifact)).digest("hex")).toBe(hashBefore);
  });
});
