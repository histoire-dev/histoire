import { BuiltinIcon, getControlElement, HstButton, restoreControlsFocus } from '@histoire/controls/vue'
import { defineComponent, h, nextTick, shallowRef } from 'vue'
import { HistoireDropdown } from '../../foundation/floating.js'
import { useHistoireResource } from '../../provider/context.js'

/** Split Run command with secondary actions menu and local cancellation. */
export const HistoireTestsRunActions = defineComponent({
  name: 'HistoireTestsRunActions',
  props: {
    /** Any execution, local or host-owned, blocks new commands. */
    busy: { type: Boolean, required: true },
    /** Only a local operation can be cancelled from this panel. */
    cancellable: { type: Boolean, required: true },
    /** Ready runtime with in-canvas test capability. */
    canvasAvailable: { type: Boolean, required: true },
    /** Dev source with server test capability and selected variant. */
    serverAvailable: { type: Boolean, required: true },
  },
  emits: {
    /** Omitted mode refreshes definitions without running assertions. */
    perform: (_mode?: 'preview' | 'server') => true,
    cancel: () => true,
  },
  setup(props, { emit }) {
    const trigger = shallowRef<HTMLButtonElement | null>(null)
    const menu = shallowRef<HTMLElement | null>(null)
    const open = shallowRef(false)
    let active = true
    let focusVersion = 0
    let openLast = false
    useHistoireResource(() => {
      active = false
      focusVersion++
    })

    /** Enabled menu items in DOM order. */
    function items(): HTMLButtonElement[] {
      return Array.from(menu.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])
    }
    /** Focuses menu's requested edge only after provider-local dropdown mounts. */
    async function focusItems(last = openLast): Promise<void> {
      const version = ++focusVersion
      await nextTick()
      if (!active || !open.value || version !== focusVersion) return
      const list = items()
      list[last ? list.length - 1 : 0]?.focus()
    }
    /** Closes menu; explicit keyboard dismissal returns focus to its trigger. */
    function close(restore = false): void {
      const wasOpen = open.value
      open.value = false
      focusVersion++
      if (restore && wasOpen && trigger.value?.isConnected) trigger.value.focus()
    }
    /** Opens menu and chooses first or last available command for arrow keys. */
    function show(last = false): void {
      openLast = last
      open.value = true
      void focusItems(last)
    }
    /** Starts selected command after dismissing menu that contained it. */
    function select(mode?: 'preview' | 'server'): void {
      close()
      emit('perform', mode)
    }
    /** Implements expected menu traversal without leaking keys to host shortcuts. */
    function onMenuKeydown(event: KeyboardEvent): void {
      if (event.key === 'Tab') {
        event.preventDefault()
        event.stopPropagation()
        close()
        restoreControlsFocus(trigger.value, { restoreFocus: true, focusDirection: event.shiftKey ? 'previous' : 'next' })
        return
      }
      const list = items()
      const index = list.indexOf(menu.value?.ownerDocument.activeElement as HTMLButtonElement)
      const next = event.key === 'ArrowDown'
        ? (index + 1) % list.length
        : event.key === 'ArrowUp'
          ? (index - 1 + list.length) % list.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : undefined
      if (next === undefined || !list.length) return
      event.preventDefault()
      event.stopPropagation()
      list[next]?.focus()
    }
    /** Arrow keys on trigger open menu at matching edge. */
    function onTriggerKeydown(event: KeyboardEvent): void {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      event.preventDefault()
      event.stopPropagation()
      show(event.key === 'ArrowUp')
    }

    return () => h('div', { class: 'histoire-tests-actions' }, [
      h('div', { 'class': 'histoire-tests-run-group', 'role': 'group', 'aria-label': 'Test actions' }, [
        h(HstButton, { 'color': 'flat', 'type': 'button', 'class': 'histoire-tests-run', 'aria-label': 'Run tests', 'disabled': props.busy || !props.canvasAvailable, 'onClick': () => emit('perform', 'preview') }, {
          default: () => [h(BuiltinIcon, { 'icon': 'play-filled-alt', 'size': 14, 'aria-hidden': 'true' }), 'Run'],
        }),
        h(HistoireDropdown, {
          class: 'histoire-tests-run-dropdown',
          placement: 'bottom-end',
          distance: 6,
          triggers: [],
          shown: open.value,
          noAutoFocus: true,
          autoBoundaryMaxSize: true,
          onApplyShow: () => { void focusItems() },
          onHide: () => close(),
        }, {
          default: () => h(HstButton, {
            'color': 'flat',
            'ref': (value: unknown) => { trigger.value = getControlElement(value) as HTMLButtonElement | null },
            'type': 'button',
            'class': 'histoire-tests-run-trigger',
            'iconOnly': true,
            'aria-label': 'More test actions',
            'aria-haspopup': 'menu',
            'aria-expanded': open.value,
            'disabled': props.busy,
            'onClick': () => open.value ? close(true) : show(),
            'onKeydown': onTriggerKeydown,
          }, { default: () => h(BuiltinIcon, { 'icon': 'chevron-down', 'size': 14, 'aria-hidden': 'true' }) }),
          popper: () => h('div', { 'ref': menu, 'class': 'histoire-tests-run-menu histoire-control-popover', 'role': 'menu', 'aria-label': 'Test actions', 'onKeydown': onMenuKeydown }, [
            h(HstButton, { color: 'flat', type: 'button', role: 'menuitem', tabindex: -1, disabled: props.busy || !props.serverAvailable, onClick: () => select('server') }, { default: () => 'Run on server' }),
            h(HstButton, { color: 'flat', type: 'button', role: 'menuitem', tabindex: -1, disabled: props.busy || !props.canvasAvailable, onClick: () => select() }, { default: () => 'Force refresh' }),
          ]),
        }),
      ]),
      props.cancellable
        ? h(HstButton, { color: 'flat', type: 'button', class: 'histoire-tests-cancel', onClick: () => emit('cancel') }, {
            default: () => [h(BuiltinIcon, { 'icon': 'stop-filled-alt', 'size': 14, 'aria-hidden': 'true' }), 'Cancel'],
          })
        : null,
    ])
  },
})
