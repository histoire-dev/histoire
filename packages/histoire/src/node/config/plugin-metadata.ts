import type { Plugin, PluginMetadata } from '@histoire/shared'
import { histoireIconNames } from '@histoire/shared/dist/icons/index.js'
import { readInstalledPackage } from '../marketplace/inventory/package-resolve.js'

/** Validated public information projected into a browser module. */
export interface PublicPluginMetadata extends PluginMetadata {
  /** Actual installed npm identity. */ packageName?: string
  /** Version from the installed package, never its dependency range. */ version?: string
}

/** Accept bounded nonempty metadata rather than unexpected package JSON shapes. */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() && value.length <= 2048 ? value.trim() : undefined
}

/** Admit only web URLs, excluding embedded credentials. */
function webUrl(value: unknown, httpsOnly = false): string | undefined {
  const raw = text(value)
  if (!raw) return
  try {
    const url = new URL(raw)
    if ((!['http:', 'https:'].includes(url.protocol)) || (httpsOnly && url.protocol !== 'https:') || url.username || url.password) return
    return url.href
  }
  catch { return undefined }
}

/** Convert common npm Git URLs to browser URLs without accepting arbitrary schemes. */
function repositoryUrl(value: unknown): string | undefined {
  const raw = text(typeof value === 'object' && value ? (value as { url?: unknown }).url : value)
  if (!raw) return
  const https = raw
    .replace(/^git\+https:\/\//, 'https://')
    .replace(/^(?:github:|git@github\.com:|git\+ssh:\/\/git@github\.com\/|git:\/\/github\.com\/)/, 'https://github.com/')
  const valid = webUrl(https)
  return valid?.replace(/\.git\/?$/, '')
}

/** Resolve package fallback once per plugin, preserving duplicate identities and order. */
export async function resolvePluginMetadata(root: string, plugins: readonly Plugin[]): Promise<PublicPluginMetadata[]> {
  const icons = new Set(histoireIconNames)
  return Promise.all(plugins.map(async (plugin) => {
    const info = plugin.metadata ?? {}
    const pkg = await readInstalledPackage(root, plugin.name)
    const version = text(pkg.version)
    const displayName = text(info.displayName)
    const description = text(info.description) ?? text(pkg.description)
    const icon = text(info.icon)
    const logoUrl = webUrl(info.logoUrl, true)
    const docsUrl = webUrl(info.docsUrl) ?? webUrl(pkg.homepage)
    const repoUrl = repositoryUrl(info.repoUrl) ?? repositoryUrl(pkg.repository)
    return {
      ...version ? { packageName: pkg.name as string, version } : {},
      ...displayName ? { displayName } : {},
      ...description ? { description } : {},
      ...icon && icons.has(icon) ? { icon } : {},
      ...logoUrl ? { logoUrl } : {},
      ...docsUrl ? { docsUrl } : {},
      ...repoUrl ? { repoUrl } : {},
    }
  }))
}
