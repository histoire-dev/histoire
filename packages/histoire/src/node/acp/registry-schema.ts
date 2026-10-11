import { z } from 'zod'

/** Package-manager distribution with registry-owned launch environment. */
const packageSchema = z.object({ package: z.string().min(1).max(2048), args: z.array(z.string().max(2048)).max(64).default([]), env: z.record(z.string().regex(/^[a-z_]\w*$/i), z.string().max(16000)).default({}) })
/** Archives are resolved on server; no browser-provided URL reaches installation. */
const binarySchema = z.object({ archive: z.url().refine(value => new URL(value).protocol === 'https:'), cmd: z.string().min(1).max(2048), args: z.array(z.string()).max(64).default([]), sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional() })
/** Invalid optional logos fall back without removing otherwise valid agents. */
const iconSchema = z.unknown().transform((value): string | undefined => {
  if (typeof value !== 'string' || value.length > 2048) return undefined
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href
  }
  catch { /* Unsupported image sources use bundled fallback icon. */ }
})
/** Unknown display metadata is ignored while launch fields receive strict validation. */
const entrySchema = z.object({
  id: z.string().regex(/^[\w-]{1,80}$/).refine(value => !['__proto__', 'constructor', 'prototype'].includes(value)),
  name: z.string().min(1).max(120),
  version: z.string().max(120).optional(),
  icon: iconSchema.optional(),
  distribution: z.object({ npx: packageSchema.optional(), uvx: packageSchema.optional(), binary: z.record(z.string(), binarySchema).optional() }).optional(),
})

/** Validated private catalog definition. */
export type AgentRegistryEntry = z.infer<typeof entrySchema>
/** Server-owned executable definition or archive preparation request. */
export interface AgentDistribution {
  /** Launch mechanism. */
  kind: 'npx' | 'uvx' | 'binary'
  /** Exact command, relative to archive for binaries. */
  command: string
  /** Exact argument boundaries. */
  args: string[]
  /** Registry defaults layered below private local overrides. */
  env: Record<string, string>
  /** Binary distribution URL. */
  archive?: string
  /** Optional published archive digest. */
  sha256?: string
}

/** Bad entries cannot erase a usable cached catalog or inject unsafe identities. */
export function parseAgentRegistry(value: unknown): AgentRegistryEntry[] {
  const root = z.object({ agents: z.array(z.unknown()) }).parse(value)
  const entries: AgentRegistryEntry[] = []
  const ids = new Set<string>()
  for (const raw of root.agents) {
    const parsed = entrySchema.safeParse(raw)
    if (parsed.success && !ids.has(parsed.data.id)) {
      entries.push(parsed.data)
      ids.add(parsed.data.id)
    }
  }
  if (root.agents.length && !entries.length) throw new Error('Invalid ACP registry document')
  return entries
}

/** Prefer package runners, then exact OS/architecture binary without guessing aliases. */
export function resolveAgentDistribution(entry: AgentRegistryEntry, platform: string = process.platform, arch: string = process.arch): AgentDistribution | undefined {
  const distribution = entry.distribution
  if (distribution?.npx) return { kind: 'npx', command: 'npx', args: ['--yes', distribution.npx.package, ...distribution.npx.args], env: distribution.npx.env }
  if (distribution?.uvx) return { kind: 'uvx', command: 'uvx', args: [distribution.uvx.package, ...distribution.uvx.args], env: distribution.uvx.env }
  const os = platform === 'win32' ? 'windows' : platform
  const cpu = arch === 'x64' ? 'x86_64' : arch === 'arm64' ? 'aarch64' : arch
  const binary = distribution?.binary?.[`${os}-${cpu}`]
  if (binary) return { kind: 'binary', command: binary.cmd, args: binary.args, env: {}, archive: binary.archive, sha256: binary.sha256 }
}
