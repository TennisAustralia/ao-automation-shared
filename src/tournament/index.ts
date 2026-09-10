export { EVENT_CATEGORIES, EVENT_CODES, ROUND_NAMES } from './event-data.js';
export {
  getAllEventCodes,
  getAllEventNames,
  getEventCode,
  getEventName,
  isValidEventName
} from './event-codes.js';

export {
  EVENT_CATEGORIES as DRAW_EVENT_CATEGORIES,
  EVENT_CODES as DRAW_EVENT_CODES,
  ROUND_NAMES as DRAW_ROUND_NAMES
} from './event-data.js';
export {
  getAllEventCodes as getAllDrawEventCodes,
  getAllEventNames as getAllDrawEventNames,
  getEventCode as getDrawEventCode,
  getEventName as getDrawEventName,
  isValidEventName as isValidDrawEventName
} from './event-codes.js';

// Web-native parser/discovery API (mirrors AO_Web_Automation helper names).
export {
  combinePayloadAnalyses,
  discoverAllPlayersPayloads,
  discoverDrawPayloads,
  discoverSOPPayloads,
  discoverSchedulePayloads,
  getCurrentRNGSeed,
  parseAllPlayersPayload,
  parseDrawsPayload,
  sampleDrawPayloadsForTesting,
  selectBestAllPlayersPayload,
  selectBestSchedulePayload,
  validatePlayerIdsExist
} from './draws-payload-parser.js';
export type {
  AllPlayersPayload,
  AllPlayersPayloadInfo,
  DrawPayload,
  DrawPayloadInfo,
  MatchupInfo,
  PayloadAnalysis,
  PayloadMatch,
  PayloadPlayer,
  PayloadScore,
  PayloadTeam,
  PlayerIdValidationResult,
  PlayerWithBadge,
  PlayerWithSeed,
  ScheduleMatch,
  SchedulePayloadInfo,
  SOPPayloadInfo
} from './draws-payload-parser.js';

export { getPayloadRoot } from '../internal/payload-access.js';
export { discoverDrawPayloadFiles, findLatestDrawPayloadFile, hasAnyPlayerData } from '../internal/payload-discovery.js';
export { buildTeamDisplayName, getAllMatches, getFirstRoundMatch, getRoundMatches, loadDrawPayloadByEvent } from '../internal/payload-parser.js';

export {
  clearDrupalData,
  clearScoringData,
  getEventId,
  logDiscoveredPayloads,
  postPayloads,
  postPayloadToAPI,
  prepAndRefresh,
  refreshDrupalCache,
  verifyEmptyState,
  verifyLiveScoresEmptyState,
  verifyMatchDisplayed,
  verifyDrawsEmptyState,
  verifyResultsEmptyState,
  verifyScheduleEmptyState,
  waitForDataProcessing,
} from './payload-api.js';
export type {
  DrawsPageLike,
  EnvironmentName,
  LocatorLike,
  Match,
  PageHelper,
  PageLike,
  Payload,
  PayloadInfo,
  PostPayloadBatchOptions,
  PostPayloadOptions,
  SimulatorLike,
  Team,
} from './payload-api.js';