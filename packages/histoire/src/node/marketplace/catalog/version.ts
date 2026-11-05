import { compare, satisfies, valid, validRange } from 'semver'

/** Compare exact versions, including numeric prerelease ordering; return 0 if either is invalid. */
export function compareVersions(left: string, right: string): number {
  // Keep malformed registry metadata non-throwing for sorting and update callers.
  if (!valid(left) || !valid(right)) return 0
  return compare(left, right)
}

/** Evaluate npm ranges with default prerelease exclusion; return false for invalid inputs. */
export function satisfiesVersion(version: string, range: string): boolean {
  if (!valid(version) || validRange(range) === null) return false
  return satisfies(version, range, { includePrerelease: false })
}
