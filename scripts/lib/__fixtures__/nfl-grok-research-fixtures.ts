/**
 * WU3 -- SYNTHETIC fixtures shaped like xAI's Agent Tools API
 * (`POST /v1/responses`) response body. None of this is real research
 * output; every URL, claim, and usage number is invented for exercising
 * nfl-grok-research-parsing.ts / nfl-grok-research-adapter.ts without a
 * network call. Mirrors the REAL response shape confirmed by a live
 * capability probe: `response.output[]` containing "reasoning",
 * "web_search_call", and "message" items, with citation annotations on the
 * message's content block and cost/usage fields including
 * `cost_in_usd_ticks`.
 */

export const FIXTURE_CITATION_URL_A = "https://example-fixture.test/beat/ravens-injury-notes";
export const FIXTURE_CITATION_URL_B = "https://example-fixture.test/colts/official-injury-report";
/** Deliberately NEVER placed in a fixture response's annotations -- exercises the untrusted-source rejection path. */
export const FIXTURE_UNCITED_URL = "https://example-fixture.test/never-actually-searched";

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
    // Deliberately cites a URL never present in this fixture's annotations -- must be rejected.
    claim: "An uncorroborated report claims a surprise starting lineup change.",
    category: "news",
    sourceName: "Fixture Unverifiable Outlet",
    sourceUrl: FIXTURE_UNCITED_URL,
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

/** Successful, well-formed research response: 2 web_search_call turns + 1 message with valid citations. */
export const FIXTURE_SUCCESS_RESPONSE = {
  id: "resp_fixture_success_0001",
  model: "grok-4.6",
  object: "response",
  status: "completed",
  output: [
    { id: "rs_fixture_1", type: "reasoning", status: "completed", summary: [{ type: "summary_text", text: "Planning research approach." }] },
    { id: "ws_fixture_1", type: "web_search_call", status: "completed", action: { type: "search", query: "Ravens Colts injury report", sources: [{ type: "url", url: FIXTURE_CITATION_URL_A }] } },
    { id: "ws_fixture_2", type: "web_search_call", status: "completed", action: { type: "search", query: "Colts official injury report", sources: [{ type: "url", url: FIXTURE_CITATION_URL_B }] } },
    {
      id: "msg_fixture_1",
      type: "message",
      role: "assistant",
      status: "completed",
      content: [
        {
          type: "output_text",
          text: FIXTURE_FINDINGS_JSON,
          annotations: [
            { type: "url_citation", url: FIXTURE_CITATION_URL_A, start_index: 0, end_index: 10, title: "1" },
            { type: "url_citation", url: FIXTURE_CITATION_URL_B, start_index: 20, end_index: 30, title: "2" },
          ],
        },
      ],
    },
  ],
  usage: {
    input_tokens: 42000,
    input_tokens_details: { cached_tokens: 5000 },
    output_tokens: 900,
    output_tokens_details: { reasoning_tokens: 650 },
    total_tokens: 42900,
    num_server_side_tools_used: 2,
    server_side_tool_usage_details: { web_search_calls: 2, x_search_calls: 0, code_interpreter_calls: 0 },
    cost_in_usd_ticks: 375020000,
  },
};

/** Message text wrapped in a markdown fence -- adapter must still parse it. */
export const FIXTURE_SUCCESS_RESPONSE_FENCED = {
  ...FIXTURE_SUCCESS_RESPONSE,
  output: FIXTURE_SUCCESS_RESPONSE.output.map((item) =>
    item.type === "message"
      ? { ...item, content: [{ ...item.content[0], text: `\`\`\`json\n${FIXTURE_FINDINGS_JSON}\n\`\`\`` }] }
      : item
  ),
};

/** No message item at all -- e.g. the model exhausted its turn budget without ever responding. */
export const FIXTURE_NO_MESSAGE_RESPONSE = {
  ...FIXTURE_SUCCESS_RESPONSE,
  output: FIXTURE_SUCCESS_RESPONSE.output.filter((item) => item.type !== "message"),
};

/** Message present, but its text is prose with no JSON array -- malformed-output failure case. */
export const FIXTURE_MALFORMED_MESSAGE_RESPONSE = {
  ...FIXTURE_SUCCESS_RESPONSE,
  output: FIXTURE_SUCCESS_RESPONSE.output.map((item) =>
    item.type === "message" ? { ...item, content: [{ type: "output_text", text: "Here is a summary of my research findings in prose.", annotations: [] }] } : item
  ),
};

/**
 * WU3.3 -- SYNTHETIC update-mode (mode:"update") response fixtures, scenarios
 * A-H per the WU3.3 work order. All still shaped like real
 * `POST /v1/responses` output (reasoning/web_search_call/message items,
 * citation annotations, usage/cost fields) -- only the findings content and
 * scenario framing are update-specific. None of this is real research.
 */

export const FIXTURE_UPDATE_CITATION_URL_INJURY = "https://example-fixture.test/update/official-injury-upgrade";
export const FIXTURE_UPDATE_CITATION_URL_PERSONNEL = "https://example-fixture.test/update/beat-personnel-note";
export const FIXTURE_UPDATE_CITATION_URL_CONFLICT = "https://example-fixture.test/update/conflicting-status-report";
export const FIXTURE_UPDATE_CITATION_URL_SUPERSEDE = "https://example-fixture.test/update/superseding-official-report";
export const FIXTURE_UPDATE_CITATION_URL_WEAK = "https://example-fixture.test/update/team-site-index/";
/** Deliberately the SAME URL as WU3's FIXTURE_CITATION_URL_A, to exercise "duplicate of an already-known finding must be skipped, not re-appended." */
export const FIXTURE_UPDATE_DUPLICATE_URL = FIXTURE_CITATION_URL_A;

function updateResponse(findings: unknown[], citationUrls: string[]) {
  return {
    id: "resp_fixture_update_0001",
    model: "grok-4.6",
    object: "response",
    status: "completed",
    output: [
      { id: "rs_fixture_update_1", type: "reasoning", status: "completed", summary: [{ type: "summary_text", text: "Checking for developments since the previous cutoff." }] },
      { id: "ws_fixture_update_1", type: "web_search_call", status: "completed", action: { type: "search", query: "Ravens Colts injury report update", sources: citationUrls.map((url) => ({ type: "url", url })) } },
      {
        id: "msg_fixture_update_1",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: JSON.stringify(findings),
            annotations: citationUrls.map((url, index) => ({ type: "url_citation", url, start_index: index * 10, end_index: index * 10 + 5, title: String(index + 1) })),
          },
        ],
      },
    ],
    usage: {
      input_tokens: 12000,
      input_tokens_details: { cached_tokens: 2000 },
      output_tokens: 300,
      output_tokens_details: { reasoning_tokens: 150 },
      total_tokens: 12300,
      num_server_side_tools_used: 1,
      server_side_tool_usage_details: { web_search_calls: 1, x_search_calls: 0, code_interpreter_calls: 0 },
      cost_in_usd_ticks: 42000000,
    },
  };
}

/** A. New official injury status (an upgrade/downgrade from what was previously known). */
export const FIXTURE_UPDATE_A_NEW_INJURY_STATUS = updateResponse(
  [
    {
      claim: "Ravens WR [Fixture Player A] (hamstring) was upgraded to full participation on Friday's injury report.",
      category: "injury",
      sourceName: "Ravens Official Injury Report",
      sourceUrl: FIXTURE_UPDATE_CITATION_URL_INJURY,
      sourceType: "injury_report",
      author: null,
      publishedAt: "2026-09-12T20:00:00.000Z",
      subjects: { teams: ["bal"], players: ["Fixture Player A"], coaches: [] },
      confidence: "high",
      relevance: { summary: "Upgrade to full participation reduces injury concern further.", areas: ["usage"] },
      quote: null,
      rawExcerpt: "FULL: [Fixture Player A] (Hamstring)",
    },
  ],
  [FIXTURE_UPDATE_CITATION_URL_INJURY]
);

/** B. New beat-reporter personnel update. */
export const FIXTURE_UPDATE_B_PERSONNEL_UPDATE = updateResponse(
  [
    {
      claim: "Colts are expected to elevate a practice-squad offensive lineman ahead of Sunday, per a beat reporter.",
      category: "personnel",
      sourceName: "Fixture Beat Reporter",
      sourceUrl: FIXTURE_UPDATE_CITATION_URL_PERSONNEL,
      sourceType: "beat_reporter",
      author: "Fixture Reporter",
      publishedAt: "2026-09-12T21:00:00.000Z",
      subjects: { teams: ["ind"], players: [], coaches: [] },
      confidence: "medium",
      relevance: { summary: "Depth-chart change on the offensive line.", areas: ["protection"] },
      quote: null,
      rawExcerpt: "Colts are expected to elevate an OL from the practice squad, per a source.",
    },
  ],
  [FIXTURE_UPDATE_CITATION_URL_PERSONNEL]
);

/** C. No new material information -- Grok correctly returns an empty findings array. */
export const FIXTURE_UPDATE_C_NO_NEW_INFO = updateResponse([], []);

/** D. Conflicting update -- contradicts a previously-known status (e.g. previously "questionable", now reported "ruled out" by a same-tier-or-weaker independent source). */
export const FIXTURE_UPDATE_D_CONFLICTING = updateResponse(
  [
    {
      claim: "A conflicting report indicates Colts DT [Fixture Player B] is expected to play despite Thursday's DNP.",
      category: "injury",
      sourceName: "Fixture Sports Media Roundup",
      sourceUrl: FIXTURE_UPDATE_CITATION_URL_CONFLICT,
      sourceType: "sports_media",
      author: null,
      publishedAt: "2026-09-12T15:00:00.000Z",
      subjects: { teams: ["ind"], players: ["Fixture Player B"], coaches: [] },
      confidence: "low",
      relevance: { summary: "Conflicts with the official DNP report.", areas: ["run_defense"] },
      quote: null,
      rawExcerpt: "Word is [Fixture Player B] plays Sunday despite resting Thursday.",
    },
  ],
  [FIXTURE_UPDATE_CITATION_URL_CONFLICT]
);

/** E. Superseding update -- a later, official report that should dominate an earlier, weaker one on the same subject. */
export const FIXTURE_UPDATE_E_SUPERSEDING = updateResponse(
  [
    {
      claim: "Colts DT [Fixture Player B] (rest) was ruled OUT on the official Friday injury report.",
      category: "injury",
      sourceName: "Colts Official Injury Report",
      sourceUrl: FIXTURE_UPDATE_CITATION_URL_SUPERSEDE,
      sourceType: "injury_report",
      author: null,
      publishedAt: "2026-09-12T20:30:00.000Z",
      subjects: { teams: ["ind"], players: ["Fixture Player B"], coaches: [] },
      confidence: "high",
      relevance: { summary: "Official OUT designation supersedes the earlier questionable status.", areas: ["run_defense"] },
      quote: null,
      rawExcerpt: "OUT: [Fixture Player B] (Rest)",
    },
  ],
  [FIXTURE_UPDATE_CITATION_URL_SUPERSEDE]
);

/** F. Weak citation requiring review -- valid finding, but the only supporting URL is a section/index page. */
export const FIXTURE_UPDATE_F_WEAK_CITATION = updateResponse(
  [
    {
      claim: "Colts posted a new roster move on their official news page.",
      category: "personnel",
      sourceName: "Colts Official Site",
      sourceUrl: FIXTURE_UPDATE_CITATION_URL_WEAK,
      sourceType: "official_team",
      author: null,
      publishedAt: "2026-09-12T19:00:00.000Z",
      subjects: { teams: ["ind"], players: [], coaches: [] },
      confidence: "medium",
      relevance: { summary: "Roster move noted on the team's news index.", areas: ["other"] },
      quote: null,
      rawExcerpt: "See the linked news index for the roster move.",
    },
  ],
  [FIXTURE_UPDATE_CITATION_URL_WEAK]
);

/** G. Duplicate of an old finding -- same claim + same URL as WU3's confirmedInjuryCandidate-equivalent fixture finding; must be skipped by the store, not re-appended. */
export const FIXTURE_UPDATE_G_DUPLICATE_OLD_FINDING = updateResponse(
  [
    {
      claim: "Ravens WR [Fixture Player A] (hamstring) was a full participant in Thursday's practice.",
      category: "injury",
      sourceName: "Fixture Beat Reporter",
      sourceUrl: FIXTURE_UPDATE_DUPLICATE_URL,
      sourceType: "beat_reporter",
      author: "Fixture Reporter",
      publishedAt: "2026-09-11T14:00:00.000Z",
      subjects: { teams: ["bal"], players: ["Fixture Player A"], coaches: [] },
      confidence: "medium",
      relevance: { summary: "Full practice participation reduces injury concern.", areas: ["usage"] },
      quote: null,
      rawExcerpt: "[Fixture Player A] practiced fully on Thursday.",
    },
  ],
  [FIXTURE_UPDATE_DUPLICATE_URL]
);

/** H. Post-kickoff attempt fixture data -- used with canCreatePregameSnapshot()/isPregameStreamLocked(), never actually sent to the adapter (creation must be rejected before any request is made). */
export const FIXTURE_UPDATE_H_POST_KICKOFF_ATTEMPT = {
  kickoffUtc: "2026-09-13T17:00:00.000Z",
  attemptedNow: () => new Date("2026-09-13T20:00:00.000Z"),
};
