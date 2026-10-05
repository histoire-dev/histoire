import { defineComponent } from 'vue'
import { useHistoireSnapshot } from '../../composables/snapshot.js'
import { useHistoireContext } from '../../provider/context.js'
import { useHistoireControlEdit } from './edit.js'
import { renderHistoireControl } from './editor.js'

/** Native editor changes cleaned mirror through canonical session patch. */
export const StateControl = defineComponent({
  name: 'HistoireStateControl',
  props: { field: { type: String, required: true } },
  setup(props) {
    const context = useHistoireContext()
    const snapshot = useHistoireSnapshot()
    const edit = useHistoireControlEdit(snapshot, () => (snapshot.value.state?.value as Record<string, unknown> | undefined)?.[props.field])
    return () => {
      const state = snapshot.value.state?.value as Record<string, unknown> | undefined
      if (!state || !Object.hasOwn(state, props.field)) return null
      return renderHistoireControl(typeof state[props.field], {
        'title': props.field,
        'data-histoire-control-type': typeof state[props.field],
        'modelValue': edit.value.value,
        'onUpdate:modelValue': (value: unknown) => {
          const field = props.field
          edit.set(value, () => context.session.state.patch({ [field]: value }))
        },
      })
    }
  },
})
