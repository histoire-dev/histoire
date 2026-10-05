import type { HistoireGlobals } from '@histoire/protocol'
import type { Context } from '../../context.js'
import { validateSettingsPatch } from '@histoire/protocol'
import { inventoryPublicAssets } from '../../build/node/content.js'
import { normalizeNodeBase } from '../../deploy/base.js'
import { canonicalArtifactJson } from '../../deploy/identity.js'
import { hashContent } from '../content/hash.js'

/** Additive public immutable capture settings; no private runtime or paths. */
export interface BuiltCaptureMetadata {
  /** Supported static capture schema. */
  schemaVersion: 1
  /** Runtime assets/catalog/settings identity. */
  buildId: string
  /** Normalized built book base. */
  base: string
  /** Default runtime appearance. */
  defaultColorScheme: 'auto' | 'light' | 'dark'
  /** Default preview background. */
  backgroundColor: string
  /** Default text direction. */
  textDirection: 'ltr' | 'rtl'
  /** Primitive default runtime globals. */
  globals: HistoireGlobals
}

/** Rejects malformed additive metadata before preview advertises capture capability. */
export function validateBuiltCapture(value: unknown): BuiltCaptureMetadata {
  const data = value as BuiltCaptureMetadata
  const keys = ['schemaVersion', 'buildId', 'base', 'defaultColorScheme', 'backgroundColor', 'textDirection', 'globals']
  if (!data || typeof data !== 'object' || Object.keys(data).some(key => !keys.includes(key))
    || data.schemaVersion !== 1 || typeof data.buildId !== 'string' || !/^[a-f0-9]{64}$/.test(data.buildId)
    || typeof data.base !== 'string' || normalizeNodeBase(data.base) !== data.base
    || !['auto', 'light', 'dark'].includes(data.defaultColorScheme)
    || typeof data.backgroundColor !== 'string' || data.backgroundColor.length > 4096 || !data.backgroundColor.isWellFormed()
    || !['ltr', 'rtl'].includes(data.textDirection) || !data.globals) {
    throw new Error('Built capture metadata is malformed or unsupported')
  }
  try {
    validateSettingsPatch({ globals: data.globals })
  }
  catch { throw new Error('Built capture metadata is malformed or unsupported') }
  return Object.freeze({ ...data, globals: Object.freeze({ ...data.globals }) })
}

/** Hashes emitted runtime assets and detached catalog/settings, excluding identity-bearing files. */
export async function getBuiltCaptureIdentity(publicRoot: string, catalog: unknown, settings: Omit<BuiltCaptureMetadata, 'buildId'>): Promise<string> {
  const assets = (await inventoryPublicAssets(publicRoot)).filter(asset => !['histoire.json', 'histoire-embed.json', 'histoire-embed-origins.json', 'assets/histoire-local.json', '__histoire/embed.json'].includes(asset.path))
  return hashContent(canonicalArtifactJson({ catalog, settings, assets }))
}

/** Emits capture metadata regardless of embedding, using completed final public output. */
export async function createStaticCaptureMetadata(ctx: Context, catalog: unknown, publicRoot: string): Promise<BuiltCaptureMetadata> {
  const settings: Omit<BuiltCaptureMetadata, 'buildId'> = {
    schemaVersion: 1,
    base: normalizeNodeBase(ctx.resolvedViteConfig.base ?? '/'),
    defaultColorScheme: ctx.config.theme?.defaultColorScheme ?? 'auto',
    backgroundColor: ctx.config.backgroundPresets?.[0]?.color ?? 'transparent',
    textDirection: ctx.config.preview?.textDirection ?? 'ltr',
    globals: { ...ctx.config.preview?.globals },
  }
  return validateBuiltCapture({ ...settings, buildId: await getBuiltCaptureIdentity(publicRoot, catalog, settings) })
}
