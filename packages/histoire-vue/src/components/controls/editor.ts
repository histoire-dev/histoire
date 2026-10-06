import type { VNode } from 'vue'
import { getControlComponent, HstJson } from '@histoire/controls/vue'
import { HISTOIRE_WIRE_LIMITS, measureWireValue } from '@histoire/protocol'
import { h, toRaw } from 'vue'

/**
 * JSON editors cannot round-trip every cloneable state graph. Never rewrite
 * unsupported values into strings or omit fields to make them editable.
 */
export function renderHistoireControl(type: string | undefined, props: Record<string, unknown>, slots?: { 'label-actions'?: () => VNode }): VNode {
  const component = getControlComponent(type)
  if (component === HstJson && props.modelValue !== undefined) {
    try {
      measureWireValue(toRaw(props.modelValue), { mode: 'json', maxBytes: HISTOIRE_WIRE_LIMITS.state })
    }
    catch {
      const hasLabelActions = !!slots?.['label-actions']
      const label = [h('span', { class: 'histoire-control-title' }, String(props.title ?? ''))]
      if (hasLabelActions) {
        label.push(
          h('span', { class: 'histoire-control-label-actions' }, slots?.['label-actions']?.()),
          h('span', { class: 'histoire-control-type' }, String(props['data-histoire-control-type'] ?? 'unknown')),
        )
      }
      return h('div', { 'role': 'group', 'class': hasLabelActions ? [props.class, 'histoire-prop-control-unavailable'] : undefined, 'aria-label': props['aria-label'] ?? props.title }, [
        h('span', { class: 'histoire-control-label' }, label),
        h('output', 'JSON editing unavailable'),
      ])
    }
  }
  // Source-derived values are presentation; editing remains an explicit runtime patch.
  return h(component, props, slots)
}
