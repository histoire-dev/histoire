import type { ViteDevServer } from 'vite'
import type { StoryCollectionOutcome } from '../collect/outcome.js'
import type { Context } from '../context.js'
import type { CollectionEvent } from '../server/collect.js'
import type { CreateServerOptions } from '../server/index.js'

/** Observable lifecycle of a single process-owned project. */
export type ProjectRuntimeStatus = 'starting' | 'ready' | 'restarting' | 'failed' | 'closed'

/** Resources returned by one dev-server startup. */
export interface RuntimeGeneration {
  /** Private project context, never a client DTO. */
  context: Context
  /** Client-facing dev server. */
  server: ViteDevServer
  /** Initial scan, Markdown association, collection and invalidation completion. */
  ready: Promise<void>
  /** Optional resolved Vite config filename for restart watching. */
  viteConfigFile?: string
  /** Releases all owned resources once. */
  close: () => Promise<void>
  /** Runs or joins the owned collection loop. */
  collect: () => Promise<void>
  /** Registers collection publication observations. */
  onCollection: (handler: (event: CollectionEvent) => void | Promise<void>) => () => void
  /** Latest private collection outcomes keyed by registered file path. */
  collectionOutcomes?: ReadonlyMap<string, StoryCollectionOutcome>
}

/** Generation identity captured by reads and asynchronous operations. */
export interface ProjectRuntimeHandle extends RuntimeGeneration {
  /** Random identity replaced on restart. */
  epoch: string
  /** True only while this generation owns its controller. */
  isActive: () => boolean
}

/** Inputs common to CLI dev and the stdio project worker. */
export interface ProjectRuntimeOptions extends CreateServerOptions {
  /** Explicit Histoire configuration module. */
  config?: string
  /** Reserved transport policy; false disables dev HTTP in a stdio worker. */
  devHttp?: boolean
  /** Runs before readiness; useful for attaching generation-owned facades. */
  onGeneration?: (handle: ProjectRuntimeHandle) => void | Promise<void>
  /** Confirms server work stopped after ownership invalidation, before project teardown. */
  onBeforeRelease?: (handle: ProjectRuntimeHandle) => void | Promise<void>
  /** Reports observed restart or startup failures without escaping watcher callbacks. */
  onError?: (error: unknown) => void
}

/** Injectable acquisition seams used by lifecycle tests. */
export interface ProjectRuntimeDependencies {
  /** Acquires one generation without changing process cwd. */
  start: (options: ProjectRuntimeOptions, signal: AbortSignal, isActive: () => boolean) => Promise<RuntimeGeneration>
  /** Owns both Vite and Histoire configuration watchers. */
  watch: (runtime: RuntimeGeneration, options: ProjectRuntimeOptions, restart: (source: string) => void) => Promise<() => Promise<void>>
}
