import type { HistoireVisualConfig, HistoireVisualProfile } from '@histoire/shared'
import { z } from 'zod/v4'
import { CAPTURE_LIMITS } from '../runtime/browser/limits.js'

/** Strict profile inputs share runtime viewport bounds. */
const profileSchema = z.strictObject({
  id: z.string().regex(/^[\w-]{1,64}$/),
  width: z.number().int().min(CAPTURE_LIMITS.minWidth).max(CAPTURE_LIMITS.width).default(1024),
  height: z.number().int().min(CAPTURE_LIMITS.minHeight).max(CAPTURE_LIMITS.height).default(640),
  deviceScaleFactor: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  colorScheme: z.enum(['light', 'dark']).default('light'),
  backgroundColor: z.string().regex(/^(?:#[\da-f]{3}|#[\da-f]{4}|#[\da-f]{6}|#[\da-f]{8}|[a-z]+|rgba?\([\d.,%\s]+\)|hsla?\([\d.,%\s]+\))$/i).default('#ffffff'),
  textDirection: z.enum(['ltr', 'rtl']).default('ltr'),
  globals: z.record(z.string(), z.union([z.string(), z.number().finite(), z.boolean(), z.null()])).optional(),
})
/** Strict opt-in configuration; paths remain project-relative. */
const schema = z.strictObject({
  enabled: z.boolean().optional(),
  baselineDir: z.string().min(1).default('.histoire-visual'),
  baselineRef: z.string().min(1).max(256).default('main'),
  profiles: z.array(profileSchema).min(1).max(64).prefault([{ id: 'desktop-light' }]),
  exclude: z.array(z.string()).default([]),
  threshold: z.number().min(0).max(1).default(0.1),
  maxDiffPixelRatio: z.number().min(0).max(1).default(0),
  includeAA: z.boolean().default(false),
})

/** Fully resolved server policy; globals inherit project values later. */
export type ResolvedVisualConfig = Omit<z.infer<typeof schema>, 'profiles'> & {
  /** Resolved viewport and appearance; optional globals retain inheritance. */
  profiles: (Required<Omit<HistoireVisualProfile, 'globals'>> & Pick<HistoireVisualProfile, 'globals'>)[]
}

/** Validate opt-in configuration without acquiring files or browser resources. */
export function resolveVisualConfig(input: HistoireVisualConfig | undefined): ResolvedVisualConfig | undefined {
  if (input === undefined || input.enabled === false) {
    return
  }
  const result = schema.parse(input)
  if (new Set(result.profiles.map(profile => profile.id)).size !== result.profiles.length) {
    throw new Error('Histoire visual: duplicate profile IDs')
  }
  const segments = result.baselineDir.replaceAll('\\', '/').split('/')
  if (segments.some(segment => !segment || segment === '.' || segment === '..') || /^[A-Z]:/i.test(result.baselineDir) || segments[0] === '.histoire') {
    throw new Error('Histoire visual: baselineDir must be a tracked project-relative directory')
  }
  return result as ResolvedVisualConfig
}
