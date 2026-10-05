import type { Context } from '../context.js'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'pathe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readNodeSource } from './utils/node-source.js'
import {
  cleanupRunTestsTempDirs,
  createRunTestsContext,
  createRunTestsStoryFile,
  createVitestInstanceStub,
  installRunTestsMocks,
} from './utils/run-tests-harness.js'

/**
 * How a run drives Vitest: the invariants it forces over raw CLI args, its
 * safety timeout and retry, and how it fails when the runner misbehaves.
 */

let mocks: ReturnType<typeof installRunTestsMocks>
let runHistoireTests: Awaited<ReturnType<ReturnType<typeof installRunTestsMocks>['load']>>

beforeEach(async () => {
  vi.resetModules()
  mocks = installRunTestsMocks()
  runHistoireTests = await mocks.load()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  cleanupRunTestsTempDirs()
})

describe('runHistoireTests lifecycle', () => {
  it('forces single-run invariants over raw vitest args', async () => {
    const story = createRunTestsStoryFile({
      id: 'invariant-story',
      variantId: 'invariant-variant',
      source: `
        import { onTest } from 'histoire/client'
        onTest(() => {})
      `,
    })

    // Simulate `histoire test -- --watch --config ./evil.ts`.
    const { parseCLI } = await import('vitest/node')
    vi.mocked(parseCLI).mockReturnValueOnce({
      filter: [],
      options: {
        watch: true,
        config: './evil.config.ts',
      },
    } as any)
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await runHistoireTests(createRunTestsContext([story]), { rawVitestArgs: ['--watch', '--config', './evil.config.ts'] })

    // Watch mode is unsupported (the runner is torn down after the first
    // pass) and user configs must never replace the generated one.
    const vitestOptions = mocks.createVitestMock.mock.calls[0][1]
    expect(vitestOptions.watch).toBe(false)
    expect(vitestOptions.run).toBe(true)
    expect(vitestOptions.config).toBe(false)
    expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('does not support watch mode'))
    consoleWarn.mockRestore()
  })

  it('keeps outer Vitest deadlines clear for embedded test lifecycle', async () => {
    const story = createRunTestsStoryFile({
      id: 'deadline-story',
      variantId: 'deadline-variant',
      source: 'onTest(() => {})',
    })

    await runHistoireTests(createRunTestsContext([story]))

    const [generatedSpec] = mocks.generatedSpecCode.values()
    expect(generatedSpec).toContain('}, 0)')
  })

  it('warns when generated specs were not executed by vitest', async () => {
    const story = createRunTestsStoryFile({
      id: 'missing-story',
      variantId: 'missing-variant',
      source: `
        import { onTest } from 'histoire/client'
        onTest(() => {})
      `,
    })

    // Vitest resolves `include` entries as globs; paths with glob-special
    // characters can silently match nothing while passWithNoTests makes the
    // run "pass" — the gap must at least be loudly reported.
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await runHistoireTests(createRunTestsContext([story]))

    expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('Vitest only executed 0'))
    consoleWarn.mockRestore()
  })

  it('fails when Vitest reports module-level errors', async () => {
    const eligibleStory = createRunTestsStoryFile({
      id: 'module-error-story',
      variantId: 'module-error-variant',
      source: `
        import { onTest } from 'histoire/client'
        onTest(() => {})
      `,
    })
    mocks.setTestModules(options => [{
      moduleId: options.include[0],
      errors: () => [new Error('story import exploded')],
      children: {
        allTests: () => [],
      },
    }])

    await expect(runHistoireTests(createRunTestsContext([eligibleStory]))).rejects.toThrow(/story import exploded/)
  })

  it('clears the safety timeout on the start() reject/retry path without leaking timers', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    let startAttempts = 0
    // First start() rejects with a retryable browser failure, the retry succeeds.
    mocks.setCreateVitest(vi.fn(async (_mode: string, options: any) => createVitestInstanceStub({
      options,
      start: vi.fn(async () => {
        startAttempts++
        if (startAttempts === 1) {
          throw new Error('Browser connection was closed while running tests')
        }
      }),
    })))

    const eligibleStory = createRunTestsStoryFile({
      id: 'retry-story',
      variantId: 'retry-variant',
      source: `
        import { onTest } from 'histoire/client'
        onTest(() => {})
      `,
    })

    await runHistoireTests(createRunTestsContext([eligibleStory]))

    // Both attempts ran (initial + retry) and no safety timer is left pending.
    expect(startAttempts).toBe(2)
    expect(mocks.createVitestMock).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
    // The first attempt's safety timer must be cleared even though start() rejected.
    expect(clearTimeoutSpy).toHaveBeenCalled()
  })

  it('runs explicit no-retry request once after execution started', async () => {
    let executions = 0
    mocks.setCreateVitest(vi.fn(async (_mode: string, options: any) => createVitestInstanceStub({ options, start: vi.fn(async () => {
      executions++
      throw new Error('Browser connection was closed while running tests')
    }) })))
    const story = createRunTestsStoryFile({ id: 'once', variantId: 'main', source: `import { onTest } from 'histoire/client'; onTest(() => {})` })
    await expect(runHistoireTests(createRunTestsContext([story]), { maxRetries: 0 })).rejects.toThrow('Browser connection was closed')
    expect(executions).toBe(1)
  })

  it('never lets a failing cleanup mask the run error or defeat the browser-crash retry', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // A rejecting teardown on the failure path used to propagate instead of the
    // real test error, which also skipped the retry below it.
    mocks.cleanupVitestBrowserRunMock.mockRejectedValue(new Error('teardown exploded'))
    let startAttempts = 0
    mocks.setCreateVitest(vi.fn(async (_mode: string, options: any) => createVitestInstanceStub({
      options,
      start: vi.fn(async () => {
        startAttempts++
        throw new Error('Browser connection was closed while running tests')
      }),
    })))

    const story = createRunTestsStoryFile({
      id: 'cleanup-failure-story',
      variantId: 'cleanup-failure-variant',
      source: 'onTest(() => {})',
    })

    // The browser crash still surfaces — not the teardown error.
    await expect(runHistoireTests(createRunTestsContext([story]))).rejects.toThrow(/Browser connection was closed/)
    // The retryable failure was retried despite both cleanups rejecting.
    expect(startAttempts).toBe(2)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('cleanup failed'))
  })

  it('honours the configured test run timeout', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.setCreateVitest(vi.fn(async (_mode: string, options: any) => createVitestInstanceStub({
      options,
      // Never resolves: only the safety timeout can end the run.
      start: vi.fn(() => new Promise<void>(() => {})),
    })))

    const story = createRunTestsStoryFile({
      id: 'timeout-story',
      variantId: 'timeout-variant',
      source: 'onTest(() => {})',
    })
    // The default 300s safety timeout would spuriously kill large projects,
    // so the run timeout comes from the histoire config.
    const ctx = createRunTestsContext([story], { test: { runTimeout: 10 } } as Partial<Context['config']>)

    await expect(runHistoireTests(ctx)).rejects.toMatchObject({ code: 'TIMEOUT', message: expect.stringMatching(/timed out/) })
  })

  it('resolves browser test deps from the project root', async () => {
    const { ensureBrowserTestDepsInstalled } = await import('../test/index.js')

    // Project with both provider packages installed locally: the check must
    // resolve them from the given root (not from histoire's own context).
    const okRoot = fs.mkdtempSync(join(os.tmpdir(), 'histoire-deps-'))
    for (const name of ['@vitest/browser-playwright', 'playwright']) {
      const dir = join(okRoot, 'node_modules', name)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '0.0.0', main: 'index.js' }))
      fs.writeFileSync(join(dir, 'index.js'), 'module.exports = {}')
    }
    fs.writeFileSync(join(okRoot, 'package.json'), JSON.stringify({ name: 'fixture' }))
    await expect(ensureBrowserTestDepsInstalled(okRoot)).resolves.toBeUndefined()

    // The missing-deps path cannot be exercised with the real package names
    // here (pnpm exposes them via NODE_PATH even from an empty root), so pin
    // the actionable message at the source level instead of a raw
    // ERR_MODULE_NOT_FOUND stack.
    const source = readNodeSource('test/preflight.ts')
    expect(source).toContain('Install with: pnpm add -D')
    expect(source).toContain('missing.push(dependency)')
  })

  it('checks the optional Vitest peer before loading the test runner', () => {
    const source = readNodeSource('commands/test.ts')

    expect(source).not.toMatch(/^import \{ runHistoireTests \}/m)
    expect(source).toContain('ensureProjectVitest(ctx)')
    expect(source).toMatch(/ensureProjectVitest\(ctx\)[\s\S]*await import\('\.\.\/test\/index\.js'\)/)
  })

  it('flushes its output before ending, and still terminates when handles linger', async () => {
    // Both CLI commands can leave a timed-out browser/provider behind. An
    // immediate `process.exit()` discards buffered writes on a piped stdout
    // (CI logs, `| tee`) and truncates the report; `exitAfterFlush` flushes
    // first and only force-exits after a grace period — see exit.spec.ts for
    // the behavioral coverage.
    for (const command of ['commands/test.ts', 'commands/build.ts']) {
      const source = readNodeSource(command)
      expect(source).toContain('await exitAfterFlush()')
      // No bare `process.exit(...)` statement left (the comment mentioning it
      // is not a call).
      expect(source).not.toMatch(/^\s*process\.exit\(/m)
    }
  })
})
