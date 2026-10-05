import { describe, expect, it } from 'vitest'
import { createDevMcpActivity } from '../../mcp/observer/activity.js'
import { deferred } from '../utils/mcp/deferred.js'
import { createReadProjectFixture } from '../utils/mcp/read-project.js'

describe('dev MCP activity projection', () => {
  it('tracks persistent stdio client while observing only transport reads', async () => {
    const activity = createDevMcpActivity()
    const fixture = await createReadProjectFixture(['alpha/story'])
    const project = fixture.project
    try {
      activity.setEnabled(true)
      project.getProject()
      expect(activity.snapshot().operations).toEqual([])
      await activity.observeStdio(async () => {
        await activity.observeReadTool('histoire_get_project', undefined, () => project.getProject())
      })
      const first = activity.snapshot()
      expect(first.status).toBe('enabled')
      expect(first.endpoint).toBeUndefined()
      expect(first.clients).toMatchObject([{ transport: 'stdio', name: 'MCP stdio client' }])
      expect(first.operations).toMatchObject([{ tool: 'histoire_get_project', state: 'done', clientId: first.clients[0].id }])
      await activity.observeStdio(async () => {
        await activity.observeReadTool('histoire_get_story', { storyId: 'alpha/story' }, () => project.getStory({ storyId: 'alpha/story' }))
      })
      expect(activity.snapshot().clients[0].id).toBe(first.clients[0].id)
      expect(activity.snapshot().operations[1].target).toEqual({ storyId: 'alpha/story' })
      activity.disconnect()
      expect(activity.snapshot().clients).toEqual([])
    }
    finally { await fixture.close() }
  })

  it('suppresses late read completion after restart without leaking private results', async () => {
    const activity = createDevMcpActivity()
    const fixture = await createReadProjectFixture()
    const gate = deferred<any>()
    const project = { ...fixture.project, getDocs: () => gate.promise }
    try {
      const reading = activity.observeExchange(async () => {
        await activity.observeReadTool('histoire_get_docs', { storyId: 'story' }, () => project.getDocs())
      })
      expect(activity.snapshot().operations[0]).toMatchObject({ target: { storyId: 'story' }, state: 'running' })
      activity.reset()
      gate.resolve({ text: 'private source content', token: 'secret-result' })
      await reading
      expect(activity.snapshot().operations).toEqual([])
      expect(JSON.stringify(activity.snapshot())).not.toContain('private source content')
    }
    finally { await fixture.close() }
  })

  it('keeps running operations alongside fifty terminal calls during busy read activity', async () => {
    const activity = createDevMcpActivity()
    const fixture = await createReadProjectFixture()
    const project = fixture.project
    try {
      activity.publish({ id: 'long-running', clientId: 'opaque-client', tool: 'histoire_capture_screenshot', state: 'running', startedAt: new Date().toISOString() })
      for (let index = 0; index < 55; index++) {
        await activity.observeExchange(async () => {
          await activity.observeReadTool('histoire_get_project', undefined, () => project.getProject())
        })
      }
      const snapshot = activity.snapshot()
      expect(snapshot.operations).toHaveLength(51)
      expect(snapshot.operations.find(operation => operation.id === 'long-running')?.state).toBe('running')
      expect(snapshot.operations.filter(operation => operation.state === 'done')).toHaveLength(50)
    }
    finally { await fixture.close() }
  })
})
