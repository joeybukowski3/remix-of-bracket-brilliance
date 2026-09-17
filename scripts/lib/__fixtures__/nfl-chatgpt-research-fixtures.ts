/**
 * WU4 -- fixtures shaped like OpenAI's Responses API (`POST /v1/responses`)
 * response body.
 *
 * FIXTURE_REAL_PROBE_RESPONSE is NOT synthetic -- it is a lightly-trimmed
 * copy of the actual, verified response captured live by the mandatory WU4
 * capability probe (see openai-wu4-capability-probe.json at the repo root).
 * It is included here so the parser/adapter fixture tests are checked
 * against the real shape OpenAI returned, not an invented approximation.
 * Every other fixture below IS synthetic -- invented to exercise specific
 * parsing/trust-boundary branches -- but is modeled on that same real shape.
 */

export const FIXTURE_REAL_PROBE_CITED_URL = "https://www.baltimoreravens.com/news/injury-report-zay-flowers-nnamdi-madubuike-ravens-colts-practice?utm_source=openai";
export const FIXTURE_REAL_PROBE_CITED_URL_CANONICAL = "https://www.baltimoreravens.com/news/injury-report-zay-flowers-nnamdi-madubuike-ravens-colts-practice";
/** Same underlying article as the cited URL above, but WITHOUT the OpenAI tracking param -- appears in action.sources[] verbatim in the real probe. */
export const FIXTURE_REAL_PROBE_DISCOVERED_URL_NO_TRACKING = "https://www.baltimoreravens.com/news/injury-report-zay-flowers-nnamdi-madubuike-ravens-colts-practice";
/** A URL the real probe's search discovered but the final message never cited. */
export const FIXTURE_REAL_PROBE_DISCOVERED_ONLY_URL = "https://www.colts.com/team/injury-report/";

/** Verbatim (trimmed to the fields this adapter reads) copy of the real, verified WU4 capability-probe response. */
export const FIXTURE_REAL_PROBE_RESPONSE = {
  id: "resp_021fab5724c72053016aa47047433487d2ae889a966a61fccd",
  object: "response",
  status: "completed",
  model: "gpt-5.6-luna",
  created_at: 1789161543,
  completed_at: 1789161548,
  reasoning: { context: "all_turns", effort: "none", mode: "standard", summary: null },
  output: [
    {
      id: "ws_021fab5724c72053016aa47048c89c87d2a91215d2ab993d58",
      type: "web_search_call",
      status: "completed",
      action: {
        type: "search",
        queries: ["Baltimore Ravens Indianapolis Colts September 13 2026 pregame update injury weather roster"],
        query: "Baltimore Ravens Indianapolis Colts September 13 2026 pregame update injury weather roster",
        sources: [
          { type: "url", url: "https://www.baltimoreravens.com/game-day/2026/reg-week1/ravens-at-colts/" },
          { type: "url", url: FIXTURE_REAL_PROBE_DISCOVERED_URL_NO_TRACKING },
          { type: "url", url: FIXTURE_REAL_PROBE_DISCOVERED_ONLY_URL },
          { type: "url", url: FIXTURE_REAL_PROBE_CITED_URL },
        ],
      },
    },
    {
      id: "msg_021fab5724c72053016aa4704c0c0887d2ac81d828dedb6014",
      type: "message",
      status: "completed",
      role: "assistant",
      phase: "final_answer",
      content: [
        {
          type: "output_text",
          annotations: [{ type: "url_citation", end_index: 351, start_index: 207, title: "Zay Flowers, Nnamdi Madubuike Limited on Ravens’ First Injury Report", url: FIXTURE_REAL_PROBE_CITED_URL }],
          logprobs: [],
          text:
            "**Pregame update:** Ravens wide receiver **Zay Flowers** was among four Baltimore players limited in the team’s first injury " +
            "report ahead of Sunday’s season opener at Indianapolis on **September 13, 2026**. " +
            `([baltimoreravens.com](${FIXTURE_REAL_PROBE_CITED_URL}))`,
        },
      ],
    },
  ],
  usage: {
    input_tokens: 8367,
    input_tokens_details: { cache_write_tokens: 4412, cached_tokens: 0 },
    output_tokens: 103,
    output_tokens_details: { reasoning_tokens: 40 },
    total_tokens: 8470,
  },
  tool_usage: { web_search: { num_requests: 1 } },
};

const FIXTURE_CITATION_URL_A = "https://example-fixture.test/beat/ravens-injury-notes";
const FIXTURE_CITATION_URL_B = "https://example-fixture.test/colts/official-injury-report";
export { FIXTURE_CITATION_URL_A, FIXTURE_CITATION_URL_B };

/** Deliberately discovered but never cited -- exercises the "discovered_only" rejection path. */
export const FIXTURE_DISCOVERED_ONLY_URL = "https://example-fixture.test/discovered-but-not-cited";
/** Deliberately never returned by search at all -- exercises the "ungrounded" rejection path. */
export const FIXTURE_UNGROUNDED_URL = "https://example-fixture.test/never-actually-searched";
/** Same article as FIXTURE_CITATION_URL_A but with an added OpenAI tracking param -- exercises canonicalization matching a finding's bare URL against a tracked citation URL. */
export const FIXTURE_CITATION_URL_A_TRACKED = `${FIXTURE_CITATION_URL_A}?utm_source=openai`;

const FIXTURE_FINDINGS_JSON = JSON.stringify([
  {
    claim: "Ravens WR [Fixture Player A] (hamstring) was a full participant in Thursday's practice.",
    category: "injury",
    sourceName: "Fixture Beat Reporter",
    sourceUrl: FIXTURE_CITATION_URL_A,
    sourceType: "beat_reporter",
    author: "Fixture Reporter",
    publishedAt: "2026-09-11T14:00:00.000Z",
    subjects: { teams: ["bal"], players: ["Fixture Player A"], coaches: [] },
    confidence: "medium",
    relevance: { summary: "Full practice participation reduces injury concern.", areas: ["usage"] },
    quote: null,
    rawExcerpt: "[Fixture Player A] practiced fully on Thursday.",
  },
  {
    claim: "Colts DT [Fixture Player B] (rest) did not practice Thursday and is questionable.",
    category: "injury",
    sourceName: "Colts Official Injury Report",
    sourceUrl: FIXTURE_CITATION_URL_B,
    sourceType: "injury_report",
    author: null,
    publishedAt: "2026-09-11T20:00:00.000Z",
    subjects: { teams: ["ind"], players: ["Fixture Player B"], coaches: [] },
    confidence: "high",
    relevance: { summary: "Starting DT questionable changes run-defense matchup.", areas: ["run_defense"] },
    quote: null,
    rawExcerpt: "DNP: [Fixture Player B] (Rest)",
  },
  {
    // Discovered by search, but never actually cited in the final message -- must be rejected as "discovered_only".
    claim: "A report claims the Colts made a minor roster tweak.",
    category: "personnel",
    sourceName: "Fixture Discovered-Only Outlet",
    sourceUrl: FIXTURE_DISCOVERED_ONLY_URL,
    sourceType: "sports_media",
    author: null,
    publishedAt: "2026-09-11T09:00:00.000Z",
    subjects: { teams: ["ind"], players: [], coaches: [] },
    confidence: "low",
    relevance: { summary: "Minor roster tweak, weakly sourced.", areas: ["other"] },
    quote: null,
    rawExcerpt: null,
  },
  {
    // Never surfaced by search at all -- must be rejected as "ungrounded".
    claim: "An uncorroborated report claims a surprise starting lineup change.",
    category: "news",
    sourceName: "Fixture Unverifiable Outlet",
    sourceUrl: FIXTURE_UNGROUNDED_URL,
    sourceType: "sports_media",
    author: null,
    publishedAt: "2026-09-11T10:00:00.000Z",
    subjects: { teams: ["ind"], players: [], coaches: [] },
    confidence: "low",
    relevance: { summary: "Unverified lineup claim.", areas: ["other"] },
    quote: null,
    rawExcerpt: null,
  },
]);

function successResponse(findingsJson: string, citationUrls: string[], discoveredOnlyUrls: string[] = []): unknown {
  return {
    id: "resp_fixture_success_0001",
    model: "gpt-5.6-luna",
    object: "response",
    status: "completed",
    created_at: 1_700_000_000,
    completed_at: 1_700_000_005,
    reasoning: { effort: "none" },
    output: [
      {
        id: "ws_fixture_1",
        type: "web_search_call",
        status: "completed",
        action: {
          type: "search",
          query: "Ravens Colts injury report",
          queries: ["Ravens Colts injury report"],
          sources: [...citationUrls, ...discoveredOnlyUrls].map((url) => ({ type: "url", url })),
        },
      },
      {
        id: "msg_fixture_1",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: findingsJson,
            annotations: citationUrls.map((url, index) => ({ type: "url_citation", url, start_index: index * 10, end_index: index * 10 + 5, title: String(index + 1) })),
          },
        ],
      },
    ],
    usage: {
      input_tokens: 42000,
      input_tokens_details: { cached_tokens: 5000, cache_write_tokens: 1200 },
      output_tokens: 900,
      output_tokens_details: { reasoning_tokens: 650 },
      total_tokens: 42900,
    },
    tool_usage: { web_search: { num_requests: 1 } },
  };
}

/** Well-formed success: 2 accepted (cited), 1 discovered_only rejection, 1 ungrounded rejection. */
export const FIXTURE_SUCCESS_RESPONSE = successResponse(FIXTURE_FINDINGS_JSON, [FIXTURE_CITATION_URL_A, FIXTURE_CITATION_URL_B], [FIXTURE_DISCOVERED_ONLY_URL]);

/** Message text wrapped in a markdown fence -- adapter must still parse it. */
export const FIXTURE_SUCCESS_RESPONSE_FENCED = {
  ...(FIXTURE_SUCCESS_RESPONSE as Record<string, unknown>),
  output: (FIXTURE_SUCCESS_RESPONSE as { output: unknown[] }).output.map((item) =>
    (item as { type: string }).type === "message"
      ? { ...(item as Record<string, unknown>), content: [{ ...((item as { content: unknown[] }).content[0] as Record<string, unknown>), text: `\`\`\`json\n${FIXTURE_FINDINGS_JSON}\n\`\`\`` }] }
      : item
  ),
};

/** No message item at all. */
export const FIXTURE_NO_MESSAGE_RESPONSE = {
  ...(FIXTURE_SUCCESS_RESPONSE as Record<string, unknown>),
  output: (FIXTURE_SUCCESS_RESPONSE as { output: unknown[] }).output.filter((item) => (item as { type: string }).type !== "message"),
};

/** Message present, but its text is prose with no JSON array -- malformed-output failure case. */
export const FIXTURE_MALFORMED_MESSAGE_RESPONSE = {
  ...(FIXTURE_SUCCESS_RESPONSE as Record<string, unknown>),
  output: (FIXTURE_SUCCESS_RESPONSE as { output: unknown[] }).output.map((item) =>
    (item as { type: string }).type === "message" ? { ...(item as Record<string, unknown>), content: [{ type: "output_text", text: "Here is a summary of my research findings in prose.", annotations: [] }] } : item
  ),
};

/**
 * No citations at all (zero url_citation annotations), but action.sources[]
 * DOES contain FIXTURE_CITATION_URL_A and FIXTURE_CITATION_URL_B -- under
 * the WU4.1 grounding policy these two findings are accepted as
 * "discovered" (not rejected), while FIXTURE_DISCOVERED_ONLY_URL (absent
 * from every source list in this fixture) and FIXTURE_UNGROUNDED_URL remain
 * rejected as "ungrounded".
 */
export const FIXTURE_NO_CITATIONS_RESPONSE = {
  ...(FIXTURE_SUCCESS_RESPONSE as Record<string, unknown>),
  output: [
    { id: "ws_fixture_a", type: "web_search_call", status: "completed", action: { type: "search", query: "q1", queries: ["q1"], sources: [{ type: "url", url: FIXTURE_CITATION_URL_A }] } },
    { id: "ws_fixture_b", type: "web_search_call", status: "completed", action: { type: "search", query: "q2", queries: ["q2"], sources: [{ type: "url", url: FIXTURE_CITATION_URL_B }] } },
    { id: "msg_fixture_no_citations", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: FIXTURE_FINDINGS_JSON, annotations: [] }] },
  ],
};

/** Empty action.sources[] on every web_search_call, but citations still present (edge case: provider cited something search "sources" never echoed). */
export const FIXTURE_EMPTY_SOURCES_RESPONSE = {
  ...(FIXTURE_SUCCESS_RESPONSE as Record<string, unknown>),
  output: [
    { id: "ws_fixture_empty", type: "web_search_call", status: "completed", action: { type: "search", query: "q1", queries: ["q1"], sources: [] } },
    {
      id: "msg_fixture_empty_sources",
      type: "message",
      role: "assistant",
      status: "completed",
      content: [
        {
          type: "output_text",
          text: JSON.stringify([JSON.parse(FIXTURE_FINDINGS_JSON)[0]]),
          annotations: [{ type: "url_citation", url: FIXTURE_CITATION_URL_A, start_index: 0, end_index: 5, title: "1" }],
        },
      ],
    },
  ],
};

/** Status completed, but zero sources and zero citations at all -- every finding must resolve to "ungrounded" and be rejected. Used to prove thin/zero-accepted research is a normal successful outcome, never a truncation-retry trigger. */
export const FIXTURE_ALL_UNGROUNDED_RESPONSE = successResponse(FIXTURE_FINDINGS_JSON, [], []);

/** WU4.3 -- an empty findings array: "[]", still with a real (if minimal) web_search_call. Used to prove a delta-update pass that finds nothing materially new is a valid, successful outcome, not an error. */
export const FIXTURE_EMPTY_FINDINGS_RESPONSE = successResponse("[]", [], []);

/** WU4.3 -- a single genuinely-new update finding (a Thursday-limited-to-Friday-full upgrade), cited. Used for "new evidence appended" update-mode scenarios. */
export const FIXTURE_UPDATE_NEW_INJURY_URL = "https://example-fixture.test/update/injury-upgrade-friday";
const FIXTURE_UPDATE_NEW_INJURY_FINDINGS_JSON = JSON.stringify([
  {
    claim: "Ravens WR [Fixture Player A] (hamstring) was upgraded to a full participant in Friday's practice.",
    category: "injury",
    sourceName: "Fixture Beat Reporter",
    sourceUrl: FIXTURE_UPDATE_NEW_INJURY_URL,
    sourceType: "beat_reporter",
    author: "Fixture Reporter",
    publishedAt: "2026-09-12T14:00:00.000Z",
    subjects: { teams: ["bal"], players: ["Fixture Player A"], coaches: [] },
    confidence: "high",
    relevance: { summary: "Full Friday practice further reduces injury concern ahead of kickoff.", areas: ["usage"] },
    quote: null,
    rawExcerpt: "[Fixture Player A] was a full participant Friday.",
  },
]);
export const FIXTURE_UPDATE_NEW_INJURY_RESPONSE = successResponse(FIXTURE_UPDATE_NEW_INJURY_FINDINGS_JSON, [FIXTURE_UPDATE_NEW_INJURY_URL], []);

/** A single discovered-only (never inline-cited) finding from a Tier-1 official source -- WU4.1's "discovered-only official source still flows through WU2" test case. */
export const FIXTURE_DISCOVERED_ONLY_OFFICIAL_URL = "https://example-fixture.test/official/ravens-injury-report";
const FIXTURE_DISCOVERED_ONLY_OFFICIAL_FINDINGS_JSON = JSON.stringify([
  {
    claim: "Ravens WR [Fixture Player A] (hamstring) was a full participant in Thursday's practice.",
    category: "injury",
    sourceName: "Baltimore Ravens Official Site",
    sourceUrl: FIXTURE_DISCOVERED_ONLY_OFFICIAL_URL,
    sourceType: "official_team",
    author: null,
    publishedAt: "2026-09-11T14:00:00.000Z",
    subjects: { teams: ["bal"], players: ["Fixture Player A"], coaches: [] },
    confidence: "high",
    relevance: { summary: "Full practice participation reduces injury concern.", areas: ["usage"] },
    quote: null,
    rawExcerpt: "[Fixture Player A] practiced fully on Thursday.",
  },
]);
/** discoveredOnlyUrls (3rd arg) -- never passed as a citationUrl, so this resolves to "discovered", not "cited". */
export const FIXTURE_DISCOVERED_ONLY_OFFICIAL_RESPONSE = successResponse(FIXTURE_DISCOVERED_ONLY_OFFICIAL_FINDINGS_JSON, [], [FIXTURE_DISCOVERED_ONLY_OFFICIAL_URL]);

/** A single discovered-only finding whose sourceName trips WU2's rumor/tout rejection pattern (nfl-evidence-policy.ts's REJECTED_SOURCE_NAME_PATTERN) -- WU4.1's "discovered-only bad/rumor source still fails under WU2 policy" test case. Proves provider grounding never bypasses WU2 source-quality policy. */
export const FIXTURE_DISCOVERED_ONLY_RUMOR_URL = "https://example-fixture.test/rumor-central/colts-lineup-rumor";
const FIXTURE_DISCOVERED_ONLY_RUMOR_FINDINGS_JSON = JSON.stringify([
  {
    claim: "A report claims the Colts are considering a surprise lineup change.",
    category: "news",
    sourceName: "Rumor Central Sports",
    sourceUrl: FIXTURE_DISCOVERED_ONLY_RUMOR_URL,
    sourceType: "sports_media",
    author: null,
    publishedAt: "2026-09-11T09:00:00.000Z",
    subjects: { teams: ["ind"], players: [], coaches: [] },
    confidence: "low",
    relevance: { summary: "Unverified lineup speculation.", areas: ["other"] },
    quote: null,
    rawExcerpt: null,
  },
]);
export const FIXTURE_DISCOVERED_ONLY_RUMOR_RESPONSE = successResponse(FIXTURE_DISCOVERED_ONLY_RUMOR_FINDINGS_JSON, [], [FIXTURE_DISCOVERED_ONLY_RUMOR_URL]);

/** Malformed/missing output field entirely -- adapter must degrade gracefully, not throw. */
export const FIXTURE_MISSING_OUTPUT_RESPONSE = { id: "resp_fixture_missing_output", model: "gpt-5.6-luna", object: "response", status: "completed" };

/** A finding whose sourceUrl matches a citation only after canonicalization (tracked citation URL, bare finding URL). */
const FIXTURE_TRACKING_FINDINGS_JSON = JSON.stringify([
  {
    claim: "Ravens WR [Fixture Player A] (hamstring) was a full participant in Thursday's practice.",
    category: "injury",
    sourceName: "Fixture Beat Reporter",
    sourceUrl: FIXTURE_CITATION_URL_A, // bare URL, no tracking param
    sourceType: "beat_reporter",
    author: "Fixture Reporter",
    publishedAt: "2026-09-11T14:00:00.000Z",
    subjects: { teams: ["bal"], players: ["Fixture Player A"], coaches: [] },
    confidence: "medium",
    relevance: { summary: "Full practice participation reduces injury concern.", areas: ["usage"] },
    quote: null,
    rawExcerpt: "[Fixture Player A] practiced fully on Thursday.",
  },
]);

/** The provider's own citation annotation carries the tracked (?utm_source=openai) variant of the same URL the finding cites bare -- canonicalization must still match them. */
export const FIXTURE_TRACKING_CANONICALIZATION_RESPONSE = successResponse(FIXTURE_TRACKING_FINDINGS_JSON, [FIXTURE_CITATION_URL_A_TRACKED]);

/**
 * Modeled on the real first live WU4 run: HTTP 200, `status: "incomplete"`,
 * `incomplete_details.reason: "max_output_tokens"`, output_tokens exactly
 * equal to the configured max_output_tokens, and a message whose text is a
 * genuinely unterminated JSON array (the model was cut off mid-emission).
 */
export const FIXTURE_TRUNCATED_MAX_OUTPUT_TOKENS_RESPONSE = {
  id: "resp_fixture_truncated_0001",
  model: "gpt-5.6-luna",
  object: "response",
  status: "incomplete",
  incomplete_details: { reason: "max_output_tokens" },
  created_at: 1_700_000_100,
  completed_at: 1_700_000_106,
  reasoning: { effort: "none" },
  output: [
    {
      id: "ws_fixture_truncated_1",
      type: "web_search_call",
      status: "completed",
      action: {
        type: "search",
        query: "Ravens Colts injury report",
        queries: ["Ravens Colts injury report"],
        sources: [{ type: "url", url: FIXTURE_CITATION_URL_A }],
      },
    },
    {
      id: "msg_fixture_truncated_1",
      type: "message",
      role: "assistant",
      status: "incomplete",
      content: [
        {
          type: "output_text",
          // Deliberately unterminated -- one complete object, then a dangling second object with no closing bracket.
          text: `[${JSON.stringify(JSON.parse(FIXTURE_FINDINGS_JSON)[0])},{"claim":"Cut off mid-`,
          annotations: [{ type: "url_citation", url: FIXTURE_CITATION_URL_A, start_index: 0, end_index: 5, title: "1" }],
        },
      ],
    },
  ],
  usage: {
    input_tokens: 42_000,
    input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
    output_tokens: 2200,
    output_tokens_details: { reasoning_tokens: 425 },
    total_tokens: 44_845,
  },
  tool_usage: { web_search: { num_requests: 4 } },
};

/** Same truncation shape, used as the SECOND (retry) response so retry-success tests can assert the adapter recovers. */
export function truncatedResponseWithMaxOutputTokens(maxOutputTokens: number): unknown {
  return { ...FIXTURE_TRUNCATED_MAX_OUTPUT_TOKENS_RESPONSE, usage: { ...FIXTURE_TRUNCATED_MAX_OUTPUT_TOKENS_RESPONSE.usage, output_tokens: maxOutputTokens } };
}

/** `status: "incomplete"` but for an unrelated reason (e.g. a content filter) -- must NOT be classified as provider_output_truncated. */
export const FIXTURE_INCOMPLETE_NON_TOKEN_REASON_RESPONSE = {
  ...FIXTURE_TRUNCATED_MAX_OUTPUT_TOKENS_RESPONSE,
  incomplete_details: { reason: "content_filter" },
};

/**
 * `status: "completed"` (NOT incomplete) with a message whose text happens to
 * be an unterminated JSON array -- must remain classified as "malformed_json",
 * never reclassified as provider_output_truncated, since the provider itself
 * never reported truncation.
 */
export const FIXTURE_COMPLETED_UNTERMINATED_JSON_RESPONSE = {
  ...(FIXTURE_SUCCESS_RESPONSE as Record<string, unknown>),
  status: "completed",
  output: (FIXTURE_SUCCESS_RESPONSE as { output: unknown[] }).output.map((item) =>
    (item as { type: string }).type === "message"
      ? { ...(item as Record<string, unknown>), content: [{ type: "output_text", text: `[${JSON.stringify(JSON.parse(FIXTURE_FINDINGS_JSON)[0])},{"claim":"cut off`, annotations: [] }] }
      : item
  ),
};
