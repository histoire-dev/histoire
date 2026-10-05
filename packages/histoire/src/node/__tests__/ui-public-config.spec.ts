import type { Context } from '../context.js'
import { describe, expect, it } from 'vitest'
import { resolvedConfig } from '../virtual/resolved-config.js'

describe('workbench public config', () => {
  it('never serializes agent environment secrets into development client modules', () => {
    const ctx = { mode: 'dev', config: { agents: { enabled: true, presets: [{ id: 'test', name: 'Test', command: 'agent', env: { TOKEN: 'private-secret' } }] } } } as Context
    const output = resolvedConfig(ctx)
    expect(output).not.toContain('private-secret')
    expect(output).not.toContain('TOKEN')
    expect(output).toContain('agent')
  })

  it('omits agent launch settings and comments paths from static client modules', () => {
    const ctx = { mode: 'build', config: { agents: { enabled: true, presets: [{ command: 'private-command' }] }, comments: { file: 'private-comments.json' }, ui: { frameBudget: 12 } } } as Context
    const output = resolvedConfig(ctx)
    expect(output).not.toContain('private-command')
    expect(output).not.toContain('private-comments')
    expect(output).toContain('frameBudget')
  })
})
