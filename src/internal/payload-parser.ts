import { loadLatestDrawPayload } from './payload-discovery.js';
import type { DrawPayload, PayloadMatch, PayloadPlayer, PayloadTeam } from '../tournament/draws-payload-parser.js';

export function loadDrawPayloadByEvent(eventName: string): DrawPayload {
  return loadLatestDrawPayload(eventName);
}

export function getRoundMatches(eventName: string, roundName: string): PayloadMatch[] {
  const payload = loadDrawPayloadByEvent(eventName);
  return payload.Matches.filter((match) => match.RoundName?.trim() === roundName.trim());
}

export function getFirstRoundMatch(eventName: string, roundName: string): PayloadMatch {
  const match = getRoundMatches(eventName, roundName)[0];
  if (!match) {
    throw new Error(`No matches found for event ${eventName} in round ${roundName}`);
  }

  return match;
}

export function buildTeamDisplayName(team: PayloadTeam): string {
  const players = team.Players ?? [];
  const names = players
    .map((player: PayloadPlayer) => player.ShortName?.trim() || buildPlayerFallbackName(player))
    .filter((value): value is string => Boolean(value));

  if (names.length > 0) {
    return names.join(' / ');
  }

  if (team.OrgName?.trim()) {
    return team.OrgName.trim();
  }

  if (team.OrgCode?.trim()) {
    return team.OrgCode.trim();
  }

  return 'TBD';
}

function buildPlayerFallbackName(player: PayloadPlayer): string {
  const firstName = player.FirstName?.trim();
  const lastName = player.LastName?.trim();
  return [firstName, lastName].filter(Boolean).join(' ').trim();
}

export function getAllMatches(eventName: string): PayloadMatch[] {
  return loadDrawPayloadByEvent(eventName).Matches;
}