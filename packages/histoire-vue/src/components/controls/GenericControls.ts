import { getControlStateKeys } from '@histoire/controls/vue'
import { defineComponent, h } from 'vue'
import { useHistoireSnapshot } from '../../composables/snapshot.js'
import { PropControl } from './PropControl.js'
import { StateControl } from './StateControl.js'

/** Render generic state and auto props from readonly runtime projection only. */
export const GenericControls = defineComponent({
  name: 'HistoireGenericControls',
  props: { showState: { type: Boolean, default: true } },
  setup(props) {
    const snapshot = useHistoireSnapshot()
    return () => {
      const state = snapshot.value.state?.value as Record<string, unknown> | undefined
      if (!state) return null
      const definitions = Array.isArray(state._hPropDefs) ? state._hPropDefs : []
      return h('div', { class: 'histoire-generic-controls' }, [
        ...(props.showState ? getControlStateKeys(state).map(field => h(StateControl, { key: field, field })) : []),
        ...definitions.map(component => component && typeof component === 'object' && typeof component.index === 'number' && Array.isArray(component.props)
          ? h('fieldset', { key: component.index }, [
              h('legend', String(component.name ?? 'Component')),
              ...component.props.filter((prop: any) => prop && typeof prop.name === 'string').map((definition: any) => h(PropControl, { key: definition.name, index: component.index, definition })),
            ])
          : null),
      ])
    }
  },
})
