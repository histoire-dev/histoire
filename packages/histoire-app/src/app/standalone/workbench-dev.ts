import type { HistoireTarget } from '@histoire/protocol'
import type { HistoireSession } from '@histoire/sdk'
import type { UiComment, UiCommentAgent } from '@histoire/shared'
import type { Ref } from 'vue'
import type { CommentFramePoint } from '../components/comments/pick.js'
import type { createAgentsStore } from '../stores/agents.js'
import type { WorkbenchComments } from '../stores/comments.js'
import type { createFrameActions, FrameActionTarget } from '../util/frame-actions.js'
import type { WorkbenchCanvas } from './workbench-types.js'
import { getHistoireTargetKey } from '@histoire/protocol'
import { useHistoireResource } from '@histoire/vue/internal'
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { provideAgentsStore } from '../stores/agents.js'
import { createWorkbenchComments, provideWorkbenchComments } from '../stores/comments.js'
import { createDevAgentsStore } from '../util/agents-transport.js'
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
  /** Reveal existing comment threads in owning pane. */
  showComments: () => void
  /** Open local agent settings through standalone route adapter. */
  setupAgents: () => void
  /** Observe current-owner feature failures. */
  error: (error: unknown) => void
}

/** Independent feature controls make async navigation and target ownership directly testable. */
export function createWorkbenchDevControls(options: WorkbenchDevOptions, comments: WorkbenchComments, agents: ReturnType<typeof createAgentsStore>) {
  const commentMode = ref(false)
  const commentOverlay = shallowRef<WorkbenchCommentOverlay>()
  const screenshotTarget = shallowRef<FrameActionTarget>()
  const screenshotTrigger = ref(0)
  let active = true
  let generation = 0
  let sourceOwner = JSON.stringify(options.session.getSnapshot().source)
  const commentAgents = computed<UiCommentAgent[]>(() => {
    const snapshot = agents.state.value
    return snapshot.agents.map(agent => ({
      id: agent.id,
      name: agent.name,
      state: snapshot.enabled && agent.enabled ? agent.state : 'disabled',
      default: Boolean(snapshot.presets.find(preset => preset.id === agent.id)?.default),
      askEachTime: snapshot.context.askEachTime,
    }))
  })
  const stopCanvas = watch(options.canvas, (value) => {
    if (!value) commentMode.value = false
  })
  const stopTool = watch(() => options.canvas.value?.canvas.tool, (tool) => {
    if (tool !== 'select') commentMode.value = false
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
    if (!active || !comments.available.value) return
    if (!target) {
      commentMode.value = !commentMode.value
      if (commentMode.value) {
        options.canvas.value?.canvas.setTool('select')
      }
      return
    }
    const frame = readyFrame(target)
    if (!frame || !commentOverlay.value) return
    commentMode.value = false
    commentOverlay.value.pick({ ...target, point: { x: frame.rect.width / 2, y: frame.rect.height / 2 } })
  }

  /** Pointer intent is rechecked against current registered document before overlay request. */
  function pickComment(point: CommentFramePoint): void {
    if (comments.available.value && readyFrame(point)) commentOverlay.value?.pick(point)
  }

  /** Retired navigation cannot open an old thread or change replacement page's pane. */
  async function selectComment(comment: UiComment): Promise<void> {
    if (!active) return
    const token = ++generation
    const source = JSON.stringify(options.session.getSnapshot().source)
    const target = { storyId: comment.storyId, variantId: comment.variantId }
    const exists = options.session.getSnapshot().catalog.stories.some(story => story.id === target.storyId && story.variants.some(variant => variant.id === target.variantId))
    try {
      if (exists) await options.navigate(target)
      if (!active || token !== generation || source !== JSON.stringify(options.session.getSnapshot().source)) return
      if (exists && getHistoireTargetKey(options.session.getSnapshot().selection ?? { storyId: '', variantId: null }) !== getHistoireTargetKey(target)) return
      comments.open(comment.id)
      options.showComments()
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

  const dispose = [
    options.actions.registerFrameAction({ id: 'comment', label: 'Comment for AI', icon: 'add-comment', group: 'ai', shortcut: 'frame.comment', devOnly: true, available: target => comments.available.value && Boolean(readyFrame(target)), run: startComment }),
    options.actions.registerFrameAction({ id: 'screenshot', label: 'Screenshot', icon: 'camera', group: 'copy', shortcut: 'frame.screenshot', devOnly: true, available: () => active && isUiChannelAvailable(), run: requestScreenshot }),
  ]
  return { commentMode, commentOverlay, commentAgents, screenshotTarget, screenshotTrigger, startComment, pickComment, selectComment, requestScreenshot, setupAgents: options.setupAgents,
    /** Teardown retires handlers and async completions without disposing caller-owned sessions. */
    close(): void {
      if (!active) return
      active = false
      generation++
      commentMode.value = false
      commentOverlay.value = undefined
      screenshotTarget.value = undefined
      stopCanvas()
      stopTool()
      stopSource()
      dispose.forEach(off => off())
    } }
}

/** Development-only owner installs safe ACP and comments stores below standalone provider. */
export function useWorkbenchDev(options: WorkbenchDevOptions) {
  const agents = createDevAgentsStore()
  const comments = createWorkbenchComments()
  provideAgentsStore(agents)
  provideWorkbenchComments(comments)
  useHistoireResource(agents.close)
  useHistoireResource(comments.close)
  const controls = createWorkbenchDevControls(options, comments, agents)
  useHistoireResource(controls.close)
  return { agents, comments, ...controls }
}
