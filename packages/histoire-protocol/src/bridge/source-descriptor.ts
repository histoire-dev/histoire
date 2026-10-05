import { validateEmbedOrigins } from '../url/embed-origins.js'
import { invalid, validateSettingsPatch, wireId, wireRecord } from './validation.js'

/** Strict same-base opaque reference; URL normalization must never hide traversal. */
export function validateSourceAssetReference(value: unknown): string {
  if (typeof value !== 'string' || !value || /[\\\0?#:%]/.test(value) || value.startsWith('/') || value.split('/').some(part => !part || part === '.' || part === '..')) invalid('Expected relative source asset reference')
  return value as string
}

/** Rejects unexpected projected keys before source configuration reaches UI code. */
function keys(input: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(input).some(key => !allowed.includes(key))) invalid('Unknown source descriptor field')
}

/** Validates optional portable config/policy/lazy assets; legacy bare descriptors remain valid. */
export function validateSourceDescriptorFields(input: Record<string, unknown>): void {
  if (input.embed !== undefined) {
    const policy = wireRecord(input.embed)
    keys(policy, ['allowedOrigins', 'allowOpenInEditor', 'allowServerTests'])
    validateEmbedOrigins(policy.allowedOrigins)
    if (typeof policy.allowOpenInEditor !== 'boolean' || typeof policy.allowServerTests !== 'boolean') invalid('Invalid embed policy')
  }
  if (input.assets !== undefined) {
    const assets = wireRecord(input.assets)
    keys(assets, ['search', 'content'])
    validateSourceAssetReference(assets.search)
    if (!Array.isArray(assets.content)) invalid('Invalid source content inventory')
    const seen = new Set<string>()
    for (const value of assets.content) {
      const entry = wireRecord(value)
      keys(entry, ['storyId', 'docs', 'rawSource'])
      if (!wireId(entry.storyId) || seen.has(entry.storyId as string)) invalid('Invalid source content target')
      seen.add(entry.storyId as string)
      if (entry.docs !== undefined) validateSourceAssetReference(entry.docs)
      if (entry.rawSource !== undefined) validateSourceAssetReference(entry.rawSource)
    }
  }
  if (input.config !== undefined) {
    const config = wireRecord(input.config)
    keys(config, ['title', 'theme', 'responsivePresets', 'backgroundPresets', 'autoApplyContrastColor', 'storyCollectTimeout', 'runTimeout', 'globals', 'textDirection'])
    if (config.globals !== undefined) validateSettingsPatch({ globals: config.globals })
    if (config.textDirection !== undefined) validateSettingsPatch({ textDirection: config.textDirection })
    if (typeof config.title !== 'string' || typeof config.autoApplyContrastColor !== 'boolean') invalid('Invalid source config')
    for (const key of ['storyCollectTimeout', 'runTimeout']) {
      if (config[key] !== undefined && (typeof config[key] !== 'number' || !Number.isFinite(config[key]) || (config[key] as number) <= 0)) invalid('Invalid source deadline')
    }
    const theme = wireRecord(config.theme)
    keys(theme, ['defaultColorScheme', 'darkClass', 'hideColorSchemeSwitch', 'colors'])
    validateSettingsPatch({ colorScheme: theme.defaultColorScheme })
    if (typeof theme.darkClass !== 'string' || (theme.hideColorSchemeSwitch !== undefined && typeof theme.hideColorSchemeSwitch !== 'boolean')) invalid('Invalid source theme')
    if (theme.colors !== undefined) {
      for (const shades of Object.values(wireRecord(theme.colors))) {
        if (Object.values(wireRecord(shades)).some(value => typeof value !== 'string')) invalid('Invalid source colors')
      }
    }
    if (!Array.isArray(config.responsivePresets) || !Array.isArray(config.backgroundPresets)) invalid('Invalid source presets')
    for (const value of config.responsivePresets) {
      const preset = wireRecord(value)
      keys(preset, ['label', 'width', 'height'])
      if (typeof preset.label !== 'string' || typeof preset.width !== 'number' || !Number.isFinite(preset.width) || preset.width <= 0 || (preset.height != null && (typeof preset.height !== 'number' || !Number.isFinite(preset.height) || preset.height <= 0))) invalid('Invalid responsive preset')
    }
    for (const value of config.backgroundPresets) {
      const preset = wireRecord(value)
      keys(preset, ['label', 'color', 'contrastColor'])
      if (['label', 'color'].some(key => typeof preset[key] !== 'string') || (preset.contrastColor !== undefined && typeof preset.contrastColor !== 'string')) invalid('Invalid background preset')
    }
  }
}
