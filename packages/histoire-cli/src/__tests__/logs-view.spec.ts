import { describe, expect, it } from 'vitest'
import { createOutputPipeline } from '../terminal/output/pipeline.js'
import { createErrorView } from '../terminal/views/error.js'
import { createLogsView } from '../terminal/views/logs.js'
import { settleTimers } from './utils/flush.js'
import { createViewHostRig } from './utils/terminal/view-host.js'

/** Appends numbered stdout records. */
function fill(rig: ReturnType<typeof createViewHostRig>, count: number, from = 1) {
  for (let index = from; index < from + count; index++) rig.logs.append({ source: 'stdout', level: 'log', text: `line ${index}`, truncated: 0 })
}

describe('logs view history navigation', () => {
  it('keeps the selected entry while output appends, and End resumes following', () => {
    const rig = createViewHostRig({ rows: 10 })
    fill(rig, 6)
    const view = rig.open(createLogsView)
    expect(view.view.render!({ columns: 80, rows: 10 }).join('\n')).toContain('Following')
    view.keys('up', 'up')
    const before = view.screen().find(line => line.startsWith('›'))
    expect(before).toContain('line 4')
    fill(rig, 3, 7)
    expect(view.screen().find(line => line.startsWith('›'))).toBe(before)
    expect(view.screen().join('\n')).toContain('Paused')
    view.keys('end')
    fill(rig, 1, 10)
    expect(view.screen().find(line => line.startsWith('›'))).toContain('line 10')
  })

  it('moves a selection whose entry was evicted to the nearest retained entry and shows the omission', () => {
    const rig = createViewHostRig({ rows: 10, logLimits: { entries: 5 } })
    fill(rig, 5)
    const view = rig.open(createLogsView)
    view.keys('home')
    expect(view.screen().find(line => line.startsWith('›'))).toContain('line 1')
    // Entries 1..8 get evicted; retained are 9..13 with independently expected IDs.
    fill(rig, 8, 6)
    const screen = view.screen()
    expect(screen.find(line => line.startsWith('›'))).toMatch(/#9 stdout line 9/)
    expect(screen.join('\n')).toContain('8 older omitted')
  })

  it('searches distinct startup and post-recovery errors and opens the latest one in detail', () => {
    const rig = createViewHostRig({ rows: 12 })
    rig.logs.append({ source: 'stderr', level: 'error', text: 'startup: config exploded', truncated: 0, generation: 'g1' })
    fill(rig, 3)
    rig.logs.append({ source: 'console', level: 'error', text: 'recovered: plugin warning\n    at stack frame', truncated: 0, generation: 'g2' })
    const logs = rig.open(createLogsView)
    logs.keys('/', 'c', 'o', 'n', 'f', 'i', 'g', 'return')
    const found = logs.screen().filter(line => line.includes('config exploded'))
    expect(found).toHaveLength(1)
    expect(logs.screen().join('\n')).not.toContain('recovered')
    const latest = rig.open(createErrorView)
    const text = latest.screen().join('\n')
    expect(text).toContain('recovered: plugin warning')
    expect(text).toContain('at stack frame')
    expect(text).not.toContain('config exploded')
  })

  it('does not fire main keys while typing a search', () => {
    const rig = createViewHostRig()
    const view = rig.open(createLogsView)
    expect(view.view.capturesInput!()).toBe(false)
    view.keys('/')
    expect(view.view.capturesInput!()).toBe(true)
    view.keys('q', 'y')
    expect(view.view.capturesInput!()).toBe(true)
    view.keys('escape')
    expect(view.view.capturesInput!()).toBe(false)
  })
})

describe('logs copy', () => {
  it('copies the selected entry and the filtered entries as clean text without credentials', async () => {
    const rig = createViewHostRig()
    const pipeline = createOutputPipeline({ history: rig.logs, secrets: ['s3cret-token'] })
    pipeline.onLog({ level: 'error', text: 'café ☃ \u001B[31mred\u001B[0m token=s3cret-token\n  second line\tTabbed' })
    pipeline.onLog({ level: 'log', text: 'plain note' })
    const view = rig.open(createLogsView)
    view.keys('home')
    expect(view.screen().join('\n')).toContain('(+1 lines)')
    view.keys('y')
    await settleTimers()
    expect(rig.copied[0]).toBe('café ☃ red token=[credential]\n  second line\tTabbed')
    view.keys('/', 'n', 'o', 't', 'e', 'return', 'Y')
    await settleTimers()
    expect(rig.copied[1]).toBe('plain note')
    for (const text of rig.copied) {
      expect(text).not.toContain('s3cret-token')
      expect(text).not.toContain('\u001B')
    }
  })

  it('bounds copy-all to the newest entries and says so', async () => {
    const rig = createViewHostRig({ logLimits: { bytes: 16 * 1024 * 1024 } })
    // 4 entries of 1 MiB: only the newest ones fit the 2 MiB copy bound.
    for (let index = 1; index <= 4; index++) rig.logs.append({ source: 'stdout', level: 'log', text: `${index}${'x'.repeat(1024 * 1024)}`, truncated: 0 })
    const view = rig.open(createLogsView)
    view.keys('Y')
    await settleTimers()
    expect(rig.copied[0].length).toBeLessThanOrEqual(2 * 1024 * 1024)
    expect(rig.copied[0].startsWith('4')).toBe(true)
    expect(rig.notices.at(-1)).toContain('newest 1 of 4')
  })

  it('keeps the text visible and reports the reason when the clipboard fails', async () => {
    const rig = createViewHostRig({ copy: async () => ({ ok: false, reason: 'no clipboard tool found' }) })
    fill(rig, 1)
    const view = rig.open(createLogsView)
    view.keys('y')
    await settleTimers()
    expect(rig.notices.at(-1)).toBe('Copy unavailable: no clipboard tool found. Text is still shown')
    expect(view.screen().join('\n')).toContain('line 1')
  })
})

describe('deleting retained history', () => {
  it('deletes logs and every registered history, keeps IDs increasing, leaves unregistered state alone', () => {
    const rig = createViewHostRig()
    let requests = 3
    rig.retained.register({ id: 'requests', label: 'requests', count: () => requests, clear: () => (requests = 0) })
    fill(rig, 4)
    const lastId = rig.logs.entries().at(-1)!.id
    expect(rig.retained.clear().summary).toBe('Deleted 4 log entries, 3 requests')
    expect(rig.logs.entries()).toHaveLength(0)
    expect(requests).toBe(0)
    expect(rig.logs.append({ source: 'stdout', level: 'log', text: 'after', truncated: 0 }).id).toBe(lastId + 1)
    expect(rig.retained.clear().summary).toBe('Deleted 1 log entries, 0 requests')
  })
})
