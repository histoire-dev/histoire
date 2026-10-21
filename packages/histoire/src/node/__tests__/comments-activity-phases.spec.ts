import type { UiAgentStep } from '@histoire/shared'
import { describe, expect, it } from 'vitest'
import { groupActivityPhases } from '../../../../histoire-app/src/app/components/comments/thread/activity-phases.js'

/** Compact step fixture. */
function step(id: string, kind: UiAgentStep['kind'], extra: Partial<UiAgentStep> = {}): UiAgentStep {
  return { id, kind, title: `${kind} ${id}`, status: 'completed', ...extra }
}

describe('comment activity phases', () => {
  it('groups consecutive steps by phase kind with counted summaries and totals', () => {
    const phases = groupActivityPhases([
      step('1', 'think'),
      step('2', 'read', { target: 'src/a.ts' }),
      step('3', 'read', { target: 'src/b.ts' }),
      step('4', 'search'),
      step('5', 'edit', { target: 'src/a.ts', added: 2, removed: 1 }),
      step('6', 'edit', { target: 'src/c/d.vue', added: 3, removed: 0 }),
      step('7', 'execute', { title: 'pnpm test', status: 'failed' }),
      step('8', 'read', { status: 'in_progress' }),
    ])
    expect(phases.map(({ kind, title, summary, status, added, removed, steps }) => ({ kind, title, summary, status, added, removed, steps: steps.length }))).toEqual([
      { kind: 'explore', title: 'Explored', summary: 'read 2 files, searched 1 pattern, thought', status: 'done', added: 0, removed: 0, steps: 4 },
      { kind: 'edit', title: 'Edited', summary: 'a.ts, d.vue', status: 'done', added: 5, removed: 1, steps: 2 },
      { kind: 'run', title: 'Ran', summary: 'pnpm test', status: 'failed', added: 0, removed: 0, steps: 1 },
      { kind: 'explore', title: 'Exploring', summary: 'read 1 file', status: 'running', added: 0, removed: 0, steps: 1 },
    ])
  })

  it('names thought-only phases and keeps live status only while the reply streams', () => {
    expect(groupActivityPhases([step('1', 'think', { status: 'in_progress' })])[0]).toMatchObject({ title: 'Thinking', summary: '', status: 'running' })
    expect(groupActivityPhases([step('1', 'think')])[0]).toMatchObject({ title: 'Thought', status: 'done' })
  })
})
