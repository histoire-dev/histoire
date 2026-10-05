import type { EmbedSurfaceContext } from '../surfaces.js'
import { HistoireProvider } from '@histoire/vue'
import { GenericControls, StatePresets } from '@histoire/vue/internal'
import { createApp, h, nextTick, shallowRef } from 'vue'
import { createEmbedControlsReplica } from './controls-replica.js'
/** Iframe controls surface reuses native editors around same-origin custom replica. */
export async function createEmbedControlsView(context: EmbedSurfaceContext) {
  const hasControls = shallowRef(false)
  const height = shallowRef(32)
  const custom = shallowRef<HTMLElement | null>(null)
  context.container.style.cssText = 'margin:0;min-width:0;'
  const root = context.container.ownerDocument.createElement('div')
  context.container.append(root)
  /** Replica-only mounts inherit owning panel tokens/density without resetting another provider. */
  function content() {
    return h('div', { style: { minWidth: '0', width: '100%' } }, [context.controlsCustomOnly ? null : [h(GenericControls, { showState: !hasControls.value }), h(StatePresets)], h('div', { ref: custom, style: { minWidth: '0', height: hasControls.value ? `${height.value}px` : '32px' } })])
  }
  const app = createApp({ render: () => context.controlsCustomOnly ? content() : h(HistoireProvider, { session: context.session }, { default: content }) })
  let active = true
  let replica: ReturnType<typeof createEmbedControlsReplica> | undefined
  /** Register ownership before awaiting Vue render or acquiring story replica. */
  function close(): void {
    if (!active) {
      return
    }
    active = false
    context.signal.removeEventListener('abort', close)
    try {
      replica?.close()
    }
    finally {
      try {
        app.unmount()
      }
      finally {
        root.remove()
      }
    }
  }
  context.signal.addEventListener('abort', close, { once: true })
  try {
    context.signal.throwIfAborted()
    app.mount(root)
    await nextTick()
    context.signal.throwIfAborted()
    replica = createEmbedControlsReplica({ ...context, container: custom.value! }, (available, size) => {
      hasControls.value = available
      height.value = size
    })
    return { ready: replica.ready, publication: replica.publication, close }
  }
  catch (error) {
    close()
    throw error
  }
}
