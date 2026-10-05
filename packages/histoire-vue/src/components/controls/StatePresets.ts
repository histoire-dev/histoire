import type { HistoirePresetAction, HistoirePresetList } from '@histoire/sdk/internal'
import { HstSelect } from '@histoire/controls/vue'
import { requestHistoireStatePreset } from '@histoire/sdk/internal'
import { defineComponent, h, shallowRef, watch } from 'vue'
import { useHistoireSnapshot } from '../../composables/snapshot.js'
import { useHistoireContext, useHistoireResource } from '../../provider/context.js'
import { PresetMenu } from './PresetMenu.js'

/** Preset-owner action exposed to adjacent controls without duplicating selection state. */
export interface HistoireStatePresetsHandle {
  /** Whether a list or preset command currently owns the state controls. */
  busy: () => boolean
  /** Reset runtime state and synchronize the selected preset when still current. */
  reset: () => Promise<boolean>
}

/** Memory-only runtime-owned presets; host receives opaque IDs and labels only. */
export const StatePresets = defineComponent({
  name: 'HistoireStatePresets',
  props: {
    /** First-party inspector prefixes select choices with their preset context. */
    compact: { type: Boolean, default: false },
  },
  setup(props, { expose }) {
    const context = useHistoireContext()
    const snapshot = useHistoireSnapshot()
    const items = shallowRef<HistoirePresetList['items']>([])
    const selected = shallowRef('')
    const pending = shallowRef(false)
    let generation = 0
    let operationGeneration = 0
    let documentIdentity = ''
    let active = true
    /** Source publication retires commands while surviving document presets remain valid. */
    function owner(): string {
      const value = snapshot.value
      return JSON.stringify([value.status, value.stale, value.source, value.selection, value.runtime.mountId, value.runtime.runtimeId, value.runtime.status])
    }
    /** Captured source and document own operation, error and selection publication. */
    async function action(input: HistoirePresetAction | { action: 'reset' }): Promise<boolean> {
      if (pending.value) return false
      const token = operationGeneration
      pending.value = true
      try {
        let result: HistoirePresetList
        if (input.action === 'reset') {
          await context.session.state.reset()
          result = { items: items.value }
        }
        else {
          result = await requestHistoireStatePreset(context.session, input)
        }
        if (!active || operationGeneration !== token) {
          return false
        }
        items.value = result.items
        if (result.selectedId) {
          selected.value = result.selectedId
        }
        else if (input.action === 'apply') {
          selected.value = input.id
        }
        if (input.action === 'delete' || input.action === 'reset') {
          selected.value = ''
        }
        return true
      }
      catch (error) {
        if (active && operationGeneration === token) {
          context.reportError(error)
        }
        return false
      }
      finally {
        if (active && operationGeneration === token) pending.value = false
      }
    }
    watch(owner, () => {
      operationGeneration++
      pending.value = false
      const value = snapshot.value
      const identity = JSON.stringify([value.source?.sourceId, value.source?.epoch, value.runtime.runtimeId, value.runtime.status, value.selection])
      if (identity !== documentIdentity) {
        documentIdentity = identity
        generation++
        items.value = []
        selected.value = ''
      }
      // An unrelated story HMR can retire a pending list request. Refresh the
      // surviving runtime's list without clearing its existing choices/draft.
      if (value.status === 'ready' && !value.stale && value.runtime.status === 'ready') {
        void action({ action: 'list' })
      }
    }, { immediate: true, flush: 'sync' })
    useHistoireResource(() => {
      active = false
      generation++
      operationGeneration++
    })
    // External Reset state must pass through this owner so preset selection
    // cannot survive a successful runtime reset as stale menu state.
    expose({ busy: () => pending.value, reset: () => action({ action: 'reset' }) } satisfies HistoireStatePresetsHandle)
    return () => h('div', { class: ['histoire-state-presets', props.compact ? 'histoire-state-presets-compact' : ''] }, [
      h(HstSelect, { 'layout': 'inline', 'aria-label': 'State preset', 'modelValue': selected.value, 'disabled': pending.value, 'options': [{ value: '', label: props.compact ? 'Preset: Initial state' : 'Initial state' }, ...items.value.map(item => ({ value: item.id, label: props.compact ? `Preset: ${item.label}` : item.label }))], 'onUpdate:modelValue': (id: string) => {
        void action(id ? { action: 'apply', id } : { action: 'reset' })
      } }),
      h(PresetMenu, { key: generation, selectedId: selected.value, selectedLabel: items.value.find(item => item.id === selected.value)?.label, disabled: pending.value, action }),
    ])
  },
})
