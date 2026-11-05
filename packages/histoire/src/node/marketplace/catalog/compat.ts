import type { CatalogEntry, PluginDetail } from '@histoire/shared'
import type { ProjectSignals } from './signals.js'
import { readHistoireVersion } from '../../mcp/package-version.js'
import { satisfiesVersion } from './version.js'

/** Running version is process-owned, independent of the project's dependency range. */
const histoireVersion = readHistoireVersion()

/** First failing declared requirement, ignoring only absent optional peers. */
export function compatibility(detail: Pick<PluginDetail, 'requires' | 'frameworks'>, project: ProjectSignals, optionalPeers: readonly string[] = []): CatalogEntry['compatible'] {
  const { requires, frameworks } = detail
  if (requires.histoire && !satisfiesVersion(histoireVersion, requires.histoire)) return { ok: false, reason: `Needs histoire ${requires.histoire}` }
  if (frameworks.length && !frameworks.some(framework => project.project.frameworks.includes(framework))) return { ok: false, reason: `Needs ${frameworks.join(' or ')}` }
  for (const [name, range] of Object.entries(requires)) {
    if (name === 'histoire' || (optionalPeers.includes(name) && !project.versions[name])) continue
    if (!project.versions[name] || !satisfiesVersion(project.versions[name], range)) return { ok: false, reason: `Needs ${name} ${range}` }
  }
  return { ok: true }
}
