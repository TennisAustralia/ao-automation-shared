/**
 * Draws Payload Parser
 * Extracts player information from payload files for test validation
 *
 * Based on: SMT Tennis Tournament Play JSON Data Feed Specification v1.9
 * Spec Location: context/draws/SMT Tennis Tournament Play JSON Data Feed Specs - V1.9.md
 *
 * Supported Feed Types:
 * - EventMatches (MsgID: "EventMatches") - Draw structure with matches
 * - AllPlayers (MsgID: "AllPlayers") - Player roster data
 * - Schedule (MsgID: "Schedule") - Match scheduling data
 *
 * Payload Posting Sequence:
 * 1. AllPlayers - Player data must exist before referencing in draws
 * 2. EventMatches (Draw) - Draw structure references player IDs
 * 3. Schedule - Schedule references match IDs from draw
 */

import * as fs from 'fs';
import * as path from 'path';
import Debug from 'debug';
import { getPayloadRoot } from '../internal/payload-access.js';

const debug = Debug('utils:drawsPayloadParser');

// ============================================================================
// SEEDED RANDOM NUMBER GENERATOR (for reproducible test sampling)
// ============================================================================

/**
 * Seeded Random Number Generator using Linear Congruential Generator (LCG)
 *
 * Provides reproducible pseudo-random numbers for deterministic testing.
 * Uses the same algorithm parameters as glibc for well-tested behavior.
 *
 * Why LCG?
 * - Simple, fast, and well-understood algorithm
 * - Same seed always produces same sequence of numbers
 * - Used by property-based testing frameworks (QuickCheck, Hypothesis)
 * - Good enough distribution for test data (not cryptographically secure)
 *
 * @example
 * const rng = new SeededRandom(12345);
 * rng.int(0, 9);  // Always returns same number for seed 12345
 * rng.int(0, 9);  // Next number in sequence
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  /**
   * Generate next pseudo-random number (0 to 1)
   * @returns Number between 0 (inclusive) and 1 (exclusive)
   */
  next(): number {
    // LCG parameters (same as glibc: a=1103515245, c=12345, m=2^31)
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  /**
   * Generate random integer between min and max (inclusive)
   * @param min - Minimum value (inclusive)
   * @param max - Maximum value (inclusive)
   * @returns Random integer in range [min, max]
   */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

// Global RNG instance (initialized once per test run)
let rngInstance: SeededRandom | null = null;
let currentSeed: number | null = null;

/**
 * Get or initialize the seeded RNG instance
 *
 * Singleton pattern ensures all tests in a run use the same seed.
 * The seed is determined once at first call and logged for reproducibility.
 *
 * Seed sources (in priority order):
 * 1. explicitSeed parameter (when provided by caller)
 * 2. E2E_RNG_SEED env var (for reproducing specific scenarios)
 * 3. Current timestamp (for random exploration)
 *
 * @param explicitSeed - Optional seed value to use instead of reading from environment
 * @returns Singleton SeededRandom instance
 *
 * @example
 * // First call with explicit seed
 * const rng = getRNG(123456);  // Logs: "🎲 Using explicit RNG seed: 123456"
 *
 * // First call without explicit seed
 * const rng = getRNG();  // Logs: "🎲 Generated RNG seed: 1716172800000 (set E2E_RNG_SEED=1716172800000 to reproduce)"
 *
 * // Subsequent calls return same instance
 * const sameRng = getRNG();  // No log, returns existing instance
 */
function getRNG(explicitSeed?: number): SeededRandom {
  if (!rngInstance) {
    // Determine seed from explicit parameter, env var, or timestamp
    if (explicitSeed !== undefined) {
      currentSeed = explicitSeed;
      debug(`🎲 Using explicit RNG seed: ${currentSeed}`);
    } else {
      const envSeed = process.env.E2E_RNG_SEED;
      currentSeed = envSeed ? Number.parseInt(envSeed, 10) : Date.now();

      if (envSeed) {
        debug(`🎲 Using RNG seed from E2E_RNG_SEED: ${currentSeed}`);
      } else {
        debug(
          `🎲 Generated RNG seed: ${currentSeed} (set E2E_RNG_SEED=${currentSeed} to reproduce)`
        );
      }
    }

    rngInstance = new SeededRandom(currentSeed);
  }
  return rngInstance;
}

/**
 * Get the current RNG seed (for logging/debugging)
 *
 * Useful for including seed in test step logs.
 * Returns null if getRNG() hasn't been called yet.
 *
 * @returns Current seed value, or null if not yet initialized
 *
 * @example
 * const seed = getCurrentRNGSeed();
 * debug(`Test running with seed: ${seed}`);
 */
export function getCurrentRNGSeed(): number | null {
  return currentSeed;
}

// ============================================================================
// PAYLOAD TYPE DEFINITIONS (Exported for test reuse)
// Based on SMT Tennis Tournament Play JSON Data Feed Specification v1.9
// ============================================================================

/**
 * Score data for a single set in a match
 */
export interface PayloadScore {
  Score: string; // Game score (e.g., "6", "7")
  TB: string | number; // Tiebreak score (e.g., "7", 7) or "0" for no tiebreak
  Set: number; // Set number (1-5)
  SetWinner: 1 | 2; // Which team won this set (1 or 2)
  Minutes?: string; // Duration of the set in minutes
  DblStats?: Record<string, unknown>; // Detailed statistics (optional)
}

/**
 * Player data within a match
 */
export interface PayloadPlayer {
  ID: string; // Unique player ID (e.g., "ATPA0E2", "WTA310137")
  LastName: string; // Player last name
  Position?: string; // Position in team ("A" for singles, "A"/"B" for doubles)
  FirstName: string; // Player first name
  ShortName: string; // Short name format (e.g., "C. Alcaraz")
  Nationality: string; // Nation tricode (e.g., "ESP", "USA")
}

/**
 * Team data within a match (1 team for singles, each player is a "team")
 */
export interface PayloadTeam {
  Seed: string; // Seed number (e.g., "1", "32") or empty string
  Number?: string; // Team number ("1" or "2")
  Points?: string; // Current points in game
  Scores: PayloadScore[]; // Array of set scores
  OrgCode?: string; // Organization code (for team events)
  OrgName?: string; // Organization name (for team events)
  Players: PayloadPlayer[]; // Array of players (1 for singles, 2 for doubles)
  SetsWon: number; // Number of sets won
  GameScore?: string; // Current game score
  SpeedStats?: Record<string, unknown>; // Serve speed statistics
  EntryStatus: string; // Entry status badge: "WC", "LL", "Q", "SE", "A", or empty
}

/**
 * Individual match data
 */
export interface PayloadMatch {
  ID: string; // Unique match ID (e.g., "MS101", "WS201")
  Event: string; // Event name (e.g., "Men's Singles", "Women's Doubles")
  Teams: PayloadTeam[]; // Array of teams (2 for singles/doubles)
  Server?: string; // Current server indicator
  Status: string; // Match status code
  Umpire?: string | Record<string, unknown>; // Umpire information
  Winner?: number; // Winning team number (0=none, 1=team1, 2=team2)
  MaxSets?: number; // Maximum sets in match (3 or 5)
  EventType?: string; // Event type ("S"=Singles, "D"=Doubles)
  MatchTime?: string; // Total match duration
  RoundName?: string; // Round name (e.g., "1st Round", "Final")
  StartDate?: string; // Match start date
  StartTime?: string; // Match start time
  CurrentSet?: number; // Current set number
  FinishDate?: string; // Match finish date
  FinishTime?: string; // Match finish time
  IsSetPoint?: boolean; // Set point indicator
  IsTiebreak?: boolean; // Tiebreak indicator
  LastSetNum?: number; // Last completed set number
  LineNumber?: string; // Position in draw (e.g., "1"-"64" for first round)
  StatsLevel?: string; // Statistics level indicator
  CurSpeedKMH?: number; // Current serve speed in KMH
  CurSpeedMPH?: number; // Current serve speed in MPH
  LastGameNum?: number; // Last completed game number
  IsBreakPoint?: boolean; // Break point indicator
  IsMatchPoint?: boolean; // Match point indicator
  LastPointNum?: number; // Last completed point number
}

/**
 * Complete EventMatches/Draw payload structure
 */
export interface DrawPayload {
  Name: string; // Tournament name (e.g., "Australian Open")
  Year: string; // Tournament year
  Codes: Array<{ ID: string; Name: string }>; // Status/entry codes reference
  MsgID: string; // Message type: "EventMatches", "AllPlayers", "Schedule"
  Today: string; // Current date (YYYY-MM-DD)
  ATPNum: string; // ATP tournament ID
  WTANum: string; // WTA tournament ID
  Matches: PayloadMatch[]; // Array of all matches in draw
}

/**
 * AllPlayers payload structure
 */
export interface AllPlayersPayload {
  Name: string; // Tournament name (e.g., "Australian Open")
  Year: string; // Tournament year
  MsgID: string; // Message type: "AllPlayers"
  Today: string; // Current date (YYYY-MM-DD)
  ATPNum: string; // ATP tournament ID
  WTANum: string; // WTA tournament ID
  Players: Array<{
    ID: string; // Unique player ID (e.g., "ATPA0E2", "WTA310137")
    FirstName: string;
    LastName: string;
    ShortName: string;
    Nation: string;
    Gender: string;
    [key: string]: unknown; // Additional optional fields
  }>;
}

// ============================================================================
// TEST DATA EXTRACTION INTERFACES
// ============================================================================
export interface PlayerWithBadge {
  shortName: string;
  badge: string; // WC, LL, Q, SE, A
  matchId: string;
  roundName: string;
}

export interface PlayerWithSeed {
  shortName: string;
  seed: string;
  matchId: string;
  roundName: string;
}

export interface MatchupInfo {
  matchId: string;
  roundName: string;
  lineNumber: string;
  team1: {
    seed?: string;
    shortName: string;
    entryStatus?: string;
  };
  team2: {
    seed?: string;
    shortName: string;
    entryStatus?: string;
  };
}

export interface PayloadAnalysis {
  playersWithBadges: PlayerWithBadge[];
  playersWithSeeds: PlayerWithSeed[];
  matchups: MatchupInfo[];
  totalMatches: number;
  totalPlayers: number;
}

export interface PlayerIdValidationResult {
  isValid: boolean;
  missingPlayerIds: string[];
  totalPlayerIdsChecked: number;
  allPlayersCount: number;
}

export interface DrawPayloadInfo {
  filename: string;
  eventName: string;
  totalMatches: number;
}

export interface SOPPayloadInfo {
  filename: string;
  eventName: string;
  totalMatches: number;
}

export interface AllPlayersPayloadInfo {
  filename: string;
  playerCount: number;
  date: string; // "Today" field from payload
}

export interface SchedulePayloadInfo {
  filename: string;
  matchCount: number;
  date: string; // "Today" field from payload
}

/**
 * Schedule match data (within Sessions)
 */
export interface ScheduleMatch {
  Num: number; // Match number in session
  Type: string; // Match type ("S"=Singles, "D"=Doubles, "B"=Blank)
  Order: number; // Order in session
  Status: string; // Match status: "A"=Active, "C"=Cancelled
  Comment: string; // Additional comments
  MatchID: string; // Match identifier
  NotBefore: string; // Not before time
}

/**
 * Parse EventMatches (Draw) payload file and extract player information
 *
 * Reads from this package's payload root at payloads/.
 *
 * @param payloadFilePath - Relative path from payloads/ (e.g., 'draws/2026-02-01 22-48-03.628#0001500584#MS.json')
 * @returns PayloadAnalysis with players, seeds, badges, and matchups
 */
export function parseDrawsPayload(payloadFilePath: string): PayloadAnalysis {
  const payloadPath = path.join(getPayloadRoot(), payloadFilePath);

  if (!fs.existsSync(payloadPath)) {
    throw new Error(`Payload file not found: ${payloadPath}`);
  }

  const payloadContent = fs.readFileSync(payloadPath, 'utf-8');
  const payload: DrawPayload = JSON.parse(payloadContent);

  const playersWithBadges: PlayerWithBadge[] = [];
  const playersWithSeeds: PlayerWithSeed[] = [];
  const matchups: MatchupInfo[] = [];

  // Iterate through all matches
  for (const match of payload.Matches) {
    const matchInfo: MatchupInfo = {
      matchId: match.ID,
      roundName: match.RoundName || '',
      lineNumber: match.LineNumber || '',
      team1: {
        shortName: '',
        seed: undefined,
        entryStatus: undefined,
      },
      team2: {
        shortName: '',
        seed: undefined,
        entryStatus: undefined,
      },
    };

    // Process each team in the match
    match.Teams.forEach((team: PayloadTeam, teamIndex: number) => {
      // Skip teams without player data (blank draws)
      if (!team.Players || team.Players.length === 0) {
        return;
      }

      const player: PayloadPlayer = team.Players[0]; // Singles - one player per team
      const shortName = player.ShortName;
      const seed = team.Seed;
      const entryStatus = team.EntryStatus;

      // Store in matchInfo
      if (teamIndex === 0) {
        matchInfo.team1.shortName = shortName;
        matchInfo.team1.seed = seed;
        matchInfo.team1.entryStatus = entryStatus;
      } else {
        matchInfo.team2.shortName = shortName;
        matchInfo.team2.seed = seed;
        matchInfo.team2.entryStatus = entryStatus;
      }

      // Collect players with entry status badges
      if (entryStatus && entryStatus !== '') {
        playersWithBadges.push({
          shortName,
          badge: entryStatus,
          matchId: match.ID,
          roundName: match.RoundName || '',
        });
      }

      // Collect players with seeds
      if (seed && seed !== '') {
        playersWithSeeds.push({
          shortName,
          seed: seed,
          matchId: match.ID,
          roundName: match.RoundName || '',
        });
      }
    });

    // Store matchups from all rounds (not just 1st Round) to support events with different round structures
    // (e.g., AO Legends uses "AO Legends" round, Boys' Wheelchair Doubles uses "Final")
    if (matchInfo.team1.shortName && matchInfo.team2.shortName) {
      matchups.push(matchInfo);
    }
  }

  return {
    playersWithBadges,
    playersWithSeeds,
    matchups,
    totalMatches: payload.Matches.length,
    totalPlayers:
      payload.Matches.filter((m: PayloadMatch) => m.RoundName === '1st Round').length * 2,
  };
}

/**
 * Combine analysis from multiple payload files (e.g., Men's and Women's)
 */
export function combinePayloadAnalyses(...analyses: PayloadAnalysis[]): PayloadAnalysis {
  const combined: PayloadAnalysis = {
    playersWithBadges: [],
    playersWithSeeds: [],
    matchups: [],
    totalMatches: 0,
    totalPlayers: 0,
  };

  for (const analysis of analyses) {
    combined.playersWithBadges.push(...analysis.playersWithBadges);
    combined.playersWithSeeds.push(...analysis.playersWithSeeds);
    combined.matchups.push(...analysis.matchups);
    combined.totalMatches += analysis.totalMatches;
    combined.totalPlayers += analysis.totalPlayers;
  }

  return combined;
}

/**
 * Parse AllPlayers payload and extract player IDs
 *
 * Reads from this package's payload root at payloads/.
 *
 * @param payloadFilePath - Relative path from payloads/ (e.g., 'players/2026-01-30 23-47-01.105#0001472836.json')
 * @returns Set of player IDs from the payload
 */
export function parseAllPlayersPayload(payloadFilePath: string): Set<string> {
  const payloadPath = path.join(getPayloadRoot(), payloadFilePath);

  if (!fs.existsSync(payloadPath)) {
    throw new Error(`AllPlayers payload file not found: ${payloadPath}`);
  }

  const payloadContent = fs.readFileSync(payloadPath, 'utf-8');
  const payload: AllPlayersPayload = JSON.parse(payloadContent);

  if (payload.MsgID !== 'AllPlayers') {
    throw new Error(`Invalid payload type. Expected "AllPlayers", got "${payload.MsgID}"`);
  }

  const playerIds = new Set<string>();
  for (const player of payload.Players) {
    playerIds.add(player.ID);
  }

  return playerIds;
}

/**
 * Validate that all player IDs in draw payloads exist in AllPlayers payload
 *
 * Reads from this package's payload root at payloads/.
 *
 * @param allPlayersFilePath - Relative path to AllPlayers payload (e.g., 'players/2026-01-30 23-47-01.105#0001472836.json')
 * @param drawPayloadFilePaths - Array of relative paths to draw payloads (e.g., ['draws/2026-02-01 22-48-03.628#0001500584#MS.json'])
 * @returns PlayerIdValidationResult with validation status and missing player IDs
 */
export function validatePlayerIdsExist(
  allPlayersFilePath: string,
  drawPayloadFilePaths: string[]
): PlayerIdValidationResult {
  // Parse AllPlayers to get valid player IDs
  const validPlayerIds = parseAllPlayersPayload(allPlayersFilePath);

  // Collect all player IDs from draw payloads
  const playerIdsInDraws = new Set<string>();
  const missingPlayerIds: string[] = [];

  for (const drawFilePath of drawPayloadFilePaths) {
    const payloadPath = path.join(getPayloadRoot(), drawFilePath);

    if (!fs.existsSync(payloadPath)) {
      throw new Error(`Draw payload file not found: ${payloadPath}`);
    }

    const payloadContent = fs.readFileSync(payloadPath, 'utf-8');
    const payload: DrawPayload = JSON.parse(payloadContent);

    if (payload.MsgID !== 'EventMatches') {
      throw new Error(`Invalid payload type. Expected "EventMatches", got "${payload.MsgID}"`);
    }

    // Extract player IDs from all matches
    for (const match of payload.Matches) {
      for (const team of match.Teams) {
        // Skip teams without players (BYE matches, placeholder matches)
        if (!team.Players || !Array.isArray(team.Players)) {
          continue;
        }

        for (const player of team.Players) {
          playerIdsInDraws.add(player.ID);

          // Check if player ID exists in AllPlayers
          if (!validPlayerIds.has(player.ID)) {
            if (!missingPlayerIds.includes(player.ID)) {
              missingPlayerIds.push(player.ID);
            }
          }
        }
      }
    }
  }

  return {
    isValid: missingPlayerIds.length === 0,
    missingPlayerIds,
    totalPlayerIdsChecked: playerIdsInDraws.size,
    allPlayersCount: validPlayerIds.size,
  };
}

/**
 * Discover all Draw (EventMatches) payload files in payloads/draws/.
 *
 * Naming scheme: YYYY-MM-DD HH-MM-SS.mmm#NNNNNNNNNN#EVENTCODE.json (3 segments)
 * Example: 2026-02-01 22-48-03.628#0001500584#MS.json
 *
 * @param pattern - Optional regex pattern to filter filenames (default: matches timestamp#uniquestring#EVENTCODE.json pattern)
 * @returns Array of DrawPayloadInfo with filename (including 'draws/' prefix), event name, and match count
 */
export function discoverDrawPayloads(pattern?: RegExp): DrawPayloadInfo[] {
  const payloadsDir = path.join(getPayloadRoot(), 'draws');
  const drawPayloads: DrawPayloadInfo[] = [];

  if (!fs.existsSync(payloadsDir)) {
    throw new Error(`Payloads directory not found: ${payloadsDir}`);
  }

  const files = fs.readdirSync(payloadsDir);
  // Match pattern: timestamp#uniquestring#EVENTCODE.json where EVENTCODE is 2-3 letter event code (MS, WS, MD, etc.)
  const defaultPattern = /^\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.\d{3}#\d+#[A-Z]{2,3}\.json$/;
  const filePattern = pattern || defaultPattern;

  for (const file of files) {
    // Filter by pattern
    if (!filePattern.test(file)) {
      continue;
    }

    const filePath = path.join(payloadsDir, file);

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const payload = JSON.parse(content);

      // Only include EventMatches (Draw) payloads with actual player data
      if (payload.MsgID === 'EventMatches' && payload.Matches && payload.Matches.length > 0) {
        const eventName = payload.Matches[0].Event.trim(); // Trim whitespace from event name

        // Check if at least one match has player data (filter out blank draws)
        const hasPlayerData = payload.Matches.some(
          (match: PayloadMatch) =>
            match.Teams &&
            match.Teams.some((team: PayloadTeam) => team.Players && team.Players.length > 0)
        );

        if (hasPlayerData) {
          drawPayloads.push({
            filename: `draws/${file}`,
            eventName,
            totalMatches: payload.Matches.length,
          });
        }
      }
    } catch (error) {
      // Skip files that can't be parsed or don't have expected structure
      console.warn(`Skipping file ${file}: ${error}`);
    }
  }

  return drawPayloads;
}

/**
 * Sample a representative subset of draw payloads for faster testing.
 * Uses SEEDED RANDOM selection for reproducible test discovery by Playwright.
 * The seed is determined by E2E_RNG_SEED (or timestamp if not set).
 *
 * Selects 5 events that cover different categories:
 * 1. Random qualifying singles event (MQ or WQ)
 * 2. Random main singles event (MS or WS)
 * 3. Random main doubles event (MD, WD, or XD)
 * 4. Random AO Legends event (Men's, Women's, or Mixed Doubles)
 * 5. Random event from remaining events not already sampled
 *
 * The same seed will always produce the same 5 events, ensuring:
 * - Test discovery phase and execution phase select identical events
 * - Test titles remain consistent (no "Test not found" errors)
 * - Different seeds test different event combinations
 *
 * @param allPayloads - Full array of discovered draw payloads
 * @param seed - Optional explicit seed for RNG (if not provided, uses E2E_RNG_SEED or timestamp)
 * @returns Sampled array of 5 DrawPayloadInfo objects (or fewer if categories not available)
 *
 * @example
 * // Normal run (random seed from timestamp)
 * const sampled = sampleDrawPayloadsForTesting(allPayloads);
 *
 * // With explicit seed for deterministic sampling
 * const sampled = sampleDrawPayloadsForTesting(allPayloads, 123456);
 *
 * // Reproduce specific event selection
 * // E2E_RNG_SEED=1716172800000 npm test
 */
export function sampleDrawPayloadsForTesting(
  allPayloads: DrawPayloadInfo[],
  seed?: number
): DrawPayloadInfo[] {
  const sampled: DrawPayloadInfo[] = [];
  const rng = getRNG(seed); // Get seeded RNG instance with optional explicit seed

  // Helper: seeded random choice from array (deterministic for same seed)
  const seededChoice = <T>(arr: T[]): T | undefined => {
    if (arr.length === 0) return undefined;
    const index = rng.int(0, arr.length - 1);
    return arr[index]; // Deterministic for same seed, varies across seeds
  };

  // 1. Random qualifying singles event (Men's or Women's)
  const qualifyingEvents = allPayloads.filter(
    (p) =>
      p.eventName.toLowerCase().includes('qualifying') &&
      p.eventName.toLowerCase().includes('singles')
  );
  const qualifyingChoice = seededChoice(qualifyingEvents);
  if (qualifyingChoice) sampled.push(qualifyingChoice);

  // 2. Random main singles event (Men's or Women's)
  const mainSinglesEvents = allPayloads.filter(
    (p) =>
      p.eventName.toLowerCase() === "men's singles" ||
      p.eventName.toLowerCase() === "women's singles"
  );
  const mainSinglesChoice = seededChoice(mainSinglesEvents);
  if (mainSinglesChoice) sampled.push(mainSinglesChoice);

  // 3. Random main doubles event (Men's, Women's, or Mixed)
  const mainDoublesEvents = allPayloads.filter(
    (p) =>
      (p.eventName.toLowerCase() === "men's doubles" ||
        p.eventName.toLowerCase() === "women's doubles" ||
        p.eventName.toLowerCase() === 'mixed doubles') &&
      !p.eventName.toLowerCase().includes('legends')
  );
  const mainDoublesChoice = seededChoice(mainDoublesEvents);
  if (mainDoublesChoice) sampled.push(mainDoublesChoice);

  // 4. Random AO Legends' Cup event
  const legendsEvents = allPayloads.filter((p) => p.eventName.toLowerCase().includes('legends'));
  const legendsChoice = seededChoice(legendsEvents);
  if (legendsChoice) sampled.push(legendsChoice);

  // 5. Random event from remaining events not already sampled
  const sampledEventNames = new Set(sampled.map((p) => p.eventName));
  const remainingEvents = allPayloads.filter((p) => !sampledEventNames.has(p.eventName));
  const remainingChoice = seededChoice(remainingEvents);
  if (remainingChoice) sampled.push(remainingChoice);

  return sampled;
}

/**
 * Discover all SOP (Start of Play) payload files in payloads/sop/.
 *
 * SOP files are EventMatches payloads WITHOUT player data (bracket structure templates)
 * Example: Test-SOP-MD1.json, Test-Draw-0-SOP.json
 *
 * @param pattern - Optional regex pattern to filter filenames (default: matches files with "SOP" in name)
 * @returns Array of SOPPayloadInfo with filename (including 'sop/' prefix), event name, and match count
 */
export function discoverSOPPayloads(pattern?: RegExp): SOPPayloadInfo[] {
  const payloadsDir = path.join(getPayloadRoot(), 'sop');
  const sopPayloads: SOPPayloadInfo[] = [];

  if (!fs.existsSync(payloadsDir)) {
    throw new Error(`Payloads directory not found: ${payloadsDir}`);
  }

  const files = fs.readdirSync(payloadsDir);
  const defaultPattern = /SOP.*\.json$/i;
  const filePattern = pattern || defaultPattern;

  for (const file of files) {
    // Filter by pattern
    if (!filePattern.test(file)) {
      continue;
    }

    const filePath = path.join(payloadsDir, file);

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const payload = JSON.parse(content);

      // Only include EventMatches (SOP) payloads WITHOUT player data (template structure)
      if (payload.MsgID === 'EventMatches' && payload.Matches && payload.Matches.length > 0) {
        const eventName = (payload.Matches[0].Event || 'Unknown Event').trim(); // Trim whitespace

        // Check that all matches have NO player data (empty templates)
        const isSOPTemplate = payload.Matches.every(
          (match: PayloadMatch) =>
            !match.Teams ||
            match.Teams.every((team: PayloadTeam) => !team.Players || team.Players.length === 0)
        );

        if (isSOPTemplate) {
          sopPayloads.push({
            filename: `sop/${file}`,
            eventName,
            totalMatches: payload.Matches.length,
          });
        }
      }
    } catch (error) {
      // Skip files that can't be parsed or don't have expected structure
      console.warn(`Skipping file ${file}: ${error}`);
    }
  }

  return sopPayloads;
}

/**
 * Discover all AllPlayers payload files in payloads/players/.
 *
 * Naming scheme: YYYY-MM-DD HH-MM-SS.mmm#NNNNNNNNNN.json (2 segments, NO third segment)
 * Example: 2026-01-30 23-47-01.105#0001472836.json
 *
 * @param pattern - Optional regex pattern to filter files (default: matches timestamp#uniquestring.json pattern with NO third segment)
 * @returns Array of AllPlayersPayloadInfo with filename (including 'players/' prefix), player count, and date
 */
export function discoverAllPlayersPayloads(pattern?: RegExp): AllPlayersPayloadInfo[] {
  const payloadsDir = path.join(getPayloadRoot(), 'players');
  const allPlayersPayloads: AllPlayersPayloadInfo[] = [];

  if (!fs.existsSync(payloadsDir)) {
    throw new Error(`Payloads directory not found: ${payloadsDir}`);
  }

  const files = fs.readdirSync(payloadsDir);
  // Match pattern: timestamp#uniquestring.json (exactly 2 segments, no third segment after second #)
  const defaultPattern = /^\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.\d{3}#\d+\.json$/;
  const filePattern = pattern || defaultPattern;

  for (const file of files) {
    if (!filePattern.test(file)) {
      continue;
    }

    const filePath = path.join(payloadsDir, file);

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const payload = JSON.parse(content);

      // Only include AllPlayers payloads with player data
      if (payload.MsgID === 'AllPlayers' && payload.Players && payload.Players.length > 0) {
        allPlayersPayloads.push({
          filename: `players/${file}`,
          playerCount: payload.Players.length,
          date: payload.Today || '',
        });
      }
    } catch (error) {
      console.warn(`Skipping file ${file}: ${error}`);
    }
  }

  return allPlayersPayloads;
}

/**
 * Select the best AllPlayers payload (most complete/recent)
 * @param payloads - Array of discovered AllPlayers payloads
 * @returns Filename of the best payload, or null if none found
 */
export function selectBestAllPlayersPayload(payloads: AllPlayersPayloadInfo[]): string | null {
  if (payloads.length === 0) {
    return null;
  }

  // Sort by player count (descending) to get the most complete dataset
  // If counts are equal, sort by date (descending) to get the most recent
  const sorted = [...payloads].sort((a, b) => {
    if (b.playerCount !== a.playerCount) {
      return b.playerCount - a.playerCount;
    }
    return b.date.localeCompare(a.date);
  });

  return sorted[0].filename;
}

/**
 * Discover all Schedule payload files in payloads/schedule/.
 *
 * Naming scheme: YYYY-MM-DD HH-MM-SS.mmm#NNNNNNNNNN#YYYY-MM-DD.json (3 segments, third is a date)
 * Example: 2026-01-12 17-29-41.953#0000081953#2026-01-12.json
 *
 * @param pattern - Optional regex pattern to filter files (default: matches timestamp#uniquestring#DATE.json pattern)
 * @returns Array of SchedulePayloadInfo with filename (including 'schedule/' prefix), match count, and date
 */
export function discoverSchedulePayloads(pattern?: RegExp): SchedulePayloadInfo[] {
  const payloadsDir = path.join(getPayloadRoot(), 'schedule');
  const schedulePayloads: SchedulePayloadInfo[] = [];

  if (!fs.existsSync(payloadsDir)) {
    throw new Error(`Payloads directory not found: ${payloadsDir}`);
  }

  const files = fs.readdirSync(payloadsDir);
  // Match pattern: timestamp#uniquestring#DATE.json where DATE is YYYY-MM-DD format
  const defaultPattern = /^\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.\d{3}#\d+#\d{4}-\d{2}-\d{2}\.json$/;
  const filePattern = pattern || defaultPattern;

  for (const file of files) {
    if (!filePattern.test(file)) {
      continue;
    }

    const filePath = path.join(payloadsDir, file);

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const payload = JSON.parse(content);

      // Only include Schedule payloads with match data
      if (payload.MsgID === 'Schedule' && payload.Day && payload.Day.Courts) {
        // Count only Active matches (exclude Cancelled with Status 'C')
        let matchCount = 0;
        for (const court of payload.Day.Courts) {
          for (const session of court.Sessions || []) {
            const activeMatches = (session.Matches || []).filter(
              (match: ScheduleMatch) => match.Status !== 'C'
            );
            matchCount += activeMatches.length;
          }
        }

        if (matchCount > 0) {
          schedulePayloads.push({
            filename: `schedule/${file}`,
            matchCount: matchCount,
            date: payload.Today || payload.Day.Date || '',
          });
        }
      }
    } catch (error) {
      console.warn(`Skipping file ${file}: ${error}`);
    }
  }

  return schedulePayloads;
}

/**
 * Select the best Schedule payload (most complete/recent)
 * @param payloads - Array of discovered Schedule payloads
 * @returns Filename of the best payload, or null if none found
 */
export function selectBestSchedulePayload(payloads: SchedulePayloadInfo[]): string | null {
  if (payloads.length === 0) {
    return null;
  }

  // Sort by match count (descending) to get the most complete dataset
  // If counts are equal, sort by date (descending) to get the most recent
  const sorted = [...payloads].sort((a, b) => {
    if (b.matchCount !== a.matchCount) {
      return b.matchCount - a.matchCount;
    }
    return b.date.localeCompare(a.date);
  });

  return sorted[0].filename;
}
