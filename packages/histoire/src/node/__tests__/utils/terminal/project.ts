import type { ServerResponse } from 'node:http'
import { writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { createMcpCliProject } from '../mcp/cli-project.js'

/** HTTP gate that holds the project config until released, so tests control startup timing. */
export interface ConfigGate {
  origin: string
  /** Resolves when the config reached the gate. */
  reached: () => Promise<void>
  /** Lets the held config (and every later load) continue. */
  release: () => void
  close: () => Promise<void>
}

/** Starts the gate on an ephemeral loopback port. */
export async function startConfigGate(): Promise<ConfigGate> {
  let held = true
  const waiting: ServerResponse[] = []
  let arrived: () => void
  const reached = new Promise<void>(resolveReached => (arrived = resolveReached))
  const server = createServer((_request, response) => {
    if (held) {
      waiting.push(response)
      arrived()
    }
    else {
      response.end('go')
    }
  })
  await new Promise<void>((resolveListening, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListening)
  })
  return {
    origin: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    reached: () => reached,
    release() {
      held = false
      for (const response of waiting.splice(0)) response.end('go')
    },
    close: () => new Promise<void>((resolveClosed) => {
      server.closeAllConnections()
      server.close(() => resolveClosed())
    }),
  }
}

/**
 * Quiet one-story project for terminal runs; config path is `custom config.ts`.
 * @param gate Optional gate the config waits on before exporting.
 */
export async function createTerminalProject(gate?: ConfigGate) {
  const project = await createMcpCliProject()
  await writeFile(resolve(project.root, 'custom config.ts'), `
import { HstVue } from '@histoire/plugin-vue';
${gate ? `await fetch('${gate.origin}/config');` : ''}
export default { plugins: [HstVue()], storyMatch: ['*.story.vue'], mcp: false };
`)
  return project
}

/** CLI arguments for an ephemeral loopback dev server using the project config. */
export const TERMINAL_DEV_ARGS = ['dev', '--port', '0', '--host', '127.0.0.1', '--config', 'custom config.ts', '--no-mcp']
