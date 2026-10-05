import type { AcpManagerOptions } from '../../acp/types.js'
import { fileURLToPath } from 'node:url'
import { join } from 'pathe'
import { createAcpManager } from '../../acp/manager.js'
import { configTestProject } from './config-codemod.js'

/** All process tests use this controlled protocol peer, without external adapters. */
export const fakeAgentFile = fileURLToPath(new URL('../fixtures/acp/fake-agent.mjs', import.meta.url))
/** Test-owned managers close before their scratch roots are removed. */
const managers: ReturnType<typeof createAcpManager>[] = []

/** Registers a manager with shared test teardown, including no-launch preference cases. */
export function testAgentManager(options: AcpManagerOptions) {
  const manager = createAcpManager(options)
  managers.push(manager)
  return manager
}

/** Creates an enabled lazy peer with isolated user settings and configurable lifecycle. */
export async function fakeManager(scenario = 'normal', enabled = true, idleTimeoutMs?: number, extra: Partial<AcpManagerOptions> = {}) {
  const { root } = await configTestProject()
  const manager = testAgentManager({ root, idleTimeoutMs, dataFile: join(root, 'user/agents.json'), config: { enabled, presets: [{ id: 'fake', name: 'Fake', command: process.execPath, args: [fakeAgentFile, scenario], default: true }] }, ...extra })
  return { root, manager }
}

/** Releases only managers acquired through this fixture, including failed tests. */
export async function disposeAgentManagers(): Promise<void> {
  await Promise.all(managers.splice(0).map(manager => manager.close()))
}
