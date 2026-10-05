import type { HistoirePresetAction } from '@histoire/sdk/internal'
import type { PropType } from 'vue'
import { getControlElement, HstButton, HstText, restoreControlsFocus } from '@histoire/controls/vue'
import { defineComponent, h, nextTick, shallowRef } from 'vue'
import { HistoireDropdown } from '../../foundation/floating.js'
import { useHistoireResource } from '../../provider/context.js'

/** Preset editing stays inside the provider-owned dropdown, beside its select. */
export const PresetMenu = defineComponent({
  name: 'HistoirePresetMenu',
  props: {
    /** Opaque runtime ID; initial state intentionally has no saved preset actions. */
    selectedId: { type: String, required: true },
    /** Current saved label, used only to seed a rename draft. */
    selectedLabel: { type: String, default: '' },
    /** Runtime operation in flight disables opening another management action. */
    disabled: { type: Boolean, default: false },
    /** Parent retains document ownership and reports runtime errors. */
    action: { type: Function as PropType<(input: HistoirePresetAction) => Promise<boolean>>, required: true },
  },
  setup(props) {
    const trigger = shallowRef<HTMLButtonElement | null>(null)
    const content = shallowRef<HTMLElement | null>(null)
    const shown = shallowRef(false)
    const mode = shallowRef<'actions' | 'save' | 'rename'>('actions')
    const label = shallowRef('')
    const busy = shallowRef(false)
    let active = true
    let focusVersion = 0
    let openLast = false
    let visible = false

    /** Guard delayed focus against closed or retired dropdown content. */
    async function focusContent(): Promise<void> {
      const version = ++focusVersion
      await nextTick()
      if (!active || !shown.value || focusVersion !== version) return
      const input = content.value?.querySelector<HTMLInputElement>('input')
      const actions = content.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
      const target = input ?? actions?.[openLast ? actions.length - 1 : 0]
      target?.focus()
      input?.select()
      openLast = false
    }
    /** Only an explicit dismissal restores this dropdown's trigger focus. */
    function close(restore = false): void {
      const wasShown = shown.value
      shown.value = false
      focusVersion++
      if (restore && wasShown && trigger.value?.isConnected) trigger.value.focus()
    }
    /** A new opening starts at actions, never a stale name draft. */
    function open(last = false): void {
      if (props.disabled) return
      mode.value = 'actions'
      label.value = ''
      openLast = last
      shown.value = true
      // Reopening during the vendor's hide delay reuses an already visible
      // popper, so no second apply-show event will restore menu focus.
      if (visible) void focusContent()
    }
    /** Reveal a name field only for actions that need one. */
    function edit(next: 'save' | 'rename'): void {
      mode.value = next
      label.value = next === 'rename' ? props.selectedLabel : ''
      void focusContent()
    }
    /** Acknowledge before closing; retired requests cannot publish UI or focus. */
    async function run(input: HistoirePresetAction): Promise<void> {
      if (busy.value) return
      busy.value = true
      try {
        if (await props.action(input) && active) close(true)
      }
      finally {
        if (active) busy.value = false
      }
    }
    /** Enter commits a non-empty name without submitting any caller-owned form. */
    function submit(): void {
      const value = label.value.trim()
      if (!value || busy.value) return
      if (mode.value === 'save') void run({ action: 'save', label: value })
      else if (mode.value === 'rename' && props.selectedId) void run({ action: 'rename', id: props.selectedId, label: value })
    }
    /** Menu navigation skips unavailable preset actions; Tab resumes beside trigger. */
    function keydown(event: KeyboardEvent): void {
      if (event.key === 'Tab' && mode.value === 'actions') {
        event.preventDefault()
        event.stopPropagation()
        close()
        restoreControlsFocus(trigger.value, { restoreFocus: true, focusDirection: event.shiftKey ? 'previous' : 'next' })
        return
      }
      if (mode.value !== 'actions') {
        if (event.key === 'Enter' && event.target === content.value?.querySelector('input')) {
          event.preventDefault()
          event.stopPropagation()
          submit()
        }
        return
      }
      const actions = Array.from(content.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])
      const index = actions.indexOf(content.value?.ownerDocument.activeElement as HTMLButtonElement)
      const next = event.key === 'ArrowDown'
        ? (index + 1) % actions.length
        : event.key === 'ArrowUp'
          ? (index - 1 + actions.length) % actions.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? actions.length - 1 : undefined
      if (next === undefined || !actions.length) return
      event.preventDefault()
      event.stopPropagation()
      actions[next]?.focus()
    }
    /** Dismiss when keyboard traversal leaves this menu or its name form. */
    async function focusout(): Promise<void> {
      const owner = content.value
      await nextTick()
      if (!active || !shown.value || owner !== content.value) return
      const focused = owner?.ownerDocument.activeElement
      if (focused && !owner?.contains(focused) && focused !== trigger.value) close()
    }
    useHistoireResource(() => {
      active = false
      focusVersion++
    })
    return () => h(HistoireDropdown, {
      class: 'histoire-preset-dropdown',
      placement: 'bottom-end',
      distance: 6,
      triggers: [],
      shown: shown.value,
      noAutoFocus: true,
      autoBoundaryMaxSize: true,
      onApplyShow: () => {
        visible = true
        void focusContent()
      },
      onApplyHide: () => { visible = false },
      onHide: () => close(),
    }, {
      default: () => h(HstButton, { 'color': 'flat', 'ref': (value: any) => { trigger.value = getControlElement(value) as HTMLButtonElement | null }, 'type': 'button', 'class': 'histoire-preset-trigger', 'aria-label': 'Manage presets', 'aria-haspopup': 'menu', 'aria-expanded': shown.value, 'disabled': props.disabled, 'onClick': () => shown.value ? close(true) : open(), 'onKeydown': (event: KeyboardEvent) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        event.preventDefault()
        event.stopPropagation()
        open(event.key === 'ArrowUp')
      } }, { default: () => h('svg', { 'viewBox': '0 0 16 16', 'width': 16, 'height': 16, 'fill': 'currentColor', 'aria-hidden': true }, [4, 8, 12].map(cy => h('circle', { cx: 8, cy, r: 1.25 }))) }),
      popper: () => mode.value === 'actions'
        ? h('div', { 'ref': content, 'class': 'histoire-preset-menu histoire-control-popover', 'role': 'menu', 'aria-label': 'Preset actions', 'onKeydown': keydown, 'onFocusout': focusout }, [
            h(HstButton, { color: 'flat', type: 'button', role: 'menuitem', tabindex: -1, disabled: busy.value, onClick: () => edit('save') }, { default: () => 'Save preset' }),
            h(HstButton, { color: 'flat', type: 'button', role: 'menuitem', tabindex: -1, disabled: busy.value || !props.selectedId, onClick: () => edit('rename') }, { default: () => 'Rename preset' }),
            h(HstButton, { color: 'flat', type: 'button', role: 'menuitem', tabindex: -1, disabled: busy.value || !props.selectedId, onClick: () => { void run({ action: 'delete', id: props.selectedId }) } }, { default: () => 'Delete preset' }),
          ])
        : h('div', { 'ref': content, 'class': 'histoire-preset-form histoire-control-popover', 'role': 'form', 'aria-label': mode.value === 'save' ? 'Save preset' : 'Rename preset', 'aria-busy': busy.value, 'onKeydown': keydown, 'onFocusout': focusout }, [
            h(HstText, { 'layout': 'inline', 'aria-label': 'Preset name', 'placeholder': 'Preset name', 'maxlength': 120, 'modelValue': label.value, 'disabled': busy.value, 'onUpdate:modelValue': (value: string) => { label.value = value } }),
            h('div', { class: 'histoire-preset-form-actions' }, [
              h(HstButton, { color: 'flat', type: 'button', disabled: busy.value, onClick: () => {
                mode.value = 'actions'
                void focusContent()
              } }, { default: () => 'Cancel' }),
              h(HstButton, { color: 'flat', type: 'button', disabled: busy.value || !label.value.trim(), onClick: submit }, { default: () => mode.value === 'save' ? 'Save' : 'Rename' }),
            ]),
          ]),
    })
  },
})
