const envModule = require('ao-automation-shared/env');
const tournamentModule = require('ao-automation-shared/tournament');

if (typeof envModule.readPositiveIntEnv !== 'function') {
  throw new Error('Missing required CJS export: readPositiveIntEnv from ao-automation-shared/env');
}

const tournamentRequiredKeys = [
  'getAllDrawEventNames',
  'getAllMatches',
  'getRoundMatches',
  'postPayloadToAPI',
  'verifyDrawsEmptyState',
];

for (const key of tournamentRequiredKeys) {
  if (!(key in tournamentModule)) {
    throw new Error(`Missing required CJS export from ao-automation-shared/tournament: ${key}`);
  }
}

console.log('cjs-require-env-and-tournament-ok');