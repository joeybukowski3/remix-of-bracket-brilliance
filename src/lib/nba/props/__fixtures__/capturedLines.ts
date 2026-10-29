/**
 * Invented odds captures for the private-board tests. The provider payload is made up and goes through the real Odds API
 * normalizer and the real capture builder; nothing here touches the network, a credential or a real player.
 *
 * Fixture game: BOS at NYK, tipoff 2026-10-24T23:30Z (the v1 fixture slate). A capture at 20:30Z is 180 minutes before tipoff,
 * inside the pipeline's 45-240 minute window; the board is built at 21:00Z, after the capture and before tipoff.
 */
import { parsePlayerGameImport } from "../v1/playerGameImport";
import { buildEstimateSet } from "../v1/positionEstimates";
import { buildPrivatePreviewBoard } from "../v1/privatePreview";
import { buildV1Inputs, parseSlate } from "../v1/slateBuild";
import { FIXTURE_TIPOFF, fixtureImportFile, fixturePositionsFile, fixtureSlateFile } from "./v1Fixtures";
import type { Market, OddsSourceId } from "../pipeline/contracts";
import { buildLineCapture, type NbaLineCapture } from "../pipeline/lineCapture";
import { parseTheOddsApiNbaEvent } from "../pipeline/theOddsApiNba";

export const BUILD_AT = "2026-10-24T21:00:00Z";
export const CAPTURED_AT = "2026-10-24T20:30:00Z";
export const FRESH = "2026-10-24T20:20:00Z";
export const EVENT_ID = "evt-synthetic-bos-nyk";

/** The v1 fixture league projected for the fixture game at BUILD_AT, labelled hoopR/ESPN (private research only). */
export const privateInputs = buildV1Inputs({
  generatedAtUtc: BUILD_AT,
  imported: parsePlayerGameImport(fixtureImportFile({ sourceId: "hoopr-espn" })),
  positions: buildEstimateSet([fixturePositionsFile("2025-26"), fixturePositionsFile("2026-27")]),
  slate: parseSlate(fixtureSlateFile()),
});

export const boardWith = (captures: readonly NbaLineCapture[]) =>
  buildPrivatePreviewBoard({ generatedAtUtc: BUILD_AT, projections: privateInputs.projections, roster: privateInputs.roster, dvp: privateInputs.dvp, captures });

export interface Prop { player: string; point: number; over?: number; under?: number }

export const marketBlock = (key: string, props: readonly Prop[], lastUpdate: string | null) => ({
  key,
  ...(lastUpdate ? { last_update: lastUpdate } : {}),
  outcomes: props.flatMap((p) => [
    { name: "Over", description: p.player, price: p.over ?? -110, point: p.point },
    { name: "Under", description: p.player, price: p.under ?? -110, point: p.point },
  ]),
});

export const book = (key: string, props: readonly Prop[], lastUpdate: string | null = FRESH, marketKey = "player_points") => ({ key, title: key, markets: [marketBlock(marketKey, props, lastUpdate)] });

export const captureOf = (bookmakers: readonly unknown[], over: { capturedAtUtc?: string; commence?: string; eventId?: string; markets?: readonly Market[]; home?: string; away?: string; sourceId?: OddsSourceId } = {}): NbaLineCapture => {
  const eventId = over.eventId ?? EVENT_ID;
  const parsed = parseTheOddsApiNbaEvent({ id: eventId, sport_key: "basketball_nba", commence_time: over.commence ?? FIXTURE_TIPOFF, home_team: over.home ?? "New York Knicks", away_team: over.away ?? "Boston Celtics", bookmakers }, over.markets ?? ["pts"], eventId);
  return buildLineCapture({
    sourceId: over.sourceId ?? "the-odds-api",
    capturedAtUtc: over.capturedAtUtc ?? CAPTURED_AT,
    approvalId: "nba-odds-synthetic-0001",
    requestRef: `basketball_nba/events/${eventId}/odds`,
    creditsCharged: 1,
    event: { sourceEventId: parsed.event.id, commenceTimeUtc: parsed.event.commenceTimeUtc, homeTeamName: parsed.event.homeTeam, awayTeamName: parsed.event.awayTeam },
    lines: parsed.lines,
    unmatched: parsed.unmatched,
    usageIssue: null,
  });
};
