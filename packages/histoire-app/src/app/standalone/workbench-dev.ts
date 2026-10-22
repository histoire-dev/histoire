import type { HistoireTarget } from '@histoire/protocol'
import type { HistoireSession } from '@histoire/sdk'
import type { UiCommentAgent } from '@histoire/shared'
import type { Ref } from 'vue'
import type { CommentFramePoint } from '../components/comments/pick.js'
import type { createAgentsStore } from '../stores/agents.js'
import type { AiThreads } from '../stores/ai-threads.js'
import type { createFrameActions, FrameActionTarget } from '../util/frame-actions.js'
import type { WorkbenchCanvas } from './workbench-types.js'
import { getHistoireTargetKey } from '@histoire/protocol'
import { isPinnedThread } from '@histoire/shared'
import { useHistoireResource } from '@histoire/vue/internal'
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { getSelectedCanvasFrame } from '../components/canvas/frame-target.js'
import { provideAgentsStore } from '../stores/agents.js'
import { createAiThreads, provideAiThreads } from '../stores/ai-threads.js'
import { agentIconUrl } from '../util/agents-http.js'
import { createDevAgentsStore } from '../util/agents-transport.js'
import { captureFrameScreenshot } from '../util/frame-screenshot.js'
import { isUiChannelAvailable } from '../util/ui-channel.js'

/** Public finite element-pick operation exposed by the owning comments overlay. */
export interface WorkbenchCommentOverlay {
  /** Pick exactly one registered frame-local point. */
  pick: (point: CommentFramePoint) => void
}

/** Standalone navigation and rendering stay in root adapters, outside dev feature state. */
export interface WorkbenchDevOptions {
  /** Canonical connected source and selected runtime. */
  session: HistoireSession
  /** Live canvas instance, absent outside story views. */
  canvas: Ref<WorkbenchCanvas | undefined>
  /** Root-owned contextual actions and feature capability gates. */
  actions: ReturnType<typeof createFrameActions>
  /** Navigate exact target and await canonical selection completion. */
  navigate: (target: HistoireTarget) => Promise<void>
  /** Reveal the AI pane listing threads. */
  showThreads: () => void
  /** Open local agent settings through standalone route adapter. */
  setupAgents: () => void
  /** Observe current-owner feature failures. */
  error: (error: unknown) => void
}

/** Independent feature controls make async navigation and target ownership directly testable. */
export function createWorkbenchDevControls(options: WorkbenchDevOptions, threads: AiThreads, agents: ReturnType<typeof createAgentsStore>) {
  const commentOverlay = shallowRef<WorkbenchCommentOverlay>()
  const screenshotTarget = shallowRef<FrameActionTarget>()
  const screenshotTrigger = ref(0)
  let active = true
  let generation = 0
  let sourceOwner = JSON.stringify(options.session.getSnapshot().source)
  const commentAgents = computed<UiCommentAgent[]>(() => {
    const snapshot = agents.state.value
    return snapshot.agents.map((agent) => {
      const preset = snapshot.presets.find(preset => preset.id === agent.id)
      return {
        id: agent.id,
        name: agent.name,
        state: snapshot.enabled && agent.enabled ? agent.state : 'disabled',
        default: Boolean(preset?.default),
        askEachTime: snapshot.context.askEachTime,
        ...(preset?.registryId ? { icon: agentIconUrl(preset.registryId) } : {}),
        ...(agent.commands ? { commands: agent.commands } : {}),
      }
    })
  })
  /** Comment mode is the canvas `comment` tool; leaving it falls back to select. */
  const commentMode = computed({
    get: () => options.canvas.value?.canvas.tool === 'comment',
    set(value: boolean) {
      const canvas = options.canvas.value?.canvas
      if (!canvas || value === (canvas.tool === 'comment')) return
      canvas.setTool(value ? 'comment' : 'select')
    },
  })
  // Pins and threads only live in comment mode (like Figma); leaving it closes the open card.
  const stopTool = watch(commentMode, (value) => {
    if (!value) threads.dismiss()
  }, { flush: 'sync' })
  const stopSource = options.session.subscribe((snapshot) => {
    const next = JSON.stringify(snapshot.source)
    if (next !== sourceOwner) {
      sourceOwner = next
      generation++
      commentMode.value = false
    }
    const capture = screenshotTarget.value
    if (capture && (snapshot.selection?.storyId !== capture.storyId || snapshot.selection.variantId !== capture.variantId)) screenshotTarget.value = undefined
  })

  /** Document readiness belongs to captured frame's own session, including passive previews. */
  function readyFrame(target: FrameActionTarget) {
    const frame = options.canvas.value?.registry.getFrame(target.frameKey)
    const snapshot = frame?.session?.getSnapshot()
    if (!active || !frame?.iframe || !frame.documentId || frame.storyId !== target.storyId || frame.variantId !== target.variantId || snapshot?.stale || snapshot?.runtime.status !== 'ready' || snapshot.selection?.storyId !== target.storyId || snapshot.selection.variantId !== target.variantId) return null
    return frame
  }

  /** Pointer toolbar mode selects its point later; C/menu picks exact frame center immediately. */
  function startComment(target?: FrameActionTarget): void {
    if (!active || !threads.pinsAvailable.value) return
    if (!target) {
      commentMode.value = !commentMode.value
      return
    }
    const frame = readyFrame(target)
    if (!frame || !commentOverlay.value) return
    commentMode.value = true
    commentOverlay.value.pick({ ...target, point: { x: frame.rect.width / 2, y: frame.rect.height / 2 } })
  }

  /** Pointer intent is rechecked against current registered document before overlay request. */
  function pickComment(point: CommentFramePoint): void {
    if (threads.pinsAvailable.value && readyFrame(point)) commentOverlay.value?.pick(point)
  }

  /**
   * Open a thread where it lives: a pinned thread navigates to its variant and opens its canvas card
   * in comment mode; free-form and orphan threads open in the pane. Retired navigation cannot open an
   * old thread or change the replacement page's pane.
   * @param id Thread identity.
   */
  async function selectComment(id: string): Promise<void> {
    const thread = threads.threads.value.find(item => item.id === id)
    if (!active || !thread) return
    const token = ++generation
    const source = JSON.stringify(options.session.getSnapshot().source)
    const target = isPinnedThread(thread) ? { storyId: thread.context.storyId, variantId: thread.context.variantId } : undefined
    const exists = Boolean(target && options.session.getSnapshot().catalog.stories.some(story => story.id === target.storyId && story.variants.some(variant => variant.id === target.variantId)))
    try {
      if (exists) await options.navigate(target!)
      if (!active || token !== generation || source !== JSON.stringify(options.session.getSnapshot().source)) return
      if (exists && getHistoireTargetKey(options.session.getSnapshot().selection ?? { storyId: '', variantId: null }) !== getHistoireTargetKey(target!)) return
      if (exists) commentMode.value = true
      threads.open(thread.id)
      options.showThreads()
    }
    catch (error) {
      if (active && token === generation && source === JSON.stringify(options.session.getSnapshot().source)) options.error(error)
    }
  }

  /** Existing screenshot popover owns capture transport; navigation aligns its selected-frame scope. */
  async function requestScreenshot(target: FrameActionTarget): Promise<void> {
    if (!active) return
    const token = ++generation
    const source = JSON.stringify(options.session.getSnapshot().source)
    try {
      await options.navigate({ storyId: target.storyId, variantId: target.variantId })
      await nextTick()
      const snapshot = options.session.getSnapshot()
      if (!active || token !== generation || source !== JSON.stringify(snapshot.source) || snapshot.selection?.storyId !== target.storyId || snapshot.selection.variantId !== target.variantId) return
      const current = options.canvas.value
      const frame = current?.registry.getFrame(target.frameKey)
      if (!current || frame?.storyId !== target.storyId || frame.variantId !== target.variantId) return
      current.canvas.selectedFrame = frame.id
      screenshotTarget.value = { ...target }
      screenshotTrigger.value++
    }
    catch (error) {
      if (active && token === generation && source === JSON.stringify(options.session.getSnapshot().source)) options.error(error)
    }
  }

  /** Capture the selected variant's mounted frame for an AI message; resolves with the stored screenshot path. */
  async function captureSelected(): Promise<string> {
    const current = options.canvas.value
    const selection = options.session.getSnapshot().selection
    const frame = current && selection?.variantId ? getSelectedCanvasFrame(current.registry, current.canvas, selection) : null
    if (!current || !frame) throw new Error('Open a variant on the canvas to capture it')
    return (await captureFrameScreenshot(frame, current.canvas)).path
  }

  const dispose = [
    options.actions.registerFrameAction({ id: 'comment', label: 'Comment for AI', icon: 'add-comment', group: 'ai', shortcut: 'frame.comment', devOnly: true, available: target => threads.pinsAvailable.value && Boolean(readyFrame(target)), run: startComment }),
    options.actions.registerFrameAction({ id: 'screenshot', label: 'Screenshot', icon: 'camera', group: 'copy', shortcut: 'frame.screenshot', devOnly: true, available: () => active && isUiChannelAvailable(), run: requestScreenshot }),
  ]
  return { commentMode, commentOverlay, commentAgents, screenshotTarget, screenshotTrigger, startComment, pickComment, selectComment, requestScreenshot, captureSelected, setupAgents: options.setupAgents,
    /** Teardown retires handlers and async completions without disposing caller-owned sessions. */
    close(): void {
      if (!active) return
      active = false
      generation++
      commentMode.value = false
      commentOverlay.value = undefined
      screenshotTarget.value = undefined
      stopTool()
      stopSource()
      dispose.forEach(off => off())
    } }
}

/** Development-only owner installs safe ACP and threads stores below standalone provider. */
export function useWorkbenchDev(options: WorkbenchDevOptions) {
  const agents = createDevAgentsStore()
  const threads = createAiThreads()
  provideAgentsStore(agents)
  provideAiThreads(threads)
  useHistoireResource(agents.close)
  useHistoireResource(threads.close)
  const controls = createWorkbenchDevControls(options, threads, agents)
  useHistoireResource(controls.close)
  return { agents, threads, ...controls }
}
