import type { CatalogEntry } from '@histoire/shared'
import type { ProjectSignals } from './signals.js'
import { satisfiesVersion } from './version.js'

/** First failing declared requirement, using installed versions rather than ranges. */
export function compatibility(requires: Record<string, string>, frameworks: string[], project: ProjectSignals, histoireVersion: string): CatalogEntry['compatible'] {
  if (requires.histoire && !satisfiesVersion(histoireVersion, requires.histoire)) return { ok: false, reason: `Needs histoire ${requires.histoire}` }
  if (frameworks.length && !frameworks.some(framework => project.project.frameworks.includes(framework))) return { ok: false, reason: `Needs ${frameworks.join(' or ')}` }
  for (const [name, range] of Object.entries(requires)) {
    if (name !== 'histoire' && (!project.versions[name] || !satisfiesVersion(project.versions[name], range))) return { ok: false, reason: `Needs ${name} ${range}` }
  }
  return { ok: true }
}
