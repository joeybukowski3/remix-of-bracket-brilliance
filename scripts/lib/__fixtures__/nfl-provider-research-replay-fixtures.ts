/**
 * WU6.5 -- SYNTHETIC fixtures reproducing the SHAPE of the real archived
 * 2026_02_DET_BUF ChatGPT research response from the WU6.3 live-run incident:
 * a completed, non-truncated OpenAI /v1/responses envelope containing 12
 * findings, 11 structurally valid and one with `subjects` as a flat array
 * (`["buf","det"]` instead of `{teams,players,coaches}`) and no
 * confidence/relevance/quote. No real claim/source content from that run is
 * reused here.
 */
import type { EvidenceNormalizationContext } from "../nfl-evidence-types";

export const FIXTURE_GAME_ID = "2026_02_DET_BUF";
export const FIXTURE_SEASON = 2026;
export const FIXTURE_WEEK = 2;
export const FIXTURE_HOME_TEAM = "buf";
export const FIXTURE_AWAY_TEAM = "det";
export const FIXTURE_KICKOFF_UTC = "2026-09-18T00:15:00.000Z";

export const FIXTURE_REPLAY_CONTEXT: EvidenceNormalizationContext = {
  gameId: FIXTURE_GAME_ID,
  season: FIXTURE_SEASON,
  week: FIXTURE_WEEK,
  homeTeam: FIXTURE_HOME_TEAM,
  awayTeam: FIXTURE_AWAY_TEAM,
  kickoffUtc: FIXTURE_KICKOFF_UTC,
  contextVersion: "nfl-game-context-v1-fixture",
  knownTeamAbbrs: new Set(["buf", "det"]),
};

const CITED_URL_1 = "https://www.buffalobills.com/news/injury-report-week-2";
const CITED_URL_2 = "https://www.detroitlions.com/news/injury-report-week-2";
const CITED_URL_3 = "https://www.espn.com/nfl/story/lions-bills-preview";

function validFinding(n: number, overrides: Record<string, unknown> = {}) {
  return {
    claim: `Fixture valid finding #${n} about the matchup.`,
    category: "injury",
    sourceName: "Fixture Beat Reporter",
    sourceUrl: n % 2 === 0 ? CITED_URL_1 : CITED_URL_2,
    sourceType: "beat_reporter",
    author: "Fixture Author",
    publishedAt: "2026-09-15T10:00:00.000Z",
    subjects: { teams: ["buf", "det"], players: [], coaches: [] },
    confidence: "high",
    relevance: { summary: "test", areas: [] },
    ...overrides,
  };
}

/** The exact defect shape observed live in the real DET_BUF archive: subjects as a flat array, confidence/relevance/quote all absent. */
export const MALFORMED_FINDING = {
  claim: "The Bills' official schedule identifies Detroit at Buffalo for Thursday, September 17, at 8:15 p.m. EDT at Highmark Stadium.",
  category: "scheduling",
  sourceName: "Buffalo Bills",
  sourceUrl: CITED_URL_3,
  sourceType: "official_team",
  author: null,
  publishedAt: null,
  subjects: ["buf", "det"],
  players: [],
  coaches: [],
};

const VALID_FINDINGS = Array.from({ length: 11 }, (_, i) => validFinding(i + 1));
const ALL_12_FINDINGS = [...VALID_FINDINGS.slice(0, 9), MALFORMED_FINDING, ...VALID_FINDINGS.slice(9)];

/**
 * A completed, non-truncated OpenAI /v1/responses envelope shaped exactly
 * like the real archived DET_BUF response: id/model/status/created_at/
 * completed_at, one web_search_call with real-looking sources, one final
 * message whose text is a JSON array of the 12 findings above, usage
 * telemetry, and citation annotations for the 11 valid findings' URLs.
 */
export const DET_BUF_ARCHIVED_RESPONSE_FIXTURE = {
  id: "resp_fixture_det_buf_0001",
  model: "gpt-5.6-luna",
  object: "response",
  status: "completed",
  created_at: 1_789_400_000,
  completed_at: 1_789_400_039,
  reasoning: { effort: "none" },
  output: [
    {
      id: "ws_fixture_det_buf_1",
      type: "web_search_call",
      status: "completed",
      action: {
        type: "search",
        query: "Detroit Lions Buffalo Bills Week 2 injury report",
        queries: ["Detroit Lions Buffalo Bills Week 2 injury report"],
        sources: [CITED_URL_1, CITED_URL_2, CITED_URL_3].map((url) => ({ type: "url", url })),
      },
    },
    {
      id: "msg_fixture_det_buf_1",
      type: "message",
      role: "assistant",
      status: "completed",
      content: [
        {
          type: "output_text",
          text: JSON.stringify(ALL_12_FINDINGS),
          annotations: [CITED_URL_1, CITED_URL_2, CITED_URL_3].map((url, index) => ({ type: "url_citation", url, start_index: index * 10, end_index: index * 10 + 5, title: String(index + 1) })),
        },
      ],
    },
  ],
  usage: {
    input_tokens: 53927,
    input_tokens_details: { cached_tokens: 0, cache_write_tokens: 5164 },
    output_tokens: 3567,
    output_tokens_details: { reasoning_tokens: 499 },
    total_tokens: 57494,
  },
};

/** Same envelope but status "incomplete" -- must never be replayable. */
export const DET_BUF_INCOMPLETE_RESPONSE_FIXTURE = {
  ...DET_BUF_ARCHIVED_RESPONSE_FIXTURE,
  status: "incomplete",
  incomplete_details: { reason: "max_output_tokens" },
};
