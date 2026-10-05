import type { Story, Variant } from '@histoire/shared'
import type { ReactStoryWrapper } from '../helpers.js'
import { useHistoireGlobals as readHistoireGlobals } from '@histoire/shared'
import { onBeforeUnmount, onMounted, ref, watch } from '@histoire/vendors/vue'
import { createReactHost } from '../util/root.js'
import { callSetupFunctions } from '../util/setup.js'

/** Bind a Vue adapter to a React root, cancelling stale asynchronous mounts. */
export function createReactAdapter(
  props: { story: Story, variant?: Variant, slotName?: string },
  mode: 'mount' | 'render',
  emit: (event: 'ready') => void,
) {
  const el = ref<HTMLDivElement>()
  let dispose: (() => void) | undefined

  /** Replace current root and publish readiness only for this captured mount. */
  async function mount() {
    dispose?.()
    const story = props.story
    const variant = props.variant
    const target = document.createElement('div')
    el.value!.append(target)
    const host = createReactHost(target)
    let active = true
    dispose = () => {
      active = false
      host.destroy()
      target.remove()
    }
    const pending: Promise<unknown>[] = []
    const wrappers: ReactStoryWrapper[] = []
    const api = {
      app: host.app,
      story,
      variant: variant ?? null,
      globals: readHistoireGlobals(),
      /** Setup chains share preview ownership, independent of configuration root. */
      isActive: () => active,
      /** Accept providers only while this root still owns its target. */
      addWrapper: (wrapper: ReactStoryWrapper) => { if (active) wrappers.push(wrapper) },
    }
    try {
      await callSetupFunctions(api, target)
      if (!active) return
      host.render(story.file!.component, { mode, story, variant, slotName: props.slotName ?? 'default', pending, isActive: () => active }, wrappers)
      await Promise.all(pending)
      if (active) emit('ready')
    }
    catch (error) {
      if (active) {
        dispose?.()
        dispose = undefined
        throw error
      }
    }
  }

  onMounted(mount)
  watch(() => [props.story, props.story.file?.component, props.variant, props.slotName], mount)
  onBeforeUnmount(() => {
    dispose?.()
    dispose = undefined
  })
  return el
}
