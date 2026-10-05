import type { HistoireCapabilities, HistoireSourceDescriptor } from '@histoire/protocol'
import type { Context } from '../../context.js'
import type { CatalogSnapshot } from '../../runtime/catalog/types.js'
import { createEmbedSurfaceCapabilities } from '@histoire/app/dist/embed/capabilities.js'
import { validateHistoireSourceDescriptor } from '@histoire/protocol'
import { resolveEmbedConfig } from '../../config/embed.js'
import { hasProjectVitest } from '../../util/has-vitest.js'
import { DEFAULT_RUN_TIMEOUT, DEFAULT_STORY_COLLECT_TIMEOUT } from '../../util/test-timeouts.js'
import { projectEmbedCatalog } from './catalog.js'
import { projectEmbedAssets } from './content.js'
import { getEmbedSourceId } from './identity.js'

/** Advertises source-supported data/engines while later surfaces remain explicitly unavailable. */
function capabilities(ctx: Context, snapshot: CatalogSnapshot, mode: 'dev' | 'static'): HistoireCapabilities {
  const available = (value: boolean) => value ? { available: true } : { available: false, reason: 'CAPABILITY_UNAVAILABLE' }
  const runtime = snapshot.catalog.stories.some(story => !story.docsOnly && story.variants.length > 0)
  const tests = runtime && hasProjectVitest(ctx.root)
  return {
    catalog: snapshot.failed ? { available: false, reason: 'COLLECTION_FAILED' } : available(true),
    search: available(!snapshot.failed),
    docs: available(snapshot.stories.some(story => story.docsAvailable)),
    rawSource: available(snapshot.stories.some(story => story.sourceAvailable)),
    dynamicSource: available(runtime),
    state: available(runtime),
    customControls: available(runtime),
    previewTests: available(tests),
    serverTests: available(mode === 'dev' && tests),
    openInEditor: available(mode === 'dev'),
    hostChannels: ctx.config.embed?.enabled && ctx.config.embed.channels?.length ? { available: true, channels: resolveEmbedConfig(ctx.config.embed).channels } : available(false),
    surfaces: createEmbedSurfaceCapabilities(),
  }
}

/** Builds one portable descriptor shared by dev documents and immutable static output. */
export function createEmbedDescriptor(ctx: Context, snapshot: CatalogSnapshot, mode: 'dev' | 'static' = 'dev', buildId?: string, namespace: 'embed' | 'local' = 'embed'): HistoireSourceDescriptor {
  const { enabled: _enabled, channels: _channels, ...embed } = resolveEmbedConfig(ctx.config.embed)
  const theme = ctx.config.theme
  const descriptor: HistoireSourceDescriptor = {
    descriptorVersion: 1,
    protocolVersion: 1,
    sourceId: getEmbedSourceId(ctx.root),
    epoch: mode === 'static' ? buildId : snapshot.epoch,
    revision: mode === 'static' ? buildId : snapshot.revision,
    mode,
    catalog: projectEmbedCatalog(snapshot),
    capabilities: capabilities(ctx, snapshot, mode),
    // Standalone never receives external authority from opt-in embed settings.
    embed: namespace === 'local' ? { allowedOrigins: [], allowServerTests: true, allowOpenInEditor: true } : embed,
    assets: projectEmbedAssets(snapshot, namespace),
    config: {
      title: theme?.title ?? 'Histoire',
      theme: {
        defaultColorScheme: theme?.defaultColorScheme ?? 'auto',
        darkClass: theme?.darkClass ?? 'dark',
        ...(theme?.hideColorSchemeSwitch === undefined ? {} : { hideColorSchemeSwitch: theme.hideColorSchemeSwitch }),
        ...(theme?.colors ? { colors: JSON.parse(JSON.stringify(theme.colors)) } : {}),
      },
      responsivePresets: (ctx.config.responsivePresets ?? []).map(({ label, width, height }) => ({ label, width, ...(height === undefined ? {} : { height }) })),
      backgroundPresets: (ctx.config.backgroundPresets ?? []).map(({ label, color, contrastColor }) => ({ label, color, ...(contrastColor === undefined ? {} : { contrastColor }) })),
      autoApplyContrastColor: ctx.config.autoApplyContrastColor ?? false,
      storyCollectTimeout: ctx.config.test?.storyCollectTimeout ?? DEFAULT_STORY_COLLECT_TIMEOUT,
      runTimeout: ctx.config.test?.runTimeout ?? DEFAULT_RUN_TIMEOUT,
      globals: ctx.config.preview?.globals ?? {},
      textDirection: ctx.config.preview?.textDirection ?? 'ltr',
    },
  }
  return validateHistoireSourceDescriptor(descriptor)
}
