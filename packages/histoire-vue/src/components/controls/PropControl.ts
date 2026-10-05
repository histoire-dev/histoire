import type { HistoireMatrixValue } from '@histoire/protocol'
import type { PropType } from 'vue'
import { createPropOverridePatch, HstButton, HstButtonGroup } from '@histoire/controls/vue'
import { getHistoireFiniteMatrixValues } from '@histoire/protocol'
import { defineComponent, h } from 'vue'
import { useHistoireSnapshot } from '../../composables/snapshot.js'
import { useHistoireContext } from '../../provider/context.js'
import { useHistoireControlEdit } from './edit.js'
import { renderHistoireControl } from './editor.js'

/** Runtime-derived prop metadata contains no component constructors or host execution. */
export interface HistoireControlProp {
  /** Name in owning component's automatic override state. */
  name: string
  /** Collected runtime prop type labels. */
  types?: string[]
  /** Cleaned runtime default used as editor hint. */
  default?: string
  /** Runtime-collected source prop value, used until an explicit override exists. */
  value?: unknown
  /** Complete finite choices advertised by source runtime metadata. */
  values?: readonly HistoireMatrixValue[]
  /** Framework enum alias retained until normalized to values. */
  enum?: readonly HistoireMatrixValue[]
}

/** Automatic props use same editor mapping and retain runtime-owned definitions. */
export const PropControl = defineComponent({
  name: 'HistoirePropControl',
  props: { index: { type: Number, required: true }, definition: { type: Object as PropType<HistoireControlProp>, required: true } },
  setup(props) {
    const context = useHistoireContext()
    const snapshot = useHistoireSnapshot()
    const edit = useHistoireControlEdit(snapshot, () => {
      const state = snapshot.value.state?.value as Record<string, unknown> | undefined
      const overrides = (state?._hPropState as Record<number, Record<string, unknown>> | undefined)?.[props.index]
      return overrides && Object.hasOwn(overrides, props.definition.name) ? overrides[props.definition.name] : props.definition.value
    })
    /** Deleting one override restores runtime default without rewriting definitions. */
    function patch(value: unknown, remove = false): void {
      const { index, definition } = props
      edit.set(remove ? definition.value : value, async () => {
        const state = context.session.getSnapshot().state?.value as Record<string, unknown> | undefined
        if (state) await context.session.state.patch(createPropOverridePatch(state, index, definition.name, value, remove))
      }, remove)
    }
    return () => {
      const state = snapshot.value.state?.value as Record<string, unknown> | undefined
      const overrides = (state?._hPropState as Record<number, Record<string, unknown>> | undefined)?.[props.index]
      const present = !!overrides && Object.hasOwn(overrides, props.definition.name)
      const control = {
        'title': `${props.definition.name}${present ? ' *' : ''}`,
        'aria-label': props.definition.name,
        'data-histoire-control-type': props.definition.types?.join(' | ') || 'unknown',
        'modelValue': edit.value.value,
        'placeholder': present ? undefined : props.definition.default,
        'onUpdate:modelValue': patch,
      }
      const slots = { actions: () => h(HstButton, { 'color': 'flat', 'type': 'button', 'disabled': !present, 'aria-label': `Remove ${props.definition.name} override`, 'onClick': () => patch(undefined, true) }, { default: () => 'Reset' }) }
      const values = getHistoireFiniteMatrixValues(props.definition.values ?? props.definition.enum)
      if (values?.length) {
        const selected = values.findIndex(value => value === edit.value.value)
        // String option tokens retain exact typed scalars in runtime-owned patches.
        return h(HstButtonGroup, {
          ...control,
          'class': 'histoire-prop-control-finite',
          'modelValue': selected < 0 ? undefined : String(selected),
          'options': values.map((value, index) => ({ value: String(index), label: typeof value === 'string' && values.some(other => typeof other !== 'string' && String(other) === value) ? JSON.stringify(value) : String(value) })),
          'onUpdate:modelValue': (token: string) => {
            const index = values.findIndex((_value, index) => String(index) === token)
            if (index !== -1) patch(values[index])
          },
        }, slots)
      }
      return renderHistoireControl(props.definition.types?.[0], control, slots)
    }
  },
})
