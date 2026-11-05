import type { Context } from '../../context.js'
import type { RegistryOptions } from '../catalog/registry.js'
import type { ReadUpdateVersions, UpdateVersion } from './updates.js'
import packageJson from '../../../../package.json' with { type: 'json' }
import { compatibility } from '../catalog/compat.js'
import { officialReleases } from '../catalog/official.js'
import { registryRelease } from '../catalog/registry-entry.js'
import { createRegistryClient } from '../catalog/registry.js'
import { detectProjectSignals } from '../catalog/signals.js'

/** Read version-specific manifests through catalog's bounded registry client and compatibility rules. */
export function createRegistryUpdateReader(ctx: Context, options: RegistryOptions = {}): ReadUpdateVersions {
  let registry: ReturnType<typeof createRegistryClient> | undefined
  return async (id, prefs) => {
    const project = await detectProjectSignals(ctx.root)
    if (!prefs.community) {
      return officialReleases(id).map(release => ({
        version: release.latest,
        compatible: compatibility(release.requires, release.frameworks, project, packageJson.version).ok,
        releaseNotes: release.releaseNotes,
      }))
    }
    registry ??= createRegistryClient(ctx.root, options)
    const { value: packument } = await registry.packument(id)
    return Object.keys(packument.versions).flatMap((version): UpdateVersion[] => {
      const release = registryRelease(packument, version)
      if (!release) return []
      const { detail, optionalPeers } = release
      const requires = Object.fromEntries(Object.entries(detail.requires).filter(([name]) => !optionalPeers.includes(name) || project.versions[name]))
      // registryRelease validates this exact version; deprecation stays version-scoped.
      const metadata = packument.versions[version] as { /** npm deprecation marker. */ deprecated?: string | boolean }
      return [{
        version,
        deprecated: Boolean(metadata.deprecated),
        compatible: compatibility(requires, detail.frameworks, project, packageJson.version).ok,
        releaseNotes: detail.releaseNotes,
      }]
    })
  }
}
