import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { createPermissionBroker } from '../acp/permissions.js'
import { configTestProject, disposeConfigProjects } from './utils/config-codemod.js'

afterEach(disposeConfigProjects)

describe('aCP permission ownership', () => {
  it.each(['other-agent', 'other-session', 'same-session', 'global'] as const)('scopes asynchronous allow-src cancellation to %s', async (scope) => {
    const { root } = await configTestProject()
    await mkdir(join(root, 'src'))
    await writeFile(join(root, 'src/button.ts'), '')
    const broker = createPermissionBroker({ root, policy: () => ({ fileEdits: 'allow-src', terminal: 'never' }), emit: () => {}, sanitize: value => value })
    try {
      const request = broker.request('B', { sessionId: 'session-B', toolCall: { toolCallId: 'edit', kind: 'edit', locations: [{ path: join(root, 'src/button.ts') }] }, options: [{ optionId: 'once', name: 'Allow', kind: 'allow_once' }] })
      if (scope === 'other-agent') broker.settle('A', 'session-A')
      else if (scope === 'other-session') broker.settle('B', 'session-A')
      else if (scope === 'same-session') broker.settle('B', 'session-B')
      else broker.cancel()
      expect((await request).outcome.outcome).toBe(scope === 'other-agent' || scope === 'other-session' ? 'selected' : 'cancelled')
    }
    finally { broker.close() }
  })
})
