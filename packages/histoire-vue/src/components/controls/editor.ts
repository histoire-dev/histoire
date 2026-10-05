import type { VNode } from 'vue'
import { getControlComponent, HstJson } from '@histoire/controls/vue'
import { HISTOIRE_WIRE_LIMITS, measureWireValue } from '@histoire/protocol'
import { h, toRaw } from 'vue'

/**
 * JSON editors cannot round-trip every cloneable state graph. Never rewrite
 * unsupported values into strings or omit fields to make them editable.
 */
export function renderHistoireControl(type: string | undefined, props: Record<string, unknown>, slots?: { actions: () => VNode }): VNode {
  const component = getControlComponent(type)
  if (component === HstJson && props.modelValue !== undefined) {
    try {
      measureWireValue(toRaw(props.modelValue), { mode: 'json', maxBytes: HISTOIRE_WIRE_LIMITS.state })
    }
    catch {
      return h('div', { 'role': 'group', 'aria-label': props['aria-label'] ?? props.title }, [
        h('span', String(props.title ?? '')),
        h('output', 'JSON editing unavailable'),
        slots?.actions(),
      ])
    }
  }
  // Source-derived values are presentation; editing remains an explicit runtime patch.
  return h(component, props, slots)
}
