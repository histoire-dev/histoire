import type { Context } from '../../context.js'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'pathe'
import { vi } from 'vitest'

/**
 * Shared harness for the `runHistoireTests` specs.
 *
 * The run itself is exercised for real (story targeting, spec generation,
 * summary building); only what it drives is replaced: Vitest, the browser
 * story collection, the Vite config builders and the story/markdown scan.
 */

/** Temp project roots created by {@link createRunTestsContext}, removed by {@link cleanupRunTestsTempDirs}. */
const tempDirs: string[] = []

/** Creates a minimal histoire context rooted in a fresh temp directory. */
export function createRunTestsContext(storyFiles: any[], config: Partial<Context['config']> = {}): Context {
  const root = fs.mkdtempSync(join(os.tmpdir(), 'histoire-run-tests-'))
  tempDirs.push(root)

  return {
    root,
    config: config as Context['config'],
    resolvedViteConfig: {} as Context['resolvedViteConfig'],
    mode: 'dev',
    storyFiles,
    supportPlugins: [],
    markdownFiles: [],
    registeredCommands: [],
  }
}

/** Removes every temp project root created for the current test. */
export function cleanupRunTestsTempDirs() {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

/** Creates a collected story file stub with one variant. */
export function createRunTestsStoryFile(options: {
  id: string
  variantId: string
  source: string
}) {
  return {
    id: `${options.id}-file`,
    path: `/virtual-root/src/${options.id}.story.ts`,
    relativePath: `src/${options.id}.story.ts`,
    fileName: options.id,
    supportPluginId: 'vue3',
    moduleId: `/virtual-root/src/${options.id}.story.ts`,
    virtual: true,
    moduleCode: options.source,
    story: {
      id: options.id,
      title: options.id,
      variants: [{
        id: options.variantId,
        title: options.variantId,
      }],
    },
  }
}

export interface VitestInstanceStubOptions {
  /** Options `createVitest` was called with, exposed back on the instance. */
  options?: any
  /** Replaces the default no-op `start()`. */
  start?: () => Promise<void>
  /** Replaces the default no-op `close()`. */
  close?: () => Promise<void>
  /** Test modules the run reports. */
  getTestModules?: () => any[]
  /** Unhandled errors the run reports. */
  getUnhandledErrors?: () => unknown[]
}

/** Builds the minimal Vitest instance shape the run reads. */
export function createVitestInstanceStub(options: VitestInstanceStubOptions = {}) {
  return {
    options: options.options,
    start: vi.fn(options.start ?? (async () => {})),
    // The run must never wait on it: `start()` already resolves when the run
    // ended, and awaiting both would hang once Vitest resolves them in order.
    waitForTestRunEnd: vi.fn(async () => {}),
    close: vi.fn(options.close ?? (async () => {})),
    state: {
      getTestModules: () => options.getTestModules?.() ?? [],
      getUnhandledErrors: () => options.getUnhandledErrors?.() ?? [],
    },
  }
}

/** The mocks a run spec drives, returned by {@link installRunTestsMocks}. */
export interface RunTestsMocks {
  createVitestMock: ReturnType<typeof vi.fn>
  collectStoriesBrowserMock: ReturnType<typeof vi.fn>
  cleanupVitestBrowserRunMock: ReturnType<typeof vi.fn>
  /** Source of the specs the run generated, snapshotted before it deletes them. */
  generatedSpecCode: Map<string, string>
  /** Test modules the stubbed Vitest reports, per `createVitest` options. */
  setTestModules: (getTestModules: (options: any) => any[]) => void
  /** Replaces the whole `createVitest` stub (timeout/retry specs need their own). */
  setCreateVitest: (createVitest: ReturnType<typeof vi.fn>) => void
  /** Imports `runHistoireTests` with the mocks installed. */
  load: () => Promise<typeof import('../../test/index.js').runHistoireTests>
}

/**
 * Installs the module mocks of a run spec. Call from `beforeEach`, after
 * `vi.resetModules()`.
 */
export function installRunTestsMocks(): RunTestsMocks {
  const generatedSpecCode = new Map<string, string>()
  let getTestModules: (options: any) => any[] = () => []
  let createVitestMock = vi.fn(async (_mode: string, options: any) => {
    // Snapshot the generated specs: the run owns (and deletes) its spec
    // directory, so they are gone by the time assertions run.
    for (const specPath of options.include ?? []) {
      generatedSpecCode.set(specPath, fs.readFileSync(specPath, 'utf8'))
    }
    return createVitestInstanceStub({
      options,
      getTestModules: () => getTestModules(options),
    })
  })
  // The browser collection is the source of truth for test eligibility: it
  // reports which collected stories actually registered `onTest(...)`.
  const collectStoriesBrowserMock = vi.fn(async (_ctx: any, options: any) => ({
    files: (options?.storyFiles ?? []).map((storyFile: any) => ({
      storyFile,
      hasTests: true,
    })),
    failures: [],
  }))
  const cleanupVitestBrowserRunMock = vi.fn(async () => {})

  vi.doMock('vitest/node', () => ({
    createVitest: (...args: any[]) => createVitestMock(...args),
    parseCLI: vi.fn(() => ({
      filter: [],
      options: {},
    })),
  }))
  vi.doMock('../../util/project-vitest.js', () => ({
    loadProjectVitest: async () => import('vitest/node'),
  }))
  vi.doMock('../../markdown.js', () => ({
    scanMarkdownFiles: vi.fn(async () => {}),
  }))
  vi.doMock('../../stories.js', () => ({
    findAllStories: vi.fn(async () => {}),
  }))
  vi.doMock('../../story-collection/index.js', () => ({
    collectStoriesBrowser: collectStoriesBrowserMock,
  }))
  vi.doMock('../../vitest-browser-cleanup.js', () => ({
    cleanupVitestBrowserRun: cleanupVitestBrowserRunMock,
  }))
  vi.doMock('../../util/has-vitest.js', () => ({
    hasProjectVitest: vi.fn(() => true),
  }))
  vi.doMock('../../util/vitest-errors.js', () => ({
    assertVitestRunHasNoUnhandledErrors: vi.fn(() => {}),
    formatVitestError: vi.fn((error: unknown) => error instanceof Error ? error.message : String(error)),
    getUnhandledVitestErrors: vi.fn(() => []),
  }))
  vi.doMock('../../vite/index.js', () => ({
    getViteConfigWithPlugins: vi.fn(async () => ({
      viteConfig: {},
    })),
  }))
  vi.doMock('../../vitest-browser-config/index.js', () => ({
    assignVitestBrowserProjectOptions: vi.fn(() => {}),
    createVitestBrowserRuntimeConfig: vi.fn(async (_ctx: any, viteConfig: any) => ({
      vitestOptions: {},
      viteConfig,
    })),
    debugVitestBrowserLifecycle: vi.fn(() => {}),
  }))

  return {
    get createVitestMock() {
      return createVitestMock
    },
    collectStoriesBrowserMock,
    cleanupVitestBrowserRunMock,
    generatedSpecCode,
    setTestModules(next) {
      getTestModules = next
    },
    setCreateVitest(next) {
      createVitestMock = next
    },
    async load() {
      const { runHistoireTests } = await import('../../test/index.js')
      return runHistoireTests
    },
  }
}
