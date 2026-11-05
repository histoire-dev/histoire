import type { PluginDetail } from '@histoire/shared'
import { Buffer } from 'node:buffer'
import { z } from 'zod'
import { validateMarketplaceManifest } from '../manifest/index.js'
import { packageName } from './validation.js'
import { compareVersions } from './version.js'

/** Only registry metadata needed by catalog consumers is retained. */
const versionSchema = z.object({
  name: packageName,
  version: z.string().min(1).max(128),
  histoire: z.object({ marketplace: z.unknown().optional() }).optional(),
  peerDependencies: z.record(packageName, z.string().min(1).max(500)).optional(),
  peerDependenciesMeta: z.record(packageName, z.object({ optional: z.boolean().optional() })).optional(),
  dist: z.object({ attestations: z.unknown().optional() }).optional(),
  deprecated: z.union([z.string(), z.boolean()]).optional(),
  license: z.string().max(500).optional(),
  homepage: z.string().max(2048).optional(),
  repository: z.union([z.string().max(2048), z.object({ url: z.string().max(2048) })]).optional(),
})
/** Packument parser also runs on disk cache reads. */
export const packumentSchema = z.object({
  'name': packageName,
  'dist-tags': z.object({ latest: z.string().min(1).max(128) }),
  'versions': z.record(z.string().max(128), z.unknown()),
  'time': z.record(z.string(), z.string().max(128)).optional(),
})
/** Parsed packument without any executable content. */
export type RegistryPackument = z.infer<typeof packumentSchema>

/** Admit browser links only; credentials and arbitrary protocols are discarded. */
function webUrl(raw: string | undefined): string | undefined {
  if (!raw) return
  try {
    const url = new URL(raw.replace(/^git\+https:/, 'https:'))
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href.replace(/\.git$/, '')
  }
  catch { /* Optional malformed links are not catalog failures. */ }
}

/** Declarative version metadata exported for update/planner consumers. */
export interface RegistryRelease {
  /** Exact published version. */ version: string
  /** Validated manifest and registry attributes for this version. */ detail: PluginDetail
  /** Optional peer package names, which do not require an absent install. */ optionalPeers: string[]
  /** Deprecated releases cannot be offered as updates. */ deprecated: boolean
}
/** Intersect declared peers and manifest requirements, preserving union precedence. */
function requirements(peers: Record<string, string> = {}, declared: Record<string, string> = {}): Record<string, string> {
  return Object.fromEntries([...new Set([...Object.keys(peers), ...Object.keys(declared)])].map((name) => {
    const peer = peers[name]
    const manifest = declared[name]
    if (!peer || !manifest || peer === manifest) return [name, manifest ?? peer]
    return [name, peer.split('||').flatMap(a => manifest.split('||').map(b => `${a.trim()} ${b.trim()}`)).join(' || ')]
  }))
}
/** Read published version without trusting its package identity or official claims. */
export function registryRelease(packument: RegistryPackument, version: string): RegistryRelease | undefined {
  if (!Object.hasOwn(packument.versions, version)) return
  const parsed = versionSchema.safeParse(packument.versions[version])
  if (!parsed.success || parsed.data.name !== packument.name || parsed.data.version !== version) return
  const pkg = parsed.data
  const { manifest } = validateMarketplaceManifest(pkg.histoire?.marketplace)
  if (!manifest) return
  const detail: PluginDetail = {
    id: pkg.name,
    displayName: manifest.displayName,
    summary: manifest.summary,
    publisher: pkg.name.startsWith('@') ? pkg.name.split('/')[0] : pkg.name,
    official: false,
    category: manifest.category,
    frameworks: manifest.frameworks ?? [],
    adds: manifest.adds ?? [],
    monogram: manifest.monogram,
    tint: manifest.tint,
    logoUrl: manifest.logoUrl,
    latest: version,
    updatedAt: packument.time?.[version],
    license: pkg.license,
    repoUrl: webUrl(typeof pkg.repository === 'object' ? pkg.repository.url : pkg.repository),
    docsUrl: webUrl(pkg.homepage),
    compatible: { ok: true },
    manifest,
    versions: [],
    provenance: pkg.dist?.attestations !== undefined && pkg.dist.attestations !== null,
    requires: requirements(pkg.peerDependencies, manifest.requires),
    access: manifest.access ?? [],
    releaseNotes: manifest.releaseNotes,
  }
  // A single detail must fit the existing UI event budget, including its envelope.
  if (Buffer.byteLength(JSON.stringify(detail)) > 40000) return
  return { version, detail, deprecated: Boolean(pkg.deprecated), optionalPeers: Object.entries(pkg.peerDependenciesMeta ?? {}).filter(([name, meta]) => meta.optional && !Object.hasOwn(manifest.requires ?? {}, name)).map(([name]) => name) }
}

/** Latest valid manifest plus bounded version metadata; never evaluate package code. */
export function registryDetail(packument: RegistryPackument): RegistryRelease | undefined {
  const release = registryRelease(packument, packument['dist-tags'].latest)
  if (!release) return
  release.detail.versions = Object.keys(packument.versions).sort((a, b) => compareVersions(b, a)).slice(0, 100).flatMap((version) => {
    const parsed = versionSchema.safeParse(packument.versions[version])
    return parsed.success && parsed.data.name === packument.name && parsed.data.version === version
      ? [{ version, date: packument.time?.[version], deprecated: Boolean(parsed.data.deprecated), compatible: true }]
      : []
  })
  return release
}
