import type { DevOptions } from '@histoire/cli'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMcpCliProject } from '../utils/mcp/cli-project.js'

// Boundary: the built `dev` command (real proxy, forked runtime, config loader,
// Vite servers, collector, optimizer cache) run in this process; the parent
// progress state is read exactly as the terminal will read it. An external HTTP
// gate holds configuration so progress and listener availability are observed
// independently. Defects: progress invented instead of observed, failures
// hidden, duplicate or mislabelled restart notices, fresh restart not changing
// real work (or sticking), another context's cache removed.
type DevSession = Awaited<ReturnType<typeof import('../../../../../histoire-cli/src/commands/dev.js').devCommand>>
type DevCommand = (options: DevOptions) => Promise<DevSession>
const devCommandUrl = new URL('../../../../../histoire-cli/dist/commands/dev.js', import.meta.url).href
const devHostUrl = new URL('../../../../dist/node/commands/dev-host.js', import.meta.url).href

/** Loads the built dev parent from the CLI package with histoire's built injection, as `histoire dev` wires them. */
async function loadDevCommand(): Promise<DevCommand> {
  const { devCommand } = await import(devCommandUrl)
  const { devInjection } = await import(devHostUrl)
  return options => devCommand(options, { ...devInjection, version: '' })
}

let saved: NodeJS.ProcessEnv
beforeEach(() => {
  // The runtime must resolve packages like an installed consumer, not through the runner.
  saved = { ...process.env }
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('VITEST') || key === 'NODE_PATH' || key === 'NODE_OPTIONS') delete process.env[key]
  }
  process.env.BROWSER = 'none'
})
afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key]
  Object.assign(process.env, saved)
})

/** Counts stdout lines the command prints for restart transitions. */
function watchNotices() {
  const lines: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    for (const line of String(chunk).split('\n')) {
      if (/restart/i.test(line)) lines.push(line.trim())
    }
    return true
  })
  return { lines, stop: () => spy.mockRestore() }
}

it('observes real startup phases behind a held config, a failing config, and recovery on one URL', async () => {
  const fixture = await createMcpCliProject()
  const flag = resolve(fixture.root, 'hold')
  let releaseConfig: (() => void) | undefined
  const gate = createServer((_, response) => {
    releaseConfig = () => response.end('go')
  })
  await new Promise<void>(resolve => gate.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${(gate.address() as { port: number }).port}`
  const config = (body = '') => `
    import { existsSync } from 'node:fs'; import { HstVue } from '@histoire/plugin-vue';
    if (existsSync(${JSON.stringify(flag)})) await fetch('${origin}/config');
    ${body}
    export default { mcp: false, plugins: [HstVue(), { name: 'slow-hook', onDev() {} }], storyMatch: ['*.story.vue'] };
  `
  const file = resolve(fixture.root, 'custom config.ts')
  await writeFile(file, config())
  await writeFile(flag, '')
  const notices = watchNotices()
  const devCommand = await loadDevCommand()
  const dev = await devCommand({ root: fixture.root, config: 'custom config.ts', port: 0, host: '127.0.0.1', mcp: false })
  try {
    // Config evaluation is held: the listener answers and the progress names the wait.
    await expect.poll(() => typeof releaseConfig, { timeout: 60_000 }).toBe('function')
    expect((await fetch(dev.url, { headers: { accept: 'text/html' } })).status).toBe(200)
    const waiting = dev.progress.snapshot()
    expect(waiting.status).toBe('starting')
    expect(waiting.active.map(phase => phase.phase)).toEqual(['config'])
    await expect.poll(() => dev.progress.snapshot().active[0]?.elapsedMs).toBeGreaterThan(waiting.active[0].elapsedMs)

    await rm(flag, { force: true })
    releaseConfig!()
    await dev.ready
    const ready = dev.progress.snapshot()
    expect(ready.status).toBe('ready')
    expect(ready.readyAfterMs).toBeGreaterThan(0)
    const completed = ready.phases.filter(phase => phase.status === 'completed').map(phase => phase.phase)
    expect(completed).toEqual(expect.arrayContaining(['config', 'vite', 'scan', 'markdown', 'plugins', 'listen', 'collect', 'warmup', 'attach']))
    // The only denominator is the collector's: one story file in this project.
    expect(ready.phases.find(phase => phase.phase === 'collect')).toMatchObject({ current: 1, total: 1 })
    expect(ready.phases.filter(phase => phase.phase !== 'collect').every(phase => phase.total === undefined)).toBe(true)

    // A broken config edit: one labelled notice, the failed phase stays visible, same URL recovers.
    await writeFile(file, 'export default { invalid syntax')
    await expect.poll(() => dev.progress.snapshot().status, { timeout: 60_000 }).toBe('failed')
    expect(dev.progress.snapshot()).toMatchObject({ status: 'failed', failed: { phase: 'config' }, cause: { kind: 'config', source: 'Histoire: custom config.ts' } })
    expect(dev.progress.snapshot().failed?.error).toBeTruthy()
    await writeFile(file, config())
    await expect.poll(() => dev.status, { timeout: 60_000 }).toBe('ready')
    await expect.poll(() => dev.progress.snapshot().status).toBe('ready')
    expect(dev.progress.snapshot().failed).toBeUndefined()
    expect((await fetch(dev.url)).status).toBe(200)

    await dev.restart()
    expect(dev.progress.snapshot().cause).toEqual({ kind: 'manual', fresh: false })
    expect(notices.lines).toEqual([
      'Config changed, restarting (Histoire: custom config.ts)...',
      'Config changed, restarting (Histoire: custom config.ts)...',
      'Restarting...',
    ])
  }
  finally {
    notices.stop()
    releaseConfig?.()
    await dev.close()
    gate.closeAllConnections()
    await new Promise<void>(resolve => gate.close(() => resolve()))
    await fixture.close()
  }
}, 240_000)

it('fresh restart bypasses catalog and dependency caches once, leaves other caches alone, then reuse resumes', async () => {
  const fixture = await createMcpCliProject()
  await writeFile(resolve(fixture.root, 'custom config.ts'), `import { HstVue } from '@histoire/plugin-vue'; export default { mcp: false, plugins: [HstVue()], storyMatch: ['*.story.vue'] };`)
  const cache = resolve(fixture.root, '.histoire/cache')
  // Vite empties the dependency cache directory only when it re-optimizes: a marker inside shows whether it did.
  const marker = resolve(cache, 'vite/dev-client/deps/reuse-marker.txt')
  const other = resolve(cache, 'vite/other-context/marker.txt')
  await mkdir(resolve(other, '..'), { recursive: true })
  await writeFile(other, 'other context')
  const devCommand = await loadDevCommand()
  const dev = await devCommand({ root: fixture.root, config: 'custom config.ts', port: 0, host: '127.0.0.1', mcp: false })
  const restore = () => dev.progress.snapshot().phases.find(phase => phase.phase === 'restore')
  try {
    await dev.ready
    await expect.poll(() => existsSync(resolve(cache, 'collection/stories.bin'))).toBe(true)
    // First run: nothing to restore.
    expect(restore()).toMatchObject({ status: 'skipped', label: 'no usable cache' })
    await writeFile(marker, 'cached')

    await dev.restart()
    expect(restore()?.status).toBe('completed')
    expect(existsSync(marker)).toBe(true)

    await dev.restart({ fresh: true })
    expect(dev.progress.snapshot()).toMatchObject({ fresh: true, cause: { kind: 'manual', fresh: true } })
    expect(restore()).toMatchObject({ status: 'skipped', label: 'fresh restart' })
    expect(dev.progress.snapshot().phases.find(phase => phase.phase === 'collect')?.status).toBe('completed')
    expect(existsSync(marker)).toBe(false)
    expect(await readFile(other, 'utf8')).toBe('other context')
    await writeFile(marker, 'cached again')

    // One-shot: the next ordinary restart reuses both caches again.
    await dev.restart()
    expect(dev.progress.snapshot().fresh).toBe(false)
    expect(restore()?.status).toBe('completed')
    expect(existsSync(marker)).toBe(true)
  }
  finally {
    await dev.close()
    await fixture.close()
  }
}, 300_000)
