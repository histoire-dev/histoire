import type { HistoireCapabilities, HistoireFramePluginInfo, HistoireSourceDescriptor } from '@histoire/protocol'
import type { Context } from '../../context.js'
import type { CatalogSnapshot } from '../../runtime/catalog/types.js'
import { createEmbedSurfaceCapabilities } from '@histoire/app/dist/embed/capabilities.js'
import { validateHistoireSourceDescriptor } from '@histoire/protocol'
import { resolveEmbedConfig } from '../../config/embed.js'
import { resolveInspectionConfig } from '../../config/inspection.js'
import { resolveMatrixNumericValues } from '../../config/matrix.js'
import { hasProjectVitest } from '../../util/has-vitest.js'
import { resolveAccessibilityRuntime } from '../../util/resolve-accessibility-runtime.js'
import { DEFAULT_STORY_COLLECT_TIMEOUT, getRunStallTimeout, getTestMaxWorkers } from '../../util/test-timeouts.js'
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

/**
 * Installed frame plugins as data (`{ id, apiVersion }`, never paths or options), in config order.
 * Static books omit dev-only entries, matching the frame manifest.
 */
function framePlugins(ctx: Context, mode: 'dev' | 'static'): HistoireFramePluginInfo[] {
  return (ctx.workbenchPlugins ?? []).filter(plugin => plugin.frame && (mode === 'dev' || !plugin.devOnly)).map(plugin => ({ id: plugin.id, apiVersion: plugin.apiVersion }))
}

/** Builds one portable descriptor shared by dev documents and immutable static output. */
export function createEmbedDescriptor(ctx: Context, snapshot: CatalogSnapshot, mode: 'dev' | 'static' = 'dev', buildId?: string, namespace: 'embed' | 'local' = 'embed'): HistoireSourceDescriptor {
  const { enabled: _enabled, channels: _channels, ...embed } = resolveEmbedConfig(ctx.config.embed)
  const theme = ctx.config.theme
  const installed = framePlugins(ctx, mode)
  const inspection = resolveInspectionConfig(ctx.config.inspection)
  const sourceCapabilities = capabilities(ctx, snapshot, mode)
  const accessibility = sourceCapabilities.state.available && Boolean(resolveAccessibilityRuntime(ctx.root, ctx.config.inspection))
  const descriptor: HistoireSourceDescriptor = {
    descriptorVersion: 1,
    protocolVersion: 1,
    sourceId: getEmbedSourceId(ctx.root),
    epoch: mode === 'static' ? buildId : snapshot.epoch,
    revision: mode === 'static' ? buildId : snapshot.revision,
    mode,
    catalog: projectEmbedCatalog(snapshot),
    // Books without frame plugins keep the shape older SDKs validate.
    capabilities: installed.length ? { ...sourceCapabilities, framePlugins: { available: true } } : sourceCapabilities,
    // Source policy is an upper bound; runtime readiness supplies actual actor support.
    ...(inspection.enabled ? { inspection: { variant: { available: sourceCapabilities.state.available }, dom: { available: sourceCapabilities.state.available }, highlight: { available: sourceCapabilities.state.available }, pick: { available: sourceCapabilities.state.available }, highlightLease: { available: sourceCapabilities.state.available }, components: { available: inspection.components && sourceCapabilities.state.available }, componentDetails: { available: inspection.components && sourceCapabilities.state.available }, componentHighlight: { available: inspection.components && sourceCapabilities.state.available }, accessibilityAudit: { available: accessibility }, diagnostics: { available: inspection.diagnostics && sourceCapabilities.state.available } }, inspectionPolicy: { allowedOrigins: inspection.allowedOrigins } } : {}),
    ...(installed.length ? { framePlugins: installed } : {}),
    // Standalone never receives external authority from opt-in embed settings.
    embed: namespace === 'local' ? { allowedOrigins: [], allowServerTests: true, allowOpenInEditor: true } : embed,
    assets: projectEmbedAssets(snapshot, namespace),
    config: {
      title: theme?.title ?? 'Histoire',
      routerMode: ctx.config.routerMode ?? 'history',
      matrix: { numericValues: resolveMatrixNumericValues(ctx.config.ui?.matrix?.numericValues) },
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
      runTimeout: getRunStallTimeout(ctx),
      testMaxWorkers: getTestMaxWorkers(ctx),
      globals: ctx.config.preview?.globals ?? {},
      textDirection: ctx.config.preview?.textDirection ?? 'ltr',
    },
  }
  return validateHistoireSourceDescriptor(descriptor)
}
