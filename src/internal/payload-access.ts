import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = dirname(fileURLToPath(import.meta.url));

function getPackageRoot(): string {
  return resolve(moduleDir, '..', '..');
}

/** Absolute path to this package's payload root. */
export function getPayloadRoot(): string {
  return resolve(getPackageRoot(), 'payloads');
}