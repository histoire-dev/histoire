import type { HistoireSettingsPatch, HistoireSourceConfig } from '@histoire/protocol'
import { HstButton, HstSelect, HstSwitch, HstText } from '@histoire/controls/vue'
import { getHistoireSessionDescriptor, requestHistoireOpenInEditor } from '@histoire/sdk/internal'
import { defineComponent, h, ref, watch } from 'vue'
import { useHistoireSnapshot } from '../../composables/snapshot.js'
import { useHistoireContext } from '../../provider/context.js'

/** Scoped preferences work without primary; runtime receives current settings when explicitly mounted. */
export const HistoireToolbar = defineComponent({
  name: 'HistoireToolbar',
  emits: ['error'],
  setup(_props, { emit }) {
    const { session } = useHistoireContext()
    const snapshot = useHistoireSnapshot()
    const width = ref(String(snapshot.value.settings.responsiveWidth))
    const height = ref(snapshot.value.settings.responsiveHeight == null ? '' : String(snapshot.value.settings.responsiveHeight))
    // String drafts retain native change/blur commit timing, including Auto height.
    watch(() => snapshot.value.settings.responsiveWidth, value => width.value = String(value))
    watch(() => snapshot.value.settings.responsiveHeight, value => height.value = value == null ? '' : String(value))
    /** Every complete patch is validated atomically by session; failures remain visible to host. */
    function update(patch: HistoireSettingsPatch) {
      void session.settings.update(patch).catch(error => emit('error', error))
    }
    /** First-party finite editor action names only collected story target. */
    function editor() {
      const target = snapshot.value.selection
      if (target) void requestHistoireOpenInEditor(session, target).catch(error => emit('error', error))
    }
    return () => {
      const settings = snapshot.value.settings
      let config: HistoireSourceConfig | undefined
      try {
        config = getHistoireSessionDescriptor(session).config
      }
      catch { /* Disconnected/SSR provider still displays current local preferences. */ }
      return h('section', { 'class': 'histoire-toolbar', 'aria-label': 'Histoire toolbar' }, [
        h(HstText, { 'layout': 'inline', 'aria-label': 'Viewport width', 'type': 'number', 'min': 1, 'modelValue': width.value, 'onUpdate:modelValue': (value: string) => width.value = value, 'onChange': () => update({ responsiveWidth: Number(width.value) }) }),
        h(HstText, { 'layout': 'inline', 'aria-label': 'Viewport height', 'type': 'number', 'min': 1, 'modelValue': height.value, 'onUpdate:modelValue': (value: string) => height.value = value, 'onChange': () => update({ responsiveHeight: height.value ? Number(height.value) : null }) }),
        h(HstButton, { 'color': 'flat', 'type': 'button', 'aria-pressed': settings.rotate, 'onClick': () => update({ rotate: !settings.rotate }) }, { default: () => 'Rotate' }),
        h(HstSelect, { 'layout': 'inline', 'aria-label': 'Viewport preset', 'placeholder': 'Viewport', 'options': (config?.responsivePresets ?? []).map((preset, index) => ({ value: index, label: preset.label })), 'onUpdate:modelValue': (index: number) => {
          const preset = config?.responsivePresets[index]
          if (preset) update({ responsiveWidth: preset.width, responsiveHeight: preset.height ?? null })
        } }),
        h(HstSelect, { 'layout': 'inline', 'aria-label': 'Background', 'modelValue': settings.backgroundColor, 'options': [...(config?.backgroundPresets.some(preset => preset.color === 'transparent') ? [] : [{ value: 'transparent', label: 'Transparent' }]), ...(config?.backgroundPresets ?? []).map(preset => ({ value: preset.color, label: preset.label }))], 'onUpdate:modelValue': (value: string) => update({ backgroundColor: value }) }),
        h(HstSwitch, { 'title': 'Checkerboard', 'modelValue': settings.checkerboard, 'onUpdate:modelValue': (value: boolean) => update({ checkerboard: value }) }),
        h(HstSelect, { 'layout': 'inline', 'aria-label': 'Direction', 'modelValue': settings.textDirection, 'options': [{ value: 'ltr', label: 'LTR' }, { value: 'rtl', label: 'RTL' }], 'onUpdate:modelValue': (value: 'ltr' | 'rtl') => update({ textDirection: value }) }),
        config?.theme.hideColorSchemeSwitch ? null : h(HstSelect, { 'layout': 'inline', 'aria-label': 'Appearance', 'modelValue': settings.colorScheme, 'options': ['auto', 'light', 'dark'], 'onUpdate:modelValue': (value: 'light' | 'dark' | 'auto') => update({ colorScheme: value }) }),
        h(HstButton, { color: 'flat', type: 'button', disabled: !snapshot.value.capabilities.openInEditor.available || !snapshot.value.selection, onClick: editor }, { default: () => 'Open in editor' }),
      ])
    }
  },
})
