import type { UiAgentPlan } from '@histoire/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { projectAgentPlan } from '../acp/plan.js'
import { disposeAgentManagers, fakeManager } from './utils/acp.js'
import { disposeConfigProjects } from './utils/config-codemod.js'

afterEach(async () => {
  await disposeAgentManagers()
  await disposeConfigProjects()
})

describe('agent plan', () => {
  it('bounds, redacts and drops unknown plan fields', () => {
    const entries = [
      { content: 'Use hunter2', priority: 'high', status: 'completed' },
      { content: 'x'.repeat(400), priority: 'urgent', status: 'in_progress' },
      { content: 'Bad status', priority: 'low', status: 'skipped' },
      ...Array.from({ length: 60 }, (_, index) => ({ content: `Step ${index}`, priority: 'low', status: 'pending' })),
    ]
    const plan = projectAgentPlan(entries as never, text => text.replace('hunter2', '[redacted]'))
    expect(plan).toHaveLength(50)
    expect(plan[0]).toEqual({ content: 'Use [redacted]', priority: 'high', status: 'completed' })
    expect(plan[1]).toEqual({ content: 'x'.repeat(300), status: 'in_progress' })
    expect(plan[2]).toEqual({ content: 'Bad status', priority: 'low', status: 'pending' })
  })

  it('streams plan replacements and returns the last plan with the reply', async () => {
    const { manager } = await fakeManager('plan')
    const plans: UiAgentPlan[] = []
    manager.onUpdate((event) => {
      if (event.type === 'plan') plans.push(event.value)
    })
    const result = await manager.prompt({ threadId: 'one', text: 'Plan' })
    expect(plans.map(plan => plan.entries.map(entry => entry.status))).toEqual([['in_progress', 'pending'], ['completed', 'in_progress']])
    expect(plans[0]).toMatchObject({ agentId: 'fake', threadId: 'one' })
    expect(result).toMatchObject({ text: 'planned', plan: [{ content: 'Read story', status: 'completed' }, { content: 'Add prop', status: 'in_progress' }] })
  })
})
