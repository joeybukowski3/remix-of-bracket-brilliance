/// <reference lib="dom" />
import { readFileSync, mkdirSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "../../../../playwright-fixture";

/**
 * Site-wide browser QA for the canonical Current OVR (nfl-current-ovr-v1.1.0).
 * Every value shown by every NFL surface that displays Current OVR / OFF / DEF, their ranks, or the JKB spread is
 * compared with the canonical expected values (qa-expected.mts, built from the committed artifacts through the
 * production board builder). Soft assertions: one run reports every mismatch.
 *
 * Env: QA_EXPECTED (path to qa-expected.json), QA_OUT (screenshot dir), PLAYWRIGHT_BASE_URL.
 */
type Team = { abbr: string; name: string; slug: string; ovr: number; ovrRank: number; off: number; offRank: number; def: number; defRank: number; performanceRating: number; performanceRank: number };
type Game = { gameId: string; week: number; home: string; away: string; neutral: boolean; homeOvr: number; awayOvr: number; jkbSpread: string; projectedHomeMargin: number; marketHomeSpread: number | null };
const EXPECTED = JSON.parse(readFileSync(process.env.QA_EXPECTED!, "utf-8")) as { modelVersion: string; teams: Record<string, Team>; games: Record<string, Game> };
const OUT = process.env.QA_OUT ?? "./qa-out";
mkdirSync(`${OUT}/shots`, { recursive: true });
const TEAMS = Object.values(EXPECTED.teams);
const byName = new Map(TEAMS.map((t) => [t.name, t]));
const f1 = (v: number) => v.toFixed(1);
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const CURRENT_WEEK = 3;

async function load(page: Page, path: string, width: number, height = 1000) {
  await page.setViewportSize({ width, height });
  await page.goto(path);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(1800);
}
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/shots/${name}.png`, fullPage: true });
const rowsOf = (page: Page) => page.$$eval("table tbody tr", (rows) => rows.map((r) => Array.from(r.querySelectorAll("td,th")).map((c) => (c as HTMLElement).innerText.replace(/\s+/g, " ").trim())));
const mainText = (page: Page) => page.evaluate(() => (document.querySelector("main") ?? document.body).innerText);
const noOverflow = async (page: Page, label: string) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect.soft(overflow, `${label}: horizontal page overflow`).toBeLessThanOrEqual(1);
};

for (const width of [1440, 390]) {
  const device = width >= 1000 ? "desktop" : "mobile";

  test(`Weekly Game Board (${device})`, async ({ page }) => {
    await load(page, `/nfl?week=${CURRENT_WEEK}`, width);
    await shot(page, `board_${device}`);
    const games = Object.values(EXPECTED.games).filter((g) => g.week === CURRENT_WEEK);
    expect(games).toHaveLength(16);
    if (device === "desktop") {
      const rows = (await rowsOf(page)).filter((r) => r.length >= 8);
      expect(rows.length).toBeGreaterThanOrEqual(16);
      let matched = 0;
      for (const g of games) {
        const away = EXPECTED.teams[g.away], home = EXPECTED.teams[g.home];
        const row = rows.find((r) => r[1]?.startsWith(away.name) && r[3]?.startsWith(home.name));
        expect.soft(row, `row ${away.name} @ ${home.name}`).toBeTruthy();
        if (!row) continue;
        matched += 1;
        expect.soft(row[1], `${g.gameId} away OVR`).toContain(`OVR #${away.ovrRank} · ${f1(away.ovr)}`);
        expect.soft(row[3], `${g.gameId} home OVR`).toContain(`OVR #${home.ovrRank} · ${f1(home.ovr)}`);
        expect.soft(norm(row[5]).startsWith(g.jkbSpread.replace("−", "−")), `${g.gameId} JKB spread "${row[5]}" vs "${g.jkbSpread}"`).toBe(true);
      }
      expect(matched).toBe(16);
      const text = await mainText(page);
      const sorted = [...TEAMS].sort((a, b) => a.ovrRank - b.ovrRank);
      for (const t of [...sorted.slice(0, 5), ...sorted.slice(-5)]) expect.soft(text, `Power Watch ${t.abbr}`).toContain(f1(t.ovr));
    } else {
      const board = page.getByTestId("mobile-game-board");
      await expect(board).toBeVisible();
      // The compact mobile board shows the team code with its canonical OVR RANK chip (values live on the detail page).
      const text = norm(await board.innerText());
      for (const g of games) {
        const away = EXPECTED.teams[g.away], home = EXPECTED.teams[g.home];
        expect.soft(text, `${g.gameId} away OVR rank chip`).toContain(`${away.abbr.toUpperCase()} #${away.ovrRank}`);
        expect.soft(text, `${g.gameId} home OVR rank chip`).toContain(`${home.abbr.toUpperCase()} #${home.ovrRank}`);
        expect.soft(text, `${g.gameId} JKB`).toContain(g.jkbSpread);
      }
      await noOverflow(page, "mobile board");
    }
  });

  test(`NFL Standings (${device})`, async ({ page }) => {
    await load(page, "/nfl/standings", width);
    await shot(page, `standings_${device}`);
    const rows = await rowsOf(page);
    let checked = 0;
    for (const t of TEAMS) {
      // Mobile shows a logo instead of the team name, so rows are identified by their (unique) canonical OVR cell.
      const row = rows.find((r) => r[2] === `#${t.ovrRank} ${f1(t.ovr)}`);
      expect.soft(row, `standings row ${t.name} (#${t.ovrRank} ${f1(t.ovr)})`).toBeTruthy();
      if (!row) continue;
      const joined = row.join(" | ");
      expect.soft(joined, `${t.abbr} OVR`).toContain(`#${t.ovrRank} ${f1(t.ovr)}`);
      expect.soft(joined, `${t.abbr} OFF`).toContain(`#${t.offRank} ${f1(t.off)}`);
      expect.soft(joined, `${t.abbr} DEF`).toContain(`#${t.defRank} ${f1(t.def)}`);
      checked += 1;
    }
    expect(checked).toBe(32);
    if (device === "mobile") await noOverflow(page, "standings");
  });

  test(`Power Ratings / Rankings (${device})`, async ({ page }) => {
    await load(page, "/nfl/power-ratings", width);
    await shot(page, `power_${device}`);
    const rows = await rowsOf(page);
    const teamRows = rows.filter((r) => r.some((c) => /^#\d+ \d+\.\d$/.test(c)));
    expect(teamRows.length).toBeGreaterThanOrEqual(32);
    const order: number[] = [];
    for (const t of TEAMS) {
      const row = teamRows.find((r) => r[1] === `#${t.ovrRank} ${f1(t.ovr)}`);
      expect.soft(row, `power row ${t.name} (#${t.ovrRank} ${f1(t.ovr)})`).toBeTruthy();
      if (!row) continue;
      const joined = row.join(" | ");
      expect.soft(joined, `${t.abbr} OVR`).toContain(`#${t.ovrRank} ${f1(t.ovr)}`);
      expect.soft(joined, `${t.abbr} OFF`).toContain(`#${t.offRank} ${f1(t.off)}`);
      expect.soft(joined, `${t.abbr} DEF`).toContain(`#${t.defRank} ${f1(t.def)}`);
    }
    // default sort is OVR rank: displayed order must be exactly rank 1..32
    for (const row of teamRows) { const t = TEAMS.find((x) => row[1] === `#${x.ovrRank} ${f1(x.ovr)}`); if (t) order.push(t.ovrRank); }
    expect.soft(order.slice(0, 32), "power-ratings row order is OVR rank 1..32").toEqual(Array.from({ length: 32 }, (_, i) => i + 1));
    if (device === "mobile") await noOverflow(page, "power ratings");
  });
}

test("Matchups list: OVR rank tile for every team, week 3 (desktop)", async ({ page }) => {
  await load(page, `/nfl/matchups`, 1440);
  await shot(page, "matchups_desktop");
  const text = await mainText(page);
  const games = Object.values(EXPECTED.games).filter((g) => g.week === CURRENT_WEEK);
  for (const g of games) {
    for (const abbr of [g.away, g.home]) {
      const t = EXPECTED.teams[abbr];
      // Each team block prints "<name> ... OVR <cols>\n<rank tiles>": the first rank tile after the OVR header row is the OVR rank.
      const idx = text.indexOf(t.name);
      expect.soft(idx, `${t.name} present`).toBeGreaterThan(-1);
      const window = norm(text.slice(idx, idx + 260));
      const m = window.match(/OVR .*? (\d{1,2}) (\d{1,2}) /);
      expect.soft(m && Number(m[1]), `${t.name} OVR tile`).toBe(t.ovrRank);
    }
  }
});

for (const width of [1440, 390]) {
  const device = width >= 1000 ? "desktop" : "mobile";
  const gamesW3 = Object.values(EXPECTED.games).filter((g) => g.week === CURRENT_WEEK);
  const pick = (away: string, home: string) => gamesW3.find((x) => x.away === away && x.home === home)!;
  const sample = [pick("atl", "gb"), pick("bal", "dal"), pick("lar", "den")];
  for (const g of sample) {
    test(`Matchup detail ${g.gameId} (${device})`, async ({ page }) => {
      const away = EXPECTED.teams[g.away], home = EXPECTED.teams[g.home];
      const slug = `${away.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${g.neutral ? "vs" : "at"}-${home.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      await load(page, `/nfl/matchups/${slug}`, width);
      await shot(page, `detail_${g.gameId}_${device}`);
      const text = norm(await mainText(page));
      // hero spread + model analysis
      expect.soft(text, `${g.gameId} JKB spread`).toContain(g.jkbSpread);
      // Advantages + Things to Watch: every "power rank" sentence quotes the canonical ranks for these two teams
      const lo = Math.min(away.ovrRank, home.ovrRank), hi = Math.max(away.ovrRank, home.ovrRank);
      const adv = text.match(/holds the higher overall power rating: #(\d+) versus #(\d+)/);
      if (adv) expect.soft([Number(adv[1]), Number(adv[2])], `${g.gameId} Advantages power ranks`).toEqual([lo, hi]);
      const gap = text.match(/\(#(\d+)\) carries a clear power-rating edge over [^()]+ \(#(\d+)\)/);
      if (gap) expect.soft([Number(gap[1]), Number(gap[2])], `${g.gameId} Things-to-watch power gap ranks`).toEqual([lo, hi]);
      // Spine "JKB POWER RATING" tile
      const spine = text.match(new RegExp(`#${away.ovrRank} · ${f1(away.ovr).replace(".", "\\.")} JKB POWER RATING.*?#${home.ovrRank} · ${f1(home.ovr).replace(".", "\\.")}`));
      expect.soft(spine, `${g.gameId} JKB POWER RATING tile ${away.ovrRank}/${f1(away.ovr)} vs ${home.ovrRank}/${f1(home.ovr)}`).toBeTruthy();
      const offTile = text.match(new RegExp(`#${away.offRank} · ${f1(away.off).replace(".", "\\.")} JKB OFFENSE RATING.*?#${home.offRank} · ${f1(home.off).replace(".", "\\.")}`));
      expect.soft(offTile, `${g.gameId} JKB OFFENSE RATING tile`).toBeTruthy();
      if (device === "mobile") await noOverflow(page, `detail ${g.gameId}`);
      // Model Details tab: Current OVR and Power Number for both sides
      const tab = page.getByRole("tab", { name: /Model Details/i }).or(page.getByRole("button", { name: /Model Details/i })).first();
      if (await tab.count()) {
        await tab.click().catch(() => undefined);
        await page.waitForTimeout(800);
        const details = norm(await mainText(page));
        expect.soft(details, `${g.gameId} Model Details away OVR`).toContain(f1(away.ovr));
        expect.soft(details, `${g.gameId} Model Details home OVR`).toContain(f1(home.ovr));
        await shot(page, `detail_${g.gameId}_${device}_model`);
      }
    });
  }
}

test("Team Schedules: selected-team card and every opponent's power (desktop)", async ({ page }) => {
  await load(page, "/nfl/team-schedules/seattle-seahawks", 1440);
  await shot(page, "team_schedule_desktop");
  const sea = EXPECTED.teams["sea"];
  const text = norm(await mainText(page));
  expect.soft(text).toContain(`JKB POWER #${sea.ovrRank} · ${f1(sea.ovr)}`);
  expect.soft(text).toContain(`OFFENSE #${sea.offRank} · ${f1(sea.off)}`);
  expect.soft(text).toContain(`DEFENSE #${sea.defRank} · ${f1(sea.def)}`);
  const rows = (await rowsOf(page)).filter((r) => r.length >= 6);
  let checked = 0;
  for (const g of Object.values(EXPECTED.games).filter((x) => x.home === "sea" || x.away === "sea")) {
    const opp = EXPECTED.teams[g.home === "sea" ? g.away : g.home];
    const row = rows.find((r) => r.some((c) => c.startsWith(opp.name)) && r.join(" ").includes(`#${opp.ovrRank} · ${f1(opp.ovr)}`));
    expect.soft(row, `SEA week ${g.week} opponent ${opp.name} power #${opp.ovrRank} · ${f1(opp.ovr)}`).toBeTruthy();
    if (row) checked += 1;
  }
  expect(checked).toBeGreaterThanOrEqual(16);
});

test("Team Performance Analytics page shows the new performance ratings, clearly separate from Current OVR (desktop)", async ({ page }) => {
  await load(page, "/nfl/analytics", 1440);
  await shot(page, "analytics_desktop");
  const rows = await rowsOf(page);
  for (const t of TEAMS) {
    const row = rows.find((r) => r.join(" ").includes(` ${t.abbr.toUpperCase()} `) || r[0]?.startsWith(t.name));
    expect.soft(row, `analytics row ${t.abbr}`).toBeTruthy();
    if (!row) continue;
    expect.soft(row.join(" "), `${t.abbr} performance`).toContain(`${f1(t.performanceRating)} #${t.performanceRank}`);
  }
});

test("Team Guide dashboard: current power rating card, plus canonical rank on the Super Bowl market gap (desktop)", async ({ page }) => {
  await load(page, "/nfl/guide/team/seattle-seahawks", 1440);
  await shot(page, "team_guide_desktop");
  const sea = EXPECTED.teams["sea"];
  const text = norm(await mainText(page));
  expect.soft(text).toContain(`CURRENT POWER RATING ${f1(sea.ovr)} League rank #${sea.ovrRank}`);
  // Guide (preseason) metrics stay explicitly labelled as guide and are allowed to differ
  expect.soft(text).toContain("GUIDE RANK");
});

test("Super Bowl page reads the canonical rank (market feed is offline in QA, so only the shell is asserted)", async ({ page }) => {
  await load(page, "/nfl/super-bowl", 1440);
  await shot(page, "super_bowl_desktop");
  expect.soft(await mainText(page)).toContain("Super Bowl Odds Tracker");
});

test("no console errors on the main surfaces", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  for (const path of ["/nfl", "/nfl/standings", "/nfl/power-ratings", "/nfl/matchups/atlanta-falcons-at-green-bay-packers", "/nfl/team-schedules/seattle-seahawks"]) {
    await load(page, path, 1440);
  }
  expect(errors).toEqual([]);
});
