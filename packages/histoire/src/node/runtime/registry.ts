import type { PluginConfigContext } from '@histoire/shared'
import type { Context } from '../context.js'
import type { ScreenshotSetupOwner } from './browser/setup/types.js'
import type { ExecutionService } from './execution-service.js'
import { rm } from 'node:fs/promises'
import { getRunTempDir } from '../util/temp-paths.js'
import { createScreenshotSetupOwner } from './browser/setup/owner.js'
import { createBrowserSetupPolicy } from './browser/setup/policy.js'
import { createCleanupStack } from './cleanup.js'
import { createProjectEvents } from './events.js'

/** Project-owned mutable state; weak keys do not retain abandoned fixture contexts. */
const registries = new WeakMap<Context, ReturnType<typeof createRegistry>>()

/** Acquires cleanup ownership before any configuration hook or server startup. */
function createRegistry(ctx: Context) {
  const cleanup = createCleanupStack()
  const events = createProjectEvents()
  const tempDir = getRunTempDir(ctx.root, ctx.mode ?? 'context')
  // Mutable generated outputs are unique even for two captures of the same root.
  // Registered first so deletion runs after dependent watchers/servers/plugins.
  // Vite may finish a final optimizer-directory rename while shutdown settles.
  // Bounded filesystem retries affect only this captured output directory.
  cleanup.add(() => rm(tempDir, { recursive: true, force: true, maxRetries: 6, retryDelay: 50 }))
  cleanup.add(() => events.clear())
  const pluginContext: PluginConfigContext = {
    root: ctx.root,
    tempDir,
    onCleanup: callback => cleanup.add(callback),
  }
  return {
    /** Reverse-order acquired-resource ownership. */
    cleanup,
    /** Internal, context-scoped publication channel. */
    events,
    /** Isolated mutable plugin and optimizer output. */
    tempDir,
    /** Trusted root/cleanup access available during configuration hooks. */
    pluginContext,
    /** At most one filesystem story watcher per context, without process exclusion. */
    storyWatcher: undefined as object | undefined,
    /** Dev owner captured before Vite plugins configure finite execution routes. */
    execution: undefined as { service: ExecutionService, isActive: () => boolean } | undefined,
    /** One browser setup owner for this exact captured context/configuration. */
    screenshotSetup: undefined as ScreenshotSetupOwner | undefined,
  }
}

/** Returns the registry belonging to the exact context object, including fixtures. */
export function getContextRegistry(ctx: Context) {
  let registry = registries.get(ctx)
  if (!registry) registries.set(ctx, registry = createRegistry(ctx))
  return registry
}

/** Returns the lazily acquired browser setup owner scoped to this Context. */
export function getContextScreenshotSetup(ctx: Context, isActive?: () => boolean): ScreenshotSetupOwner {
  const registry = getContextRegistry(ctx)
  if (registry.screenshotSetup) return registry.screenshotSetup
  const owner = createContextScreenshotSetup(ctx, isActive)
  registry.screenshotSetup = owner
  return owner
}

/** Creates a Context-configured owner whose caller controls its narrower lifetime. */
export function createContextScreenshotSetup(ctx: Context, isActive?: () => boolean): ScreenshotSetupOwner {
  const registry = getContextRegistry(ctx)
  if (registry.cleanup.isClosing) throw new Error('Cannot acquire screenshot setup after context cleanup started')
  const owner = createScreenshotSetupOwner({
    root: ctx.root,
    policy: createBrowserSetupPolicy(ctx.config.browser, ctx.root),
    isActive: isActive ?? (() => registry.execution?.isActive() ?? true),
  })
  registry.cleanup.add(() => owner.close())
  return owner
}

/** Releases captured context resources once, including partially resolved plugins. */
export function closeContext(ctx: Context) {
  return getContextRegistry(ctx).cleanup.close()
}
