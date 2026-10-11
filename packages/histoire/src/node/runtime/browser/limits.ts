/** Shared screenshot limits; transport adapters reuse these exact bounds. */
export const CAPTURE_LIMITS = Object.freeze({
  /** Whole capture budget, including acquisition and ready document settling. */
  previewTimeoutMs: 30_000,
  /** One candidate's launch and neutral probe share this bounded budget. */
  browserCandidateTimeoutMs: 3_000,
  /** Explicit setup checks share this total acquisition deadline. */
  setupCheckTimeoutMs: 15_000,
  /** PNG byte limit remains independent of device pixel dimensions. */
  artifactBytes: 4 * 1024 * 1024,
  /** Minimum positive CSS viewport width. */
  minWidth: 1,
  /** Minimum positive CSS viewport height. */
  minHeight: 1,
  /** Maximum CSS viewport width. */
  width: 3840,
  /** Maximum CSS viewport height. */
  height: 2160,
  /** Maximum integer device scale. */
  deviceScaleFactor: 3,
})
