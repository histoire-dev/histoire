import type { HistoireTarget } from '@histoire/protocol'
import { getHistoireTargetKey } from '@histoire/protocol'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createCanvasFrames } from '../../../../histoire-app/src/app/composables/canvas-settings.js'
import { createWorkbenchDevControls } from '../../../../histoire-app/src/app/standalone/workbench-dev.js'
import { createAgentsStore } from '../../../../histoire-app/src/app/stores/agents.js'
import { createAiThreads } from '../../../../histoire-app/src/app/stores/ai-threads.js'
import { createCanvasStore } from '../../../../histoire-app/src/app/stores/canvas.js'
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
  const threads = createAiThreads()
  threads.enabled.value = true
  threads.connected.value = true
  threads.pinsEnabled.value = true
  const agents = createAgentsStore()
  const canvas = createCanvasStore()
  const registry = createCanvasFrames(canvas)
  const actions = createFrameActions({ session, link: () => '', reveal: vi.fn() })
  const showThreads = vi.fn()
  const error = vi.fn()
  const controls = createWorkbenchDevControls({ session, canvas: ref({ canvas, registry }), actions, navigate: navigate ?? (target => session.selection.select(target)), showThreads, setupAgents: vi.fn(), error }, threads, agents)
  return { fixture, session, threads, agents, canvas, registry, actions, controls, showThreads, error,
    /** Teardown retains caller-owned session disposal as an explicit separate operation. */
    async close() {
      controls.close()
      threads.close()
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
    const comment = commentFixture({ context: { storyId: 'a:b', variantId: 'other' } })
    context.threads.threads.value = [comment]
    context.agents.state.value = {
      ...context.agents.state.value,
      enabled: true,
      presets: [{ id: 'agent', name: 'Agent', command: 'agent', default: true }],
      context: { ...context.agents.state.value.context, askEachTime: true },
      agents: [{ id: 'agent', name: 'Agent', state: 'idle', enabled: true, logs: ['private runtime log'], envKeys: ['TOKEN'] }],
    }
    try {
      await context.controls.selectComment(comment.id)
      expect(context.session.getSnapshot().selection).toEqual({ storyId: 'a:b', variantId: 'other' })
      expect(context.threads.activeId.value).toBe(comment.id)
      // Pins and threads only exist in comment mode, so opening one enters it.
      expect(context.canvas.tool).toBe('comment')
      expect(context.showThreads).toHaveBeenCalledOnce()
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
    const comment = commentFixture({ context: { storyId: 'a:b', variantId: 'other' } })
    context.controls.startComment()
    expect(context.canvas.tool).toBe('comment')
    const work = context.controls.selectComment(comment.id)
    context.controls.close()
    await context.session.selection.select(comment.context!)
    pending.resolve()
    await work
    try {
      expect(context.threads.activeId.value).toBeNull()
      expect(context.showThreads).not.toHaveBeenCalled()
      expect(context.canvas.tool).toBe('select')
      expect(context.actions.entries.has('comment')).toBe(false)
      expect(context.actions.entries.has('screenshot')).toBe(false)
    }
    finally { await context.close() }
  })

  it('toggles the comment tool and closes the open thread when another tool takes over', async () => {
    const context = await controlsFixture()
    const comment = commentFixture()
    context.threads.threads.value = [comment]
    try {
      context.controls.startComment()
      expect(context.canvas.tool).toBe('comment')
      expect(context.controls.commentMode.value).toBe(true)
      context.controls.startComment()
      expect(context.canvas.tool).toBe('select')
      for (const tool of ['measure', 'pan'] as const) {
        context.controls.startComment()
        context.threads.open(comment.id)
        context.canvas.setTool(tool)
        expect(context.controls.commentMode.value).toBe(false)
        expect(context.threads.activeId.value).toBeNull()
      }
    }
    finally { await context.close() }
  })
})
