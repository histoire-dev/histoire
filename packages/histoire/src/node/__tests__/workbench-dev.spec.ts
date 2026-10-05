import type { HistoireTarget } from '@histoire/protocol'
import { getHistoireTargetKey } from '@histoire/protocol'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createCanvasFrames } from '../../../../histoire-app/src/app/composables/canvas-settings.js'
import { createWorkbenchDevControls } from '../../../../histoire-app/src/app/standalone/workbench-dev.js'
import { createAgentsStore } from '../../../../histoire-app/src/app/stores/agents.js'
import { createCanvasStore } from '../../../../histoire-app/src/app/stores/canvas.js'
import { createWorkbenchComments } from '../../../../histoire-app/src/app/stores/comments.js'
import { createFrameActions } from '../../../../histoire-app/src/app/util/frame-actions.js'
import { deferred, sourceFixture } from '../../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { createHistoireSessionWithAdapters } from '../../../../histoire-sdk/src/session/controller.js'
import { commentFixture } from './utils/comments.js'

/** Real session/store composition leaves transport and iframe rendering to their existing fixtures. */
async function controlsFixture(navigate?: (target: HistoireTarget) => Promise<void>) {
  const fixture = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
  await session.connect()
  await session.selection.select({ storyId: 'a:b', variantId: 'c' })
  await session.mount({} as HTMLElement, { surface: 'preview' }).ready
  const comments = createWorkbenchComments()
  comments.enabled.value = true
  comments.connected.value = true
  const agents = createAgentsStore()
  const canvas = createCanvasStore()
  const registry = createCanvasFrames(canvas)
  const actions = createFrameActions({ session, link: () => '', reveal: vi.fn() })
  const showComments = vi.fn()
  const error = vi.fn()
  const controls = createWorkbenchDevControls({ session, canvas: ref({ canvas, registry }), actions, navigate: navigate ?? (target => session.selection.select(target)), showComments, setupAgents: vi.fn(), error }, comments, agents)
  return { fixture, session, comments, agents, canvas, registry, actions, controls, showComments, error,
    /** Teardown retains caller-owned session disposal as an explicit separate operation. */
    async close() {
      controls.close()
      comments.close()
      agents.close()
      await session.dispose()
    } }
}

describe('standalone dev feature ownership', () => {
  it('picks exact mounted frame center without selecting canonical variant and rejects retired runtime', async () => {
    const context = await controlsFixture()
    const replicaFixture = sourceFixture()
    const replica = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, replicaFixture.adapters)
    await replica.connect()
    const target = { storyId: 'a:b', variantId: 'other', frameKey: getHistoireTargetKey({ storyId: 'a:b', variantId: 'other' }) }
    await replica.selection.select(target)
    await replica.mount({} as HTMLElement, { surface: 'preview' }).ready
    context.registry.registerFrame({ id: target.frameKey, ...target, rect: { x: 0, y: 0, width: 720, height: 640 }, iframe: {} as HTMLIFrameElement, documentId: 'document-1', session: replica })
    const pick = vi.fn()
    context.controls.commentOverlay.value = { pick }
    try {
      context.controls.startComment(target)
      expect(pick).toHaveBeenCalledWith({ ...target, point: { x: 360, y: 320 } })
      expect(context.session.getSnapshot().selection).toEqual({ storyId: 'a:b', variantId: 'c' })
      replicaFixture.reload()
      context.controls.startComment(target)
      expect(pick).toHaveBeenCalledOnce()
      expect(context.actions.list(target).map(action => action.id)).not.toContain('comment')
    }
    finally {
      await replica.dispose()
      await context.close()
    }
  })

  it('opens exact persisted thread after navigation while safe agent projections exclude runtime details', async () => {
    const context = await controlsFixture()
    const comment = commentFixture({ storyId: 'a:b', variantId: 'other' })
    context.comments.comments.value = [comment]
    context.agents.state.value = {
      ...context.agents.state.value,
      enabled: true,
      presets: [{ id: 'agent', name: 'Agent', command: 'agent', default: true }],
      context: { ...context.agents.state.value.context, askEachTime: true },
      agents: [{ id: 'agent', name: 'Agent', state: 'idle', enabled: true, logs: ['private runtime log'], envKeys: ['TOKEN'] }],
    }
    try {
      await context.controls.selectComment(comment)
      expect(context.session.getSnapshot().selection).toEqual({ storyId: 'a:b', variantId: 'other' })
      expect(context.comments.activeId.value).toBe(comment.id)
      expect(context.showComments).toHaveBeenCalledOnce()
      expect(context.controls.commentAgents.value).toEqual([{ id: 'agent', name: 'Agent', state: 'idle', default: true, askEachTime: true }])
      context.agents.state.value = { ...context.agents.state.value, context: { ...context.agents.state.value.context, askEachTime: false }, enabled: false, presets: [] }
      expect(context.controls.commentAgents.value).toEqual([{ id: 'agent', name: 'Agent', state: 'disabled', default: false, askEachTime: false }])
    }
    finally { await context.close() }
  })

  it('aligns screenshot selection with captured registered frame and rejects mismatched registration', async () => {
    const context = await controlsFixture()
    const target = { storyId: 'a:b', variantId: 'other', frameKey: getHistoireTargetKey({ storyId: 'a:b', variantId: 'other' }) }
    const remove = context.registry.registerFrame({ id: target.frameKey, ...target, rect: { x: 0, y: 0, width: 720, height: 640 } })
    context.canvas.selectedFrame = getHistoireTargetKey({ storyId: 'a:b', variantId: 'c' })
    try {
      await context.controls.requestScreenshot(target)
      expect(context.canvas.selectedFrame).toBe(target.frameKey)
      expect(context.controls.screenshotTarget.value).toEqual(target)
      expect(context.controls.screenshotTrigger.value).toBe(1)
      remove()
      context.registry.registerFrame({ id: target.frameKey, ...target, variantId: 'c', rect: { x: 0, y: 0, width: 720, height: 640 } })
      await context.controls.requestScreenshot(target)
      expect(context.controls.screenshotTrigger.value).toBe(1)
    }
    finally { await context.close() }
  })

  it('retires pending navigation, pointer mode and registered frame actions on close', async () => {
    const pending = deferred<void>()
    const context = await controlsFixture(() => pending.promise)
    const comment = commentFixture({ storyId: 'a:b', variantId: 'other' })
    context.canvas.setTool('measure')
    context.controls.startComment()
    expect(context.controls.commentMode.value).toBe(true)
    expect(context.canvas.tool).toBe('select')
    const work = context.controls.selectComment(comment)
    context.controls.close()
    await context.session.selection.select(comment)
    pending.resolve()
    await work
    try {
      expect(context.comments.activeId.value).toBeNull()
      expect(context.showComments).not.toHaveBeenCalled()
      expect(context.controls.commentMode.value).toBe(false)
      expect(context.actions.entries.has('comment')).toBe(false)
      expect(context.actions.entries.has('screenshot')).toBe(false)
    }
    finally { await context.close() }
  })

  it('retires comment placement when another pointer tool takes ownership and disposes watcher', async () => {
    const context = await controlsFixture()
    try {
      for (const tool of ['measure', 'pan'] as const) {
        context.controls.startComment()
        expect(context.controls.commentMode.value).toBe(true)
        context.canvas.setTool(tool)
        expect(context.controls.commentMode.value).toBe(false)
      }
      context.controls.close()
      // A retained ref detects leaked subscriptions without invoking closed controls.
      context.controls.commentMode.value = true
      context.canvas.setTool('measure')
      expect(context.controls.commentMode.value).toBe(true)
      context.controls.commentMode.value = false
    }
    finally { await context.close() }
  })
})
