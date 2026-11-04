import type { CliHost } from '../commands/host.js'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runCli } from '../cli.js'
import { devCommand } from '../commands/dev.js'

// The dev parent binds a real proxy; only its entry is replaced, so the wiring in front of it is real.
vi.mock('../commands/dev.js', () => ({ devCommand: vi.fn() }))

/** Every command loader as a spy over its own handler spy. */
function createHost() {
  const handlers = { mcp: vi.fn(), build: vi.fn(), preview: vi.fn(), test: vi.fn(), screenshotSetup: vi.fn(), visual: vi.fn() }
  const loaders = Object.fromEntries(Object.entries(handlers).map(([name, handler]) => [name, vi.fn(async () => handler)])) as unknown as { [Name in keyof typeof handlers]: ReturnType<typeof vi.fn> }
  const injection = { runtime: new URL('file:///child.js'), captureMcpToken: () => undefined, resolveDevMcpOptions: () => undefined }
  const dev = vi.fn(async () => injection)
  /** Runs the CLI on `histoire ...args` and waits for the selected action. */
  const run = (...args: string[]) => runCli({ version: '1.2.3', dev, commands: loaders as unknown as CliHost['commands'], argv: ['node', 'histoire', ...args] }) as Promise<unknown> | undefined
  return { handlers, loaders, injection, dev, run }
}

afterEach(() => {
  vi.mocked(devCommand).mockReset()
  process.exitCode = undefined
})

// Boundary: real Sade definitions and dispatch; command implementations are injected spies.
describe('runCli', () => {
  it('loads only the selected command and hands it the parsed options', async () => {
    const host = createHost()
    await host.run('build', '-c', 'custom config.ts', '--target', 'node')
    expect(host.handlers.build).toHaveBeenCalledWith(expect.objectContaining({ config: 'custom config.ts', target: 'node' }))
    for (const name of ['mcp', 'preview', 'test', 'screenshotSetup', 'visual'] as const) expect(host.loaders[name]).not.toHaveBeenCalled()
    expect(host.dev).not.toHaveBeenCalled()
  })

  it('forwards the arguments after -- to the test command untouched', async () => {
    const host = createHost()
    await host.run('test', '-c', 'x.ts', '--', '--grep', 'button', '--reporter=dot')
    expect(host.handlers.test).toHaveBeenCalledWith(expect.objectContaining({ config: 'x.ts' }), ['--grep', 'button', '--reporter=dot'])
  })

  it('starts the dev parent with the injection, the version and --test-watch as testWatch', async () => {
    const host = createHost()
    await host.run('dev', '--port', '0', '--test-watch', '--no-tui')
    expect(devCommand).toHaveBeenCalledWith(expect.objectContaining({ port: 0, testWatch: true, tui: false }), { ...host.injection, version: '1.2.3' })
    expect(vi.mocked(devCommand).mock.calls[0][0]).not.toHaveProperty('test-watch')
  })

  it('refuses --mcp with --no-mcp before loading the dev parent, but ignores flags after --', async () => {
    const host = createHost()
    await expect(host.run('dev', '--mcp', '--no-mcp')).rejects.toThrow('--mcp and --no-mcp cannot be combined')
    expect(host.dev).not.toHaveBeenCalled()
    expect(devCommand).not.toHaveBeenCalled()
    await host.run('dev', '--no-mcp', '--', '--mcp')
    expect(devCommand).toHaveBeenCalledOnce()
  })

  it('exits with status 2 on invalid screenshot-setup arguments without loading the command', () => {
    const host = createHost()
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    expect(host.run('screenshot-setup', '--bogus')).toBeUndefined()
    expect(process.exitCode).toBe(2)
    expect(stderr).toHaveBeenCalledWith('Invalid screenshot-setup arguments.\n')
    expect(host.loaders.screenshotSetup).not.toHaveBeenCalled()
    stderr.mockRestore()
  })
})
