# ao-automation-shared

Shared Node/TypeScript package for AO automation consumers. It provides a stable package boundary for Draws payload access plus shared env, mail, and RNG helpers used by both web and mobile automation.

## Folder structure

```text
src/
  internal/
    payload-access.ts
    payload-discovery.ts
    payload-parser.ts
  tournament/
    draws-payload-parser.ts
    event-codes.ts
    event-data.ts
    index.ts
  env/
    index.ts
    read-positive-int-env.ts
  mail/
    index.ts
    mail-tm-helper.ts
  random/
    index.ts
    rng-seed.ts
  index.ts
payloads/
  draws/
  players/
  schedule/
  sop/
  scenarios/
```

## Source of truth

- Tournament event metadata and the main draws payload parser: AO_Web_Automation
- Mail.tm helper: ao-mobile-app
- Positive integer env helper: ao-mobile-app
- RNG seed behavior: merged shared behavior for both Playwright and WDIO consumers
- Package-owned payload path/discovery/parser support helpers: implemented in this repo to support installed-package payload resolution and the package's current tournament API

## Domain layout

- `src/tournament/` contains the AO web-derived tournament helpers: `event-data`, `event-codes`, and `draws-payload-parser`.
- `src/internal/` contains package-only support code that does not exist in AO web or mobile. Today that includes payload root resolution plus the package-owned payload discovery/parser helpers used by the tournament API.

This mirrors the current source repos more closely: AO web owns the tournament helper logic, while this package adds only the internal runtime support needed for installed-package payload access.

## Payload storage and resolution

Payloads live inside this package under `payloads/`.

Runtime resolution is package-owned: internal helper code resolves from its own `import.meta.url` back to the installed package root, then reads `payloads/...` from there. Consumers must not assume any sibling-repo layout or rely on `process.cwd()`.

Consumers must not reference sibling repo paths for payload access. Import helpers from this package and let the package resolve its own payload files.

## Public exports

The package currently exposes these subpaths:

- `ao-automation-shared/tournament`
- `ao-automation-shared/env`
- `ao-automation-shared/mail`
- `ao-automation-shared/random`

## Local installation from sibling repos

From a consumer repo, add a file dependency that points at this repository:

```json
{
  "dependencies": {
    "ao-automation-shared": "file:../ao-automation-shared"
  }
}
```

Then install dependencies in the consumer repo with its normal package manager.

## GitHub repo dependency installation

From a consumer repo, add a GitHub dependency instead of a local `file:` path.

Recommended (pin a release tag):

```json
{
  "dependencies": {
    "ao-automation-shared": "github:TennisAustralia/ao-automation-shared#v0.1.0"
  }
}
```

Most reproducible (pin a commit SHA):

```json
{
  "dependencies": {
    "ao-automation-shared": "github:TennisAustralia/ao-automation-shared#<commit-sha>"
  }
}
```

Then run your normal install command in the consumer repo.

Notes:

- Prefer pinning a tag or commit SHA instead of `main` to avoid unexpected changes.
- This package exports from `dist/` and includes a `prepare` script, so install from GitHub will build package artifacts during installation.
- For private repositories, ensure CI/local auth can read the GitHub repo (SSH key or token-based HTTPS access).

## Consumer quickstart (detailed)

Use this flow when a consumer repo should install directly from GitHub.

### 1) Choose how to pin the dependency

- Preferred for team usage: release tag (for example `#v0.1.0`)
- Preferred for strict reproducibility: commit SHA (for example `#a1b2c3d4...`)
- Avoid long-term branch pins like `#main` because behavior can change without a dependency-file change.

### 2) Add dependency using your package manager

`npm`:

```bash
npm pkg set dependencies.ao-automation-shared="github:TennisAustralia/ao-automation-shared#v0.1.0"
npm install
```

`pnpm`:

```bash
pnpm add "github:TennisAustralia/ao-automation-shared#v0.1.0"
```

`yarn`:

```bash
yarn add "github:TennisAustralia/ao-automation-shared#v0.1.0"
```

Alternative explicit form (same outcome):

```json
{
  "dependencies": {
    "ao-automation-shared": "git+ssh://git@github.com/TennisAustralia/ao-automation-shared.git#v0.1.0"
  }
}
```

### 3) Ensure access for private repositories

Local development:

- SSH approach: configure a GitHub SSH key and verify `git ls-remote git@github.com:TennisAustralia/ao-automation-shared.git` succeeds.
- HTTPS/token approach: use a token with repo read access and ensure your package manager can use it for git fetches.

CI:

- Provide a deploy key or GitHub App/token with read access to this repository.
- Ensure CI can execute git-based dependency fetches before lockfile install completes.

### 4) Verify install and imports in consumer repo

After install, verify consumer imports resolve from package subpaths (not from internal file paths):

```ts
import { getEventCode } from 'ao-automation-shared/tournament'
import { readPositiveIntEnv } from 'ao-automation-shared/env'
import { mailTmHelper } from 'ao-automation-shared/mail'
import { rngSeed } from 'ao-automation-shared/random'
```

If TypeScript is used, run typecheck in the consumer repo after install.

### 5) Updating to a new shared-package version

- Tag pin: change `#v0.1.0` to the new tag, then reinstall.
- SHA pin: replace the SHA, then reinstall.
- Commit both `package.json` and lockfile updates in the consumer repo.

### 6) Important behavior notes

- This package publishes runtime entry points from `dist/` via `exports`.
- `prepare` runs on GitHub installs to build `dist` in the installed copy.
- Consumers should only import public subpaths and should not import from `dist/` or `src/` directly.

## Importing from consumers

After installation, import from the package subpaths exposed in `exports`:

- `ao-automation-shared/tournament`
- `ao-automation-shared/env`
- `ao-automation-shared/mail`
- `ao-automation-shared/random`

Do not import from `dist/...` directly in consumer repos.

## Example imports

Web consumer:

```ts
import { getEventCode, discoverSchedulePayloads, parseDrawsPayload } from 'ao-automation-shared/tournament'
import { rngSeed } from 'ao-automation-shared/random'
```

Mobile consumer:

```ts
import { buildTeamDisplayName, getFirstRoundMatch, getPayloadRoot } from 'ao-automation-shared/tournament'
import { readPositiveIntEnv } from 'ao-automation-shared/env'
import { mailTmHelper } from 'ao-automation-shared/mail'
```

## TypeScript type definitions

This package emits declaration files to `dist/**/*.d.ts` during build, and each public export subpath maps to both runtime JavaScript and TypeScript declarations via `package.json` `exports`.

Consumer repos should import types directly from public subpaths and should not maintain local ambient fallback declarations for these modules.

### Exported API reference by subpath

Use this section as the source of truth for consumer imports.

#### `ao-automation-shared/tournament`

Runtime exports:

- `EVENT_CATEGORIES`
- `EVENT_CODES`
- `ROUND_NAMES`
- `getAllEventCodes`
- `getAllEventNames`
- `getEventCode`
- `getEventName`
- `isValidEventName`
- `DRAW_EVENT_CATEGORIES`
- `DRAW_EVENT_CODES`
- `DRAW_ROUND_NAMES`
- `getAllDrawEventCodes`
- `getAllDrawEventNames`
- `getDrawEventCode`
- `getDrawEventName`
- `isValidDrawEventName`
- `combinePayloadAnalyses`
- `discoverAllPlayersPayloads`
- `discoverDrawPayloads`
- `discoverSOPPayloads`
- `discoverSchedulePayloads`
- `getCurrentRNGSeed`
- `parseAllPlayersPayload`
- `parseDrawsPayload`
- `sampleDrawPayloadsForTesting`
- `selectBestAllPlayersPayload`
- `selectBestSchedulePayload`
- `validatePlayerIdsExist`
- `getPayloadRoot`
- `discoverDrawPayloadFiles`
- `findLatestDrawPayloadFile`
- `hasAnyPlayerData`
- `buildTeamDisplayName`
- `getAllMatches`
- `getFirstRoundMatch`
- `getRoundMatches`
- `loadDrawPayloadByEvent`

Type exports:

- `AllPlayersPayload`
- `AllPlayersPayloadInfo`
- `DrawPayload`
- `DrawPayloadInfo`
- `MatchupInfo`
- `PayloadAnalysis`
- `PayloadMatch`
- `PayloadPlayer`
- `PayloadScore`
- `PayloadTeam`
- `PlayerIdValidationResult`
- `PlayerWithBadge`
- `PlayerWithSeed`
- `ScheduleMatch`
- `SchedulePayloadInfo`
- `SOPPayloadInfo`

#### `ao-automation-shared/env`

Runtime exports:

- `readPositiveIntEnv`

Type exports:

- `ReadPositiveIntEnv`

#### `ao-automation-shared/mail`

Runtime exports:

- `MailTmHelper`
- `mailTmHelper`

Type exports:

- `MailTmAccount`

#### `ao-automation-shared/random`

Runtime exports:

- `rngSeed`

Type exports:

- `RngSeed`

Example type imports:

```ts
import type { DrawPayload, PayloadMatch, PayloadTeam } from 'ao-automation-shared/tournament'
import type { MailTmAccount } from 'ao-automation-shared/mail'
```

Runtime + type import example:

```ts
import { getFirstRoundMatch } from 'ao-automation-shared/tournament'
import type { PayloadMatch } from 'ao-automation-shared/tournament'

const match: PayloadMatch = getFirstRoundMatch("Men's Singles", '1st Round')
void match
```

## Maintenance

- Keep AO web-derived tournament source files under `src/tournament/`.
- Keep package-only compatibility or runtime helpers under `src/internal/`.
- Keep shared logic package-focused and avoid consumer-specific runner setup.
- If copying logic from web or mobile, preserve the source-of-truth note in this README and keep package adaptations limited to required module-path or payload-resolution changes.