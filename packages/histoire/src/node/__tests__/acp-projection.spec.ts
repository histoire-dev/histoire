import type { UiAgentCommand, UiAgentSettings, UiAgentStatus } from '@histoire/shared'
import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { projectAgentStatuses } from '../acp/projection.js'

describe('aCP status projection', () => {
  it('keeps settings, statuses and commands together beneath the channel budget', () => {
    const ids = Array.from({ length: 32 }, (_, index) => `agent-${index}`)
    // Near the 32KB settings validation limit.
    const settings: UiAgentSettings = {
      enabled: true,
      enabledIds: ids,
      presets: ids.map(id => ({ id, name: id, command: 'agent', args: ['x'.repeat(900)] })),
      permissions: { fileEdits: 'ask', terminal: 'ask' },
      context: { exposeMcp: true, attachScreenshot: true, includeSource: true, askEachTime: false },
    }
    const statuses = new Map<string, UiAgentStatus>(ids.map(id => [id, { id, name: id, state: 'error', enabled: true, error: 'e'.repeat(4000), logs: Array.from({ length: 30 }, () => 'l'.repeat(2000)), envKeys: [] }]))
    const list: UiAgentCommand[] = Array.from({ length: 64 }, (_, index) => ({ name: `command-${index}`, description: 'd'.repeat(120), hint: 'h'.repeat(120) }))
    const agents = projectAgentStatuses(settings, statuses, {}, text => text, new Map(ids.map(id => [id, list])))
    expect(agents.some(agent => agent.commands?.length)).toBe(true)
    expect(Buffer.byteLength(JSON.stringify({ ...settings, agents }))).toBeLessThan(60_000)
  })
})
