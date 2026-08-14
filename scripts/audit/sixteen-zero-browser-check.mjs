import { writeFile } from "node:fs/promises";
import { chromium, firefox, webkit } from "@playwright/test";
import { createAnalyticsBlockingContext } from "../lib/playwright-analytics-blocking.mjs";

const baseUrl = process.env.SIXTEEN_ZERO_BASE_URL || "http://127.0.0.1:4173";
const outputDirectory = "docs/pr-screenshots";
const validations = [];
const browserSmokes = [];

async function pageMetrics(page, phase) {
  return page.evaluate((currentPhase) => ({
    phase: currentPhase,
    width: window.innerWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    hasHorizontalOverflow:
      document.documentElement.scrollWidth > window.innerWidth ||
      document.body.scrollWidth > window.innerWidth,
  }), phase);
}

async function completeRun(browser, config) {
  const context = await createAnalyticsBlockingContext(browser, {
    viewport: config.viewport,
    reducedMotion: config.reducedMotion,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const apiRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/sixteen-zero")) {
      apiRequests.push(`${request.method()} ${url.pathname}`);
    }
  });

  await page.goto(`${baseUrl}/16-0`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { level: 1, name: "16-0" }).waitFor();
  const landingMetrics = await pageMetrics(page, "landing");
  await page.screenshot({
    path: `${outputDirectory}/16-0-${config.name}-landing.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Start Draft" }).click();
  await page
    .getByRole("heading", { level: 1, name: "Pick your draft position" })
    .waitFor();
  await page.getByText("Random draft position").click();
  await page
    .getByRole("button", { name: /Start Draft from Slot/ })
    .click();

  let firstDraftMetrics;
  let mobileTapTarget = null;
  let mobileRosterDrawer = null;
  let firstSimulationId = null;
  let rosterRequirementsText = "";
  let forcedPositionObserved = false;
  let forcedRequirementText = "";
  let finalRoundsNoteText = "";
  let specialistWarningText = "";
  for (let userPick = 0; userPick < 17; userPick += 1) {
    const button = page
      .getByRole("button", { name: "Draft", exact: true })
      .and(page.locator(":visible:not([disabled])"))
      .first();
    await button.waitFor({ state: "visible", timeout: 45_000 });
    if (userPick === 15) {
      const finalRoundsNote = page.locator("[data-final-rounds-note]:visible");
      await finalRoundsNote.waitFor();
      finalRoundsNoteText = (await finalRoundsNote.innerText()) ?? "";
      await page.screenshot({
        path: `${outputDirectory}/16-0-${config.name}-final-rounds.png`,
        fullPage: true,
      });
    }
    if (userPick === 0) {
      firstSimulationId = await page
        .locator("[data-simulation-id]")
        .getAttribute("data-simulation-id");
      firstDraftMetrics = await pageMetrics(page, "draft");
      const box = await button.boundingBox();
      mobileTapTarget = box ? { width: box.width, height: box.height } : null;
      await page.screenshot({
        path: `${outputDirectory}/16-0-${config.name}-draft.png`,
        fullPage: true,
      });
      if (config.name === "mobile") {
        await page.getByRole("button", { name: /Roster \d+\/17/ }).click();
        const rosterDialog = page.getByRole("dialog");
        await rosterDialog.waitFor();
        await page.waitForTimeout(600);
        mobileRosterDrawer = await rosterDialog.boundingBox();
        rosterRequirementsText =
          (await rosterDialog.locator("[data-roster-requirements]").innerText()) ?? "";
        await page.screenshot({
          path: `${outputDirectory}/16-0-mobile-roster.png`,
          fullPage: true,
        });
        await page.keyboard.press("Escape");
      } else {
        rosterRequirementsText =
          (await page
            .locator("[data-roster-requirements]:visible")
            .first()
            .innerText()) ?? "";
      }
    }
    const forcedRequirement = page.locator("[data-roster-forced]");
    if (!forcedPositionObserved && (await forcedRequirement.count()) > 0) {
      forcedPositionObserved = true;
      forcedRequirementText =
        (await forcedRequirement.first().innerText()) ?? "";
      if (config.name === "mobile") {
        await page.getByRole("button", { name: /Roster \d+\/17/ }).click();
        await page.getByRole("dialog").waitFor();
        await page.waitForTimeout(600);
        await page.screenshot({
          path: `${outputDirectory}/16-0-mobile-forced-roster.png`,
          fullPage: true,
        });
        await page.keyboard.press("Escape");
      } else {
        await page.screenshot({
          path: `${outputDirectory}/16-0-desktop-forced-draft.png`,
          fullPage: true,
        });
      }
    }
    const specialistWarning = page.locator(
      "[data-starting-specialist-warning]:visible",
    );
    if (!specialistWarningText && (await specialistWarning.count()) > 0) {
      specialistWarningText = (await specialistWarning.first().innerText()) ?? "";
      await page.screenshot({
        path: `${outputDirectory}/16-0-${config.name}-specialist-warning.png`,
        fullPage: true,
      });
    }
    await button.click();
  }

  await page
    .getByRole("heading", { name: /The road to 14-0|Fantasy playoffs/ })
    .waitFor({ timeout: 30_000 });
  await page.waitForTimeout(500);
  const seasonMetrics = await pageMetrics(page, "season");
  await page.screenshot({
    path: `${outputDirectory}/16-0-${config.name}-season.png`,
    fullPage: true,
  });

  await page.getByRole("button", { name: "Draft Again" }).waitFor({ timeout: 60_000 });
  const resultMetrics = await pageMetrics(page, "result");
  const resultHeading = (await page.locator("h1").first().textContent())?.trim() ?? "";
  const resultSummary = await page.locator("main").innerText();
  await page.screenshot({
    path: `${outputDirectory}/16-0-${config.name}-result.png`,
    fullPage: true,
  });
  const completedResultUrl = page.url();

  await page.getByRole("button", { name: "Draft Again" }).click();
  await page
    .getByRole("heading", { level: 1, name: "Pick your draft position" })
    .waitFor();
  await page.getByText("Random draft position").click();
  await page.getByRole("button", { name: /Start Draft from Slot/ }).click();
  const replayDraftButton = page
    .getByRole("button", { name: "Draft", exact: true })
    .and(page.locator(":visible:not([disabled])"))
    .first();
  await replayDraftButton.waitFor({ state: "visible", timeout: 45_000 });
  const replaySimulationId = await page
    .locator("[data-simulation-id]")
    .getAttribute("data-simulation-id");

  const storageKeys = await page.evaluate(() => ({
    local: Object.keys(localStorage).filter((key) => /16.?zero/i.test(key)),
    session: Object.keys(sessionStorage).filter((key) => /16.?zero/i.test(key)),
  }));

  const validation = {
    viewport: config,
    firstSimulationId,
    replaySimulationId,
    replayCreatedNewRun:
      Boolean(firstSimulationId) &&
      Boolean(replaySimulationId) &&
      firstSimulationId !== replaySimulationId,
    completedResultUrl,
    resultHeading,
    resultHasSeasonSummary:
      resultSummary.includes("Season summary") &&
      resultSummary.includes("Regular season") &&
      resultSummary.includes("Average weekly score") &&
      resultSummary.includes("Starting roster"),
    metrics: [landingMetrics, firstDraftMetrics, seasonMetrics, resultMetrics],
    mobileTapTarget,
    mobileRosterDrawer,
    rosterRequirementsText,
    forcedPositionObserved,
    forcedRequirementText,
    finalRoundsNoteText,
    specialistWarningText,
    consoleErrors,
    pageErrors,
    sixteenZeroApiRequests: apiRequests,
    storageKeys,
  };
  validations.push(validation);
  await context.close();
}

async function smokeBrowser(browserType, name) {
  const smoke = {
    name,
    launched: false,
    routeLoaded: false,
    draftStarted: false,
    consoleErrors: [],
    pageErrors: [],
    sixteenZeroApiRequests: [],
    error: null,
  };
  let browser;
  try {
    browser = await browserType.launch();
    smoke.launched = true;
    const context = await createAnalyticsBlockingContext(browser, {
      viewport: { width: 1280, height: 800 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") smoke.consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => smoke.pageErrors.push(error.message));
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith("/api/sixteen-zero")) {
        smoke.sixteenZeroApiRequests.push(`${request.method()} ${url.pathname}`);
      }
    });
    await page.goto(`${baseUrl}/16-0`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "16-0" }).waitFor();
    smoke.routeLoaded = true;
    await page.getByRole("button", { name: "Start Draft" }).click();
    await page
      .getByRole("heading", { level: 1, name: "Pick your draft position" })
      .waitFor();
    await page.getByText("Random draft position").click();
    await page.getByRole("button", { name: /Start Draft from Slot/ }).click();
    await page
      .getByRole("button", { name: "Draft", exact: true })
      .and(page.locator(":visible:not([disabled])"))
      .first()
      .waitFor({ state: "visible", timeout: 45_000 });
    smoke.draftStarted = true;
    await context.close();
  } catch (error) {
    smoke.error = error instanceof Error ? error.message : String(error);
  } finally {
    await browser?.close();
    browserSmokes.push(smoke);
  }
}

const browser = await chromium.launch();
try {
  await completeRun(browser, {
    name: "desktop",
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "no-preference",
  });
  await completeRun(browser, {
    name: "mobile",
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
} finally {
  await browser.close();
}

await smokeBrowser(firefox, "firefox");
await smokeBrowser(webkit, "webkit");

const failures = [];
for (const validation of validations) {
  if (!validation.replayCreatedNewRun) failures.push(`${validation.viewport.name}: replay reused run ID`);
  if (!validation.resultHasSeasonSummary) failures.push(`${validation.viewport.name}: incomplete result summary`);
  if (validation.metrics.some((metric) => metric?.hasHorizontalOverflow)) {
    failures.push(`${validation.viewport.name}: horizontal overflow`);
  }
  if (validation.viewport.name === "mobile" && (validation.mobileTapTarget?.height ?? 0) < 40) {
    failures.push("mobile: draft action tap target is under 40px");
  }
  if (
    validation.viewport.name === "mobile" &&
    ((validation.mobileRosterDrawer?.width ?? 0) < 300 ||
      (validation.mobileRosterDrawer?.x ?? Number.POSITIVE_INFINITY) > 45)
  ) {
    failures.push("mobile: roster drawer is not fully visible");
  }
  if (
    !/K[\s\S]{0,20}0\s*\/\s*2/.test(validation.rosterRequirementsText) ||
    !/DST[\s\S]{0,20}0\s*\/\s*2/.test(validation.rosterRequirementsText)
  ) {
    failures.push(`${validation.viewport.name}: two-K/two-DST requirements are not visible`);
  }
  if (!validation.forcedPositionObserved) {
    failures.push(`${validation.viewport.name}: forced roster completion was not observed`);
  }
  const expectedFinalRoundsNote =
    validation.viewport.name === "mobile"
      ? "Final 2 picks: Backup K + DST. Check bye weeks."
      : "Final two rounds: Draft one backup kicker and one backup defense. Check their bye weeks so your starters have coverage.";
  if (validation.finalRoundsNoteText !== expectedFinalRoundsNote) {
    failures.push(`${validation.viewport.name}: Round 16 instruction was not readable`);
  }
  if (
    !validation.specialistWarningText.includes(
      "Starting K + DST still needed.",
    )
  ) {
    failures.push(
      `${validation.viewport.name}: late starting-specialist warning was not observed`,
    );
  }
  if (validation.consoleErrors.length) failures.push(`${validation.viewport.name}: console errors`);
  if (validation.pageErrors.length) failures.push(`${validation.viewport.name}: page errors`);
  if (validation.sixteenZeroApiRequests.length) failures.push(`${validation.viewport.name}: API request detected`);
  if (validation.storageKeys.local.length || validation.storageKeys.session.length) {
    failures.push(`${validation.viewport.name}: persistence storage key detected`);
  }
}
for (const smoke of browserSmokes) {
  if (!smoke.launched || !smoke.routeLoaded || !smoke.draftStarted) {
    failures.push(`${smoke.name}: route/draft smoke did not complete`);
  }
  if (smoke.consoleErrors.length) failures.push(`${smoke.name}: console errors`);
  if (smoke.pageErrors.length) failures.push(`${smoke.name}: page errors`);
  if (smoke.sixteenZeroApiRequests.length) {
    failures.push(`${smoke.name}: API request detected`);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  validations,
  browserSmokes,
  failures,
  passed: failures.length === 0,
};
await writeFile(
  "docs/16-0-browser-validation.json",
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exitCode = 1;
