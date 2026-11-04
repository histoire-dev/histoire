import type { ProgressEvent } from '@histoire/cli/protocol/progress'
import { expect, it } from 'vitest'
import { createStartupProgress } from '../../runtime/terminal/progress.js'

// Boundary: the real child-side producer with an injected monotonic clock.
// Defects: failures swallowed, a superseded generation still publishing,
// per-file count bursts flooding the channel.
it('reports phases with monotonic durations and the failing phase', async () => {
  let time = 0
  const events: ProgressEvent[] = []
  const progress = createStartupProgress(event => events.push(event), () => true, () => time)
  await progress.track('config', async () => {
    time += 120
  })
  await expect(progress.track('plugins', async () => {
    progress.update('plugins', { label: 'vue' })
    time += 30
    throw new Error('hook failed\nstack')
  })).rejects.toThrow('hook failed')
  expect(events).toEqual([
    { phase: 'config', status: 'started' },
    { phase: 'config', status: 'completed', durationMs: 120 },
    { phase: 'plugins', status: 'started' },
    { phase: 'plugins', status: 'updated', label: 'vue' },
    { phase: 'plugins', status: 'failed', durationMs: 30, error: 'hook failed' },
  ])
})

it('coalesces count bursts but always publishes the final count', () => {
  let time = 0
  const events: ProgressEvent[] = []
  const progress = createStartupProgress(event => events.push(event), () => true, () => time)
  progress.begin('collect')
  for (let loaded = 1; loaded <= 50; loaded++) {
    time += 1
    progress.update('collect', { current: loaded, total: 50 })
  }
  const counts = events.filter(event => event.status === 'updated').map(event => event.current)
  expect(counts.length).toBeLessThan(5)
  expect(counts.at(-1)).toBe(50)
  // Updates of a phase that is not running are ignored.
  progress.complete('collect')
  progress.update('collect', { current: 1, total: 50 })
  expect(events.at(-1)?.status).toBe('completed')
})

it('stops publishing for good once superseded', async () => {
  let active = true
  const events: ProgressEvent[] = []
  const progress = createStartupProgress(event => events.push(event), () => active)
  progress.begin('vite')
  active = false
  progress.complete('vite')
  active = true
  progress.begin('scan')
  expect(events.map(event => event.phase)).toEqual(['vite'])
})
