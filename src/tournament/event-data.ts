/**
 * Tennis Event Data Constants
 *
 * Event codes, categories, and classifications for tournament draws.
 * Used for match ID prefixes, filtering, and categorization.
 *
 * Match IDs follow format: [EVENT_CODE][MATCH_NUMBER] (e.g., MS101, WS201)
 */

/**
 * Event code mappings for all tournament events
 * Maps full event names to their match ID prefixes
 */
export const EVENT_CODES: Record<string, string> = {
  // Main Draw Singles
  "Men's Singles": 'MS',
  "Women's Singles": 'WS',

  // Main Draw Doubles
  "Men's Doubles": 'MD',
  "Women's Doubles": 'WD',
  'Mixed Doubles': 'XD',

  // Qualifying Events
  "Men's Qualifying Singles": 'MQ',
  "Women's Qualifying Singles": 'WQ',

  // Junior Events
  "Junior Boys' Singles": 'BS',
  "Junior Girls' Singles": 'GS',
  "Junior Boys' Doubles": 'BD',
  "Junior Girls' Doubles": 'GD',

  // Wheelchair Events - Singles
  "Men's Wheelchair Singles": 'CS',
  "Women's Wheelchair Singles": 'DS',
  'Quad Wheelchair Singles': 'US',
  "Boys' Wheelchair Singles": 'JW',
  "Girls' Wheelchair Singles": 'WM',

  // Wheelchair Events - Doubles
  "Men's Wheelchair Doubles": 'CD',
  "Women's Wheelchair Doubles": 'DD',
  'Quad Wheelchair Doubles': 'UD',
  "Boys' Wheelchair Doubles": 'SL',
  "Girls' Wheelchair Doubles": 'GW',

  // Wheelchair Qualifying
  "Men's Wheelchair Singles Qualifying": 'CQ',
  "Women's Wheelchair Singles Qualifying": 'DQ',
  'Quad Wheelchair Singles Qualifying': 'UQ',

  // Legends Events
  "AO Legends' Cup Men's Doubles": 'LD',
  "AO Legends' Cup Women's Doubles": 'ZD',
  "AO Legends' Cup Mixed Doubles": 'ED',
} as const;

/**
 * Event categories for classification and filtering
 */
export const EVENT_CATEGORIES = {
  /**
   * Main draw events (included in AllPlayers payload validation)
   * These are the primary ATP/WTA professional events
   */
  MAIN_DRAWS: ['MS', 'WS', 'MD', 'WD', 'XD', 'MQ', 'WQ'] as const,

  /**
   * Events used for comprehensive score validation testing
   * Covers singles and doubles across men's/women's/mixed
   */
  SCORE_TEST_EVENTS: [
    "Women's Singles",
    "Men's Singles",
    "Women's Doubles",
    "Men's Doubles",
    'Mixed Doubles',
  ] as const,

  /**
   * Event types excluded from main draw player validation
   * These typically have separate player rosters
   */
  SPECIAL_CATEGORIES: {
    JUNIOR: ['BS', 'GS', 'BD', 'GD'] as const,
    WHEELCHAIR: [
      'CS',
      'DS',
      'US',
      'JW',
      'WM',
      'CD',
      'DD',
      'UD',
      'SL',
      'GW',
      'CQ',
      'DQ',
      'UQ',
    ] as const,
    LEGENDS: ['LD', 'ZD', 'ED'] as const,
  },
} as const;

/**
 * Round names for tournament draw navigation
 * Standard progression through knockout tournament
 */
export const ROUND_NAMES = [
  '1st Round',
  '2nd Round',
  '3rd Round',
  '4th Round',
  'Quarterfinals',
  'Semifinals',
  'Final',
] as const;
