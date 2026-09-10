const requiredModule = require('../dist/tournament/index.js');

const requiredKeys = [
  'getAllDrawEventNames',
  'getAllMatches',
  'getRoundMatches',
  'postPayloadToAPI',
  'verifyDrawsEmptyState',
];

for (const key of requiredKeys) {
  if (!(key in requiredModule)) {
    throw new Error(`Missing required export in CJS require(): ${key}`);
  }
}

console.log('cjs-require-tournament-ok');