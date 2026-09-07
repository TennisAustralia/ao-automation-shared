import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getEventCode } from '../tournament/event-codes.js';
import type { DrawPayload, PayloadMatch, PayloadTeam } from '../tournament/draws-payload-parser.js';
import { getPayloadRoot } from './payload-access.js';

const DRAW_FILE_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.\d{3}#\d+#[A-Z]{2,3}\.json$/;

export interface DrawPayloadFileInfo {
  fileName: string;
  fullPath: string;
  eventCode: string;
}

export function discoverDrawPayloadFiles(): DrawPayloadFileInfo[] {
  const drawsDir = join(getPayloadRoot(), 'draws');

  return readdirSync(drawsDir)
    .filter((fileName) => DRAW_FILE_PATTERN.test(fileName))
    .map((fileName) => ({
      fileName,
      fullPath: join(drawsDir, fileName),
      eventCode: fileName.slice(fileName.lastIndexOf('#') + 1, -'.json'.length)
    }))
    .sort((left, right) => right.fileName.localeCompare(left.fileName));
}

export function findLatestDrawPayloadFile(eventName: string): DrawPayloadFileInfo {
  const eventCode = getEventCode(eventName);
  if (!eventCode) {
    throw new Error(`Unknown draw event name: ${eventName}`);
  }

  const match = discoverDrawPayloadFiles().find((file) => file.eventCode === eventCode);
  if (!match) {
    throw new Error(`No draw payload found for event ${eventName} (${eventCode})`);
  }

  return match;
}

export function hasAnyPlayerData(payload: DrawPayload): boolean {
  return payload.Matches.some(
    (match: PayloadMatch) => match.Teams?.some((team: PayloadTeam) => (team.Players?.length ?? 0) > 0)
  );
}

export function loadLatestDrawPayload(eventName: string): DrawPayload {
  const file = findLatestDrawPayloadFile(eventName);
  const payload = JSON.parse(readFileSync(file.fullPath, 'utf8')) as DrawPayload;

  if (payload.MsgID !== 'EventMatches') {
    throw new Error(`Invalid draw payload type for ${file.fileName}: ${payload.MsgID}`);
  }

  if (!Array.isArray(payload.Matches)) {
    throw new Error(`Draw payload is missing Matches array: ${file.fileName}`);
  }

  return payload;
}