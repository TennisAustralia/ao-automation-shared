if (!process.env.E2E_RNG_SEED) {
  // Fallback for Jest/non-WDIO contexts (e.g. watch mode). WDIO sets this before specs load.
  process.env.E2E_RNG_SEED = Date.now().toString()
}

const parsedSeed = Number(process.env.E2E_RNG_SEED)

if (!Number.isSafeInteger(parsedSeed)) {
  throw new Error(
    `Invalid E2E_RNG_SEED value: "${process.env.E2E_RNG_SEED}". Expected an integer.`,
  )
}

export type RngSeed = number

export const rngSeed: RngSeed = parsedSeed
