import { createHash, randomUUID } from 'node:crypto'
import { normalize, resolve } from 'pathe'

/**
 * Builds the temp directory owned by a single run.
 *
 * Runs empty their own directory when they start, so a directory shared between
 * runs (a dev-server test run concurrent with a `histoire build`, two CLI runs…)
 * would delete the generated files of any run still in flight.
 * @param root The project root.
 * @param kind Name of the generated artifacts, used as parent directory.
 */
export function getRunTempDir(root: string, kind: string) {
  return resolve(root, '.histoire', 'tmp', kind, `run-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`)
}

/**
 * Produces a short stable disambiguator for a value used inside a generated
 * file name. Generated temp paths sanitize or flatten their source value
 * (`a/b` and `a b` both become `a_b`), so distinct sources can otherwise
 * resolve to the same file and silently overwrite each other.
 * @param value The raw value the temp path is derived from.
 */
export function hashPathSegment(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 8)
}

/** Replaces every character that cannot appear in a generated file name. */
function sanitizeFileSegment(value: string) {
  return value.replace(/[^\w.-]/g, '_')
}

/**
 * Builds the file-name segment a generated file is written under.
 *
 * Always disambiguated by {@link hashPathSegment}: the sanitized form is lossy
 * (`a/b` and `a b` both become `a_b`), so two sources would otherwise be
 * written to the same file and one of them silently dropped from the run.
 * @param value The raw value the segment is derived from.
 * @param sanitize How to turn the raw value into a file-name-safe form.
 */
export function toTempPathSegment(value: string, sanitize: (value: string) => string = sanitizeFileSegment) {
  return `${sanitize(value)}.${hashPathSegment(value)}`
}

/**
 * Throws when two generated temp paths resolve to the same file, which would
 * silently drop one of them from the run.
 * @param entries Generated paths with a human-readable label of their source.
 * @param kind Name of the generated artifact, used in the error message.
 */
export function assertNoDuplicateTempPaths(entries: Array<{ path: string, label: string }>, kind: string) {
  const seen = new Map<string, string>()

  for (const entry of entries) {
    const key = normalize(entry.path)
    const existing = seen.get(key)
    if (existing) {
      throw new Error(
        `Duplicate generated Histoire ${kind} path "${entry.path}" for ${existing} and ${entry.label}.`,
      )
    }
    seen.set(key, entry.label)
  }
}
