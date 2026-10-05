import type { ClientOptions } from '@modelcontextprotocol/client'
import type { Buffer } from 'node:buffer'
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createPackageProcessEnvironment } from '../process-environment.js'
import { MCP_BUILT_CLI } from './cli-project.js'

/** Compatibility name retained for existing MCP fixtures. */
export { createPackageProcessEnvironment as createMcpProcessEnvironment } from '../process-environment.js'

/** Both revisions promised by Histoire; legacy negotiation uses SDK compatibility. */
export const MCP_PROTOCOLS: [string, ClientOptions][] = [
  ['2026-07-28', { versionNegotiation: { mode: { pin: '2026-07-28' } } }],
  ['2025-11-25', {}],
]

/** Drain dependents before removing fixtures; every rejected close fails acceptance. */
export async function closeMcpFixtures(cleanup: (() => Promise<unknown>)[]) {
  const failures: unknown[] = []
  for (const close of cleanup.splice(0).reverse()) {
    try {
      await close()
    }
    catch (error) { failures.push(error) }
  }
  if (failures.length) throw new AggregateError(failures, 'MCP fixture cleanup could not be confirmed')
}

/** Launch only owned child; bound logs, completion, startup and shutdown. */
export function startMcpProcess(args: string[], cwd: string, environment: NodeJS.ProcessEnv = {}, entry = MCP_BUILT_CLI) {
  const env = createPackageProcessEnvironment(environment)
  const child = spawn(process.env.HISTOIRE_MCP_TEST_NODE || process.execPath, [entry, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  const listeners = new Set<() => void>()
  const append = (bytes: Buffer) => {
    output = (output + bytes.toString()).slice(-32000)
    listeners.forEach(listener => listener())
  }
  child.stdout.on('data', append)
  child.stderr.on('data', append)
  const completion = new Promise<{ code: number | null, signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  completion.catch(() => {})
  /** Keep local addresses out of failure output shown by test runner. */
  function diagnostics() {
    return output.replace(/https?:\/\/\S+/g, '[local URL]')
  }
  /** Drain exact child; escalation fails acceptance instead of masking leak. */
  async function closeOwned(signal: NodeJS.Signals = 'SIGTERM') {
    if (child.exitCode !== null || child.signalCode !== null) return completion
    child.kill(signal)
    const timeoutHandle = setTimeout(() => child.kill('SIGKILL'), 20000)
    try {
      const result = await completion
      if (result.signal === 'SIGKILL') throw new Error(`Owned process did not drain: ${diagnostics()}`)
      return result
    }
    finally { clearTimeout(timeoutHandle) }
  }
  return {
    child,
    completion,
    /** Bounded diagnostic tail. */
    output: () => output,
    /** Wait for output event rather than arbitrary boot sleep. */
    async waitFor(pattern: RegExp, timeout = 30000): Promise<RegExpExecArray> {
      return new Promise((resolve, reject) => {
        let timeoutHandle: ReturnType<typeof setTimeout>
        const inspect = () => {
          const match = pattern.exec(output)
          if (match) finish(undefined, match)
        }
        function finish(error?: Error, match?: RegExpExecArray) {
          clearTimeout(timeoutHandle)
          listeners.delete(inspect)
          error ? reject(error) : resolve(match!)
        }
        timeoutHandle = setTimeout(() => finish(new Error(`Startup deadline: ${diagnostics()}`)), timeout)
        listeners.add(inspect)
        completion.then(() => finish(new Error(`Process closed during startup: ${diagnostics()}`)), finish)
        inspect()
      })
    },
    /** Observe finite build/startup failure without leaving owned child behind. */
    async waitForExit(timeout = 120000) {
      let timer: ReturnType<typeof setTimeout>
      let expired = false
      try {
        return await Promise.race([completion, new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            expired = true
            reject(new Error(`Process completion deadline: ${diagnostics()}`))
          }, timeout)
        })])
      }
      finally {
        clearTimeout(timer!)
        if (expired) await closeOwned()
      }
    },
    /** Drain exact child; escalation fails acceptance instead of masking leak. */
    close: closeOwned,
  }
}

/** Connect official SDK HTTP transport with explicit identity and optional bearer. */
export async function connectMcpHttp(endpoint: string, options: ClientOptions = {}, token?: string) {
  const client = new Client({ name: 'histoire-conformance', version: '1.0.0' }, options)
  await client.connect(new StreamableHTTPClientTransport(new URL(endpoint), {
    requestInit: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  }))
  return client
}

/** Read structured envelope with useful bounded failure diagnostics. */
export async function callMcp(client: Client, name: string, arguments_: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: arguments_ })
  return result.structuredContent as any
}

/** Poll public lifecycle with finite deadline; condition decides completion. */
export async function waitMcp<T>(read: () => Promise<T>, done: (value: T) => boolean, timeout = 60000): Promise<T> {
  const deadline = Date.now() + timeout
  let value: T
  do {
    value = await read()
    if (done(value)) return value
    await new Promise(resolve => setTimeout(resolve, 50))
  } while (Date.now() < deadline)
  throw new Error(`MCP condition deadline: ${JSON.stringify(value).slice(0, 8000)}`)
}

/** Verify owned PID exited and exact ephemeral listener can bind again. */
export async function assertMcpProcessReleased(child: Pick<ChildProcess, 'pid'>, endpoint: string) {
  if (child.pid) {
    try {
      process.kill(child.pid, 0)
      throw new Error('Owned PID still exists')
    }
    catch (error: any) { if (error.code !== 'ESRCH') throw error }
  }
  const server = createServer()
  server.listen(Number(new URL(endpoint).port), '127.0.0.1')
  await once(server, 'listening')
  server.close()
  await once(server, 'close')
}
