import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const PACKAGE_NAME = 'ao-automation-shared';

function resolvePackageRootFromRequire(): string | null {
  // In transpiled CommonJS/Jest-like contexts, require.resolve gives us this package root.
  if (typeof require === 'undefined' || typeof require.resolve !== 'function') {
    return null;
  }

  try {
    return dirname(require.resolve('../../package.json'));
  } catch {
    return null;
  }
}

function resolvePackageRootFromCwd(): string | null {
  // Support running from package root and installed consumer repos.
  const candidates = [
    process.cwd(),
    resolve(process.cwd(), 'node_modules', PACKAGE_NAME),
  ];

  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, 'payloads'))) {
      return candidate;
    }
  }

  return null;
}

function getPackageRoot(): string {
  return resolvePackageRootFromRequire() ?? resolvePackageRootFromCwd() ?? process.cwd();
}

/** Absolute path to this package's payload root. */
export function getPayloadRoot(): string {
  return resolve(getPackageRoot(), 'payloads');
}