/**
 * Tennis Event Code Lookup Functions
 *
 * Helper functions for working with event codes and match ID prefixes.
 * Event data and mappings are imported from constants for centralized management.
 *
 * @see ./event-data.ts for event code definitions
 *
 * @example
 * // Get match prefix for filtering
 * const prefix = getEventCode("Men's Singles"); // Returns "MS"
 * const matchesForEvent = matches.filter(m => m.id.startsWith(prefix));
 *
 * @example
 * // Use type guard for validation
 * if (isValidEventName("Women's Doubles")) {
 *   debug('Valid event');
 * }
 */

import { EVENT_CODES, EVENT_CATEGORIES, ROUND_NAMES } from './event-data.js';

// Re-export for backward compatibility
export { EVENT_CODES, EVENT_CATEGORIES, ROUND_NAMES };

/**
 * Gets the match ID prefix for a given event name
 *
 * @param eventName - Full event name (e.g., "Men's Singles", "Women's Doubles")
 * @returns Match ID prefix (e.g., "MS", "WD") or empty string if event not found
 *
 * @example
 * getEventCode("Men's Singles") // Returns "MS"
 * getEventCode("Unknown Event") // Returns ""
 *
 * @note Automatically trims whitespace from input to handle payload inconsistencies
 */
export function getEventCode(eventName: string): string {
  return EVENT_CODES[eventName.trim()] || '';
}

/**
 * Type guard to check if a string is a valid event name
 *
 * @param eventName - String to check
 * @returns True if eventName exists in EVENT_CODES
 *
 * @example
 * isValidEventName("Men's Singles") // Returns true
 * isValidEventName("Invalid Event") // Returns false
 *
 * @note Automatically trims whitespace from input to handle payload inconsistencies
 */
export function isValidEventName(eventName: string): boolean {
  return eventName.trim() in EVENT_CODES;
}

/**
 * Gets all available event names
 *
 * @returns Array of all event names defined in EVENT_CODES
 *
 * @example
 * const events = getAllEventNames();
 * // Returns ["Men's Singles", "Women's Singles", ...]
 */
export function getAllEventNames(): string[] {
  return Object.keys(EVENT_CODES);
}

/**
 * Gets all available event codes
 *
 * @returns Array of all event code values
 *
 * @example
 * const codes = getAllEventCodes();
 * // Returns ["MS", "WS", "MD", ...]
 */
export function getAllEventCodes(): string[] {
  return Object.values(EVENT_CODES);
}

/**
 * Gets the event name for a given code
 *
 * @param code - Event code (e.g., "MS", "WD")
 * @returns Event name or empty string if code not found
 *
 * @example
 * getEventName("MS") // Returns "Men's Singles"
 * getEventName("XX") // Returns ""
 */
export function getEventName(code: string): string {
  const entry = Object.entries(EVENT_CODES).find(([_, value]) => value === code);
  return entry ? entry[0] : '';
}
