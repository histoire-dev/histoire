import type { createContextMenu } from '../../composables/context-menu.js'
import type { createFrameActions } from '../../util/frame-actions.js'
import type { EmbedController } from './controller.js'
import { watch } from 'vue'

/** Registry contributions capture menu identity without changing workbench selection. */
export function registerEmbedActions(controller: EmbedController, menu: ReturnType<typeof createContextMenu>, frames: ReturnType<typeof createFrameActions>): () => void {
  let trigger: HTMLElement | null = null
  // Menu closes before dispatch. Retain original chrome focus while context is live.
  const stop = watch(() => menu.state.context, (target) => {
    if (target) trigger = menu.state.restore
  }, { flush: 'sync' })
  const dispose = [
    stop,
    frames.registerFrameAction({ id: 'embed-variant', label: 'Embed this variant', icon: 'code', group: 'embed', available: target => controller.available(target.storyId, target.variantId), run: target => controller.open(target.storyId, target.variantId, trigger) }),
    menu.register({ id: 'story.embed', label: 'Embed this story', icon: 'code', group: 'embed', available: target => target.kind === 'story' && !!target.selection && controller.available(target.selection.storyId), run: (target) => {
      if (target.kind === 'story' && target.selection) controller.open(target.selection.storyId, undefined, trigger)
    } }),
  ]
  return () => dispose.forEach(remove => remove())
}
