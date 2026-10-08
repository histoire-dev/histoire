import type { HistoireSession } from '@histoire/sdk'
import type { ShallowRef } from 'vue'
import { watch } from 'vue'
import { useHistoireResource } from '../../provider/context.js'

/** Measure canvas itself, excluding embed title and optional panel area. */
export function useEmbedGeometry(session: HistoireSession, element: ShallowRef<HTMLElement | null>, report: (error: unknown) => void): void {
  let active = true
  const stop = watch(element, (root, _previous, onCleanup) => {
    if (!root) return
    let current = true
    let previous = ''
    /** Positive changed dimensions avoid hidden-frame mounts and observer loops. */
    function measure(): void {
      if (!active || !current || element.value !== root) return
      const width = Math.floor(root!.clientWidth)
      const height = Math.floor(root!.clientHeight)
      const key = `${width}:${height}`
      if (!width || !height || key === previous) return
      previous = key
      void session.settings.update({ responsiveWidth: width, responsiveHeight: height }).catch((error) => {
        if (active && current && element.value === root && session.getSnapshot().status === 'ready') report(error)
      })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    measure()
    onCleanup(() => {
      current = false
      observer.disconnect()
    })
  }, { flush: 'post' })
  useHistoireResource(() => {
    active = false
    stop()
  })
}
