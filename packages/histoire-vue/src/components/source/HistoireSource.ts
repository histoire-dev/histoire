import type { PropType } from 'vue'
import type { HistoireContentState } from '../../content/controller.js'
import type { HistoirePreparedSource } from './content.js'
import { HstButton, useHistoireControls } from '@histoire/controls/vue'
import { HistoireSdkError } from '@histoire/protocol'
import { computed, defineComponent, h, onMounted, shallowRef, watch } from 'vue'
import { useHistoireSnapshot } from '../../composables/snapshot.js'
import { createHistoireContentController } from '../../content/controller.js'
import { useHistoireContext, useHistoireResource } from '../../provider/context.js'
import { prepareHistoireSource } from './content.js'

/** Explicit raw/dynamic source modes; unavailable dynamic never creates preview or silently switches. */
export const HistoireSource = defineComponent({
  name: 'HistoireSource',
  props: {
    /** Explicit source mode; never silently switches to another generation. */
    mode: { type: String as PropType<'raw' | 'dynamic'>, default: 'raw' },
    /** Code surface appearance can differ from surrounding provider. */
    appearance: { type: String as PropType<'auto' | 'light' | 'dark'>, default: 'auto' },
  },
  emits: ['content', 'error', 'status', 'update:mode'],
  setup(props, { emit, expose }) {
    const { session } = useHistoireContext()
    const snapshot = useHistoireSnapshot()
    const providerDark = useHistoireControls()!.dark
    const dark = computed(() => props.appearance === 'auto' ? providerDark.value : props.appearance === 'dark')
    const mode = shallowRef(props.mode)
    const state = shallowRef<HistoireContentState<HistoirePreparedSource>>({ status: 'idle', value: null, error: null })
    const controller = createHistoireContentController(session, () => {
      const value = session.getSnapshot()
      return [value.status, value.stale, value.source?.epoch, value.source?.revision, value.selection?.storyId, dark.value, mode.value, ...(mode.value === 'dynamic' ? [value.selection?.variantId, value.runtime.status, value.runtime.runtimeId, value.state] : [])]
    }, async () => {
      const value = session.getSnapshot()
      if (!value.selection) return null
      if (mode.value === 'dynamic' && value.runtime.status !== 'ready') throw new HistoireSdkError('PREVIEW_NOT_READY', 'Dynamic source requires ready preview')
      const content = await session.source.get({ storyId: value.selection.storyId, ...(mode.value === 'dynamic' && value.selection.variantId ? { variantId: value.selection.variantId } : {}), mode: mode.value })
      return prepareHistoireSource(content, dark.value)
    }, (value) => {
      state.value = value
      emit('status', { status: value.status, empty: value.value?.content.body === '' })
      if (value.status === 'ready') emit('content', value.value!.content)
      if (value.status === 'error') emit('error', value.error)
    })
    useHistoireResource(controller.close)
    expose({ refresh: controller.refresh })
    onMounted(() => void controller.start())
    watch(() => props.mode, (value) => {
      mode.value = value
      void controller.refresh()
    })
    watch(dark, () => void controller.refreshIfChanged())
    /** Panel choice remains explicit and can be controlled by host's mode prop. */
    function choose(value: 'raw' | 'dynamic') {
      mode.value = value
      emit('update:mode', value)
      void controller.refresh()
    }
    /** Copy uses current captured text; failures stay panel-local and observed. */
    function copy() {
      const content = state.value.value?.content.body
      if (content !== undefined) void globalThis.navigator?.clipboard?.writeText(content).catch(error => emit('error', error))
    }
    return () => {
      const value = state.value.value
      return h('section', { 'class': 'histoire-source', 'aria-label': 'Histoire source', 'aria-busy': state.value.status === 'loading' }, [
        h('div', { 'class': 'histoire-content-actions', 'role': 'group', 'aria-label': 'Source mode' }, [
          h(HstButton, { 'color': 'flat', 'type': 'button', 'aria-pressed': mode.value === 'raw', 'disabled': !snapshot.value.capabilities.rawSource.available, 'onClick': () => choose('raw') }, { default: () => 'Raw' }),
          h(HstButton, { 'color': 'flat', 'type': 'button', 'aria-pressed': mode.value === 'dynamic', 'onClick': () => choose('dynamic') }, { default: () => 'Dynamic' }),
          h(HstButton, { color: 'flat', type: 'button', disabled: !value, onClick: copy }, { default: () => 'Copy' }),
        ]),
        state.value.error ? h('p', { role: 'alert' }, (state.value.error as Error).message ?? String(state.value.error)) : null,
        value ? h('div', { class: 'histoire-source-content' }, value.html === null ? h('pre', value.content.body) : h('div', { innerHTML: value.html })) : null,
      ])
    }
  },
})
