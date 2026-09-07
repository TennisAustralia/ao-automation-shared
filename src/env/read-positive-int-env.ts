/**
 * Reads an env var and returns its integer value when it is finite and > 0,
 * otherwise returns `fallback`. Guards against NaN, Infinity, and non-numeric
 * strings that would silently break setTimeout / polling-loop comparisons.
 */
export type ReadPositiveIntEnv = (name: string, fallback: number) => number

export const readPositiveIntEnv: ReadPositiveIntEnv = (name: string, fallback: number): number => {
  const raw = process.env[name]
  if (!raw) {
    return fallback
  }
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}
