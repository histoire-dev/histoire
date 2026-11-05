import type { JobState } from '@histoire/shared'
import type { RegistryOptions } from '../catalog/registry.js'
import { officialPlugins, officialReleases } from '../catalog/official.js'
import { registryRelease } from '../catalog/registry-entry.js'
import { createRegistryClient } from '../catalog/registry.js'
import { compareVersions, satisfiesVersion } from '../catalog/version.js'
import { sanitizeOutput } from './output.js'

/** Parsed external package-manager failure and optional peer context. */
export interface ParsedFailure {
  /** Locked public failure category. */ code: NonNullable<JobState['failure']>['code']
  /** Short sanitized user-facing error. */ message: string
  /** Unmet peer package. */ peer?: string
  /** Actual peer version in the project. */ found?: string
}

/** Recognizes common pnpm/npm/yarn/bun codes without exposing raw stderr as UI copy. */
export function parseFailure(output: string): ParsedFailure {
  if (/ERR_PNPM_PEER_DEP_ISSUES|ERESOLVE|incorrect peer dependency|YN0060|incompatible peer/i.test(output)) {
    const unmet = /unmet peer ([^:\r\n]+):\s*found\s+([\w.+-]+)/i.exec(output)
    const pnpm = unmet && [unmet[0], unmet[1].slice(0, unmet[1].lastIndexOf('@')), unmet[2]]
    const npm = /Found:\s*([\w@/.-]+)@(\d+\.\d+\.\d+(?:-[\w.-]+)?)/i.exec(output)
    const peer = pnpm ?? npm
    return { code: 'peer-conflict', message: 'Package peer dependencies conflict', peer: peer?.[1], found: peer?.[2] }
  }
  if (/E404|ERR_PNPM_FETCH_404|404 Not Found|package.*not found/i.test(output)) return { code: 'not-found', message: 'Package version was not found' }
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network|ENETUNREACH/i.test(output)) return { code: 'network', message: 'Package registry could not be reached' }
  return { code: 'unknown', message: 'Package command failed. Check the output or run the command manually.' }
}

/** Selects the newest validated stable release accepting the actual unmet peer version. */
export async function suggestVersion(root: string, id: string, failure: ParsedFailure, options?: RegistryOptions): Promise<NonNullable<JobState['failure']>['suggestion']> {
  if (!failure.peer || !failure.found) return
  try {
    if (officialPlugins.some(entry => entry.id === id && entry.official)) {
      const release = officialReleases(id).sort((a, b) => compareVersions(b.latest, a.latest)).find(release => !release.latest.includes('-') && release.requires[failure.peer!] && satisfiesVersion(failure.found!, release.requires[failure.peer!]))
      if (release) return { version: release.latest, reason: sanitizeOutput(`Last version that supports ${failure.peer} ${failure.found.split('.')[0]}`) }
      return
    }
    const { value } = await createRegistryClient(root, options).packument(id)
    const release = Object.keys(value.versions).sort((a, b) => compareVersions(b, a)).map(version => registryRelease(value, version)).find(release => release && !release.deprecated && !release.version.includes('-') && release.detail.requires[failure.peer!] && satisfiesVersion(failure.found!, release.detail.requires[failure.peer!]))
    if (release) return { version: release.version, reason: sanitizeOutput(`Last version that supports ${failure.peer} ${failure.found.split('.')[0]}`) }
  }
  catch { /* Failure advice is optional and must not delay or reverse rollback. */ }
}
