/** Portable Node artifact format understood by both builder and deployed reader. */
export const ARTIFACT_SCHEMA_VERSION = 1

/** Bound imposed before reading a private manifest into memory. */
export const MAX_ARTIFACT_MANIFEST_BYTES = 16 * 1024 * 1024
