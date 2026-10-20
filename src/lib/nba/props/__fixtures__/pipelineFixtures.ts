/**
 * Synthetic fixtures and mock providers for the research-pipeline tests.
 * Invented players, lines and results only; nothing here touches a provider.
 */
import { canonicalGameKey, etGameDate } from "../canonical";
import { QuotaManager } from "../../../api-quota/manager";
import { MemoryUsageStore } from "../../../api-quota/store";
import { clock, sequentialIds, testAccount } from "../../../api-quota/__fixtures__/accounts";
import { quotaRequestGate, planCaptureBudget, type NbaAllowance } from "../pipeline/budget";
import type { NbaPipelineGame, OddsSourceId } from "../pipeline/contracts";
import { PIPELINE_SCHEMA } from "../pipeline/contracts";
import { ODDS_SOURCE_LICENSES } from "../pipeline/oddsSources";
import type { ProviderGameResult, ResultsFetch, ResultsProvider } from "../pipeline/postgameJob";
import type { ProviderPropLine, PropsFetchResult, PropsProvider, PregameDeps } from "../pipeline/pregameJob";
import type { PipelineStore } from "../pipeline/store";
import type { SourceLicense } from "../sources/types";
import type { ProviderAccountConfig } from "../../../api-quota/types";

export const MIN = 60_000;

/** A fixed import time: after the synthetic lines were captured, before the game. */
export const IMPORT_NOW = new Date("2026-11-09T21:10:00Z");

/** Eastern evening game: 19:30 ET on 2026-11-09 (EST), i.e. 00:30Z on the 10th. */
export const TIPOFF = "2026-11-10T00:30:00Z";

export const at = (tipoff: string, minutesBefore: number): Date => new Date(Date.parse(tipoff) - minutesBefore * MIN);

export function makeGame(over: Partial<NbaPipelineGame> & { tipoffUtc?: string; away?: string; home?: string } = {}): NbaPipelineGame {
  const tipoffUtc = over.tipoffUtc ?? TIPOFF;
  const away = over.away ?? "NYK";
  const home = over.home ?? "BOS";
  return {
    schemaVersion: PIPELINE_SCHEMA.game,
    canonicalGameKey: canonicalGameKey({ gameDate: etGameDate(tipoffUtc), homeCode: home, awayCode: away })!,
    sourceEventId: over.sourceEventId === undefined ? `evt-${away}-${home}-${tipoffUtc.slice(0, 10)}` : over.sourceEventId,
    tipoffUtc,
    awayTeam: away as NbaPipelineGame["awayTeam"],
    homeTeam: home as NbaPipelineGame["homeTeam"],
    neutralSite: false,
    status: "scheduled",
    observedAtUtc: "2026-11-09T12:00:00Z",
    ...over,
  };
}

/** Every use granted: synthetic lines only. */
export const SYNTHETIC_LICENSES: Readonly<Record<OddsSourceId, SourceLicense>> = { ...ODDS_SOURCE_LICENSES };

export const line = (over: Partial<ProviderPropLine> = {}): ProviderPropLine => ({
  playerName: "Sam Rivera",
  team: "NYK",
  market: "pts",
  sportsbook: "bookone",
  line: 24.5,
  overPrice: -115,
  underPrice: -105,
  lastUpdateUtc: "2026-11-09T21:00:00Z",
  ...over,
});

export interface MockProps extends PropsProvider {
  calls: Array<{ sourceEventId: string; markets: readonly string[] }>;
}

/** Answers per call in order; the last answer repeats. A thrown Error simulates a network failure. */
export function mockProps(answers: ReadonlyArray<PropsFetchResult | Error>, onCall?: () => void): MockProps {
  const calls: MockProps["calls"] = [];
  return {
    sourceId: "synthetic-odds",
    calls,
    async fetchEventProps(event) {
      calls.push({ sourceEventId: event.sourceEventId, markets: event.markets });
      onCall?.();
      const answer = answers[Math.min(calls.length - 1, answers.length - 1)];
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}

export const okLines = (lines: ProviderPropLine[], creditsCharged: number | null = 3): PropsFetchResult => ({ status: "ok", lines, creditsCharged, requestRef: "req-1" });

export interface MockResults extends ResultsProvider {
  calls: string[];
}

export function mockResults(answers: ReadonlyArray<ResultsFetch | Error>): MockResults {
  const calls: string[] = [];
  return {
    sourceId: "synthetic-results",
    method: "synthetic",
    calls,
    async fetchGameResult(game) {
      calls.push(game.canonicalGameKey);
      const answer = answers[Math.min(calls.length - 1, answers.length - 1)];
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}

export const finalResult = (game: NbaPipelineGame, players: ProviderGameResult["players"], over: Partial<ProviderGameResult> = {}): ResultsFetch => ({
  status: "ok",
  creditsCharged: null,
  requestRef: "res-req-1",
  result: { canonicalGameKey: game.canonicalGameKey, status: "final", periods: 4, finalizedAtUtc: "2026-11-10T03:05:00Z", players, ...over },
});

export const played = (playerName: string, team: string, stats: { minutes: number; pts: number; reb: number; ast: number }) => ({ playerName, team, participation: "played" as const, stats });

/** A quota account that is approved and verified, for exercising enforcement. */
export function oddsAccount(over: Partial<ProviderAccountConfig> = {}): ProviderAccountConfig {
  return testAccount({
    accountId: "test:odds",
    billingUnit: "credits",
    windows: [{ kind: "month", limit: 500, source: "provider-docs", resetDayOfMonth: 1 }],
    safetyReserve: 0,
    nonessentialMaxRatio: 1,
    ...over,
  });
}

export async function quotaSetup(over: Partial<ProviderAccountConfig> = {}, startIso = "2026-11-09T20:00:00Z", used = 0) {
  const time = clock(startIso);
  const account = oddsAccount(over);
  const manager = new QuotaManager({ accounts: [account], store: new MemoryUsageStore(), now: time.now, newId: sequentialIds() });
  const limit = account.windows[0].limit ?? 500;
  await manager.recordProviderUsage(account.accountId, [{ window: "month", observedAt: startIso, used, remaining: limit - used, limit }]);
  const allowance: NbaAllowance = { perDayCredits: 90, perMonthCredits: 400 };
  const gate = quotaRequestGate(manager, account.accountId, "pregame-capture", allowance, time.now);
  const plan = (keys: readonly string[]) => planCaptureBudget({ manager, accountId: account.accountId, gameKeys: keys, marketsPerGame: 3, allowance, now: time.now() });
  return { manager, gate, plan, time, accountId: account.accountId, allowance };
}

/** Deps for a capture run on synthetic lines, with an unrestricted gate unless a quota setup is supplied. */
export function captureDeps(store: PipelineStore, provider: PropsProvider, now: () => Date, extra: Partial<PregameDeps> = {}): PregameDeps {
  return {
    store,
    provider,
    gate: { accountId: "test:odds", enforcesNbaAllowance: true, reserve: async () => ({ ok: true, settle: async () => {} }) },
    plan: async (keys) => ({ affordable: keys.map((gameKey) => ({ gameKey, credits: 3 })), deferred: [], creditsPlanned: keys.length * 3, blocked: null }),
    now,
    runId: "run-1",
    licenses: SYNTHETIC_LICENSES,
    ...extra,
  };
}
