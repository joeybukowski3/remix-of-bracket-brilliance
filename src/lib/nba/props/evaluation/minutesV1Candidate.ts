/**
 * The single evaluation-side entry point to the unpromoted minutes-v1
 * candidate. isolation.test.ts allowlists exactly this file for those imports,
 * so every other evaluation module reaches the candidate through here and a
 * new importer cannot appear without a visible change to that guard.
 */
export { computeMinutesV1Features, type MinutesV1Features } from "../minutesFeatures";
export { DEFAULT_MINUTES_V1_PARAMS, MINUTES_V1_MODEL_VERSION, projectMinutesV1, projectParticipation, type MinutesV1Params } from "../minutesV1";
