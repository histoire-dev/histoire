import type { HistoireSearchResult } from '@histoire/protocol'
import type { ClientCommand } from '@histoire/shared'
import type { PropType } from 'vue'
import type { createStandaloneCommands } from './commands.js'
import { HstButton } from '@histoire/controls/vue'
import { HistoireSearch } from '@histoire/vue'
import { createHistoireSearchNavigation, HISTOIRE_SEARCH_FOCUS, provideHistoireSearchNavigation, useHistoireContext, useHistoireResource } from '@histoire/vue/internal'
import { computed, defineComponent, h, nextTick, onMounted, shallowRef, watch } from 'vue'
import CommandPrompts from '../components/command/CommandPrompts.vue'

/** Standalone command extension surrounds shared search; prompts reuse existing component sources. */
export const StandaloneCommandPalette = defineComponent({
  name: 'HistoireStandaloneCommands',
  props: { commands: { type: Object as PropType<ReturnType<typeof createStandaloneCommands>>, required: true } },
  emits: ['error'],
  setup(props, { emit, expose }) {
    const context = useHistoireContext()
    const query = shallowRef('')
    const selected = shallowRef<ClientCommand | null>(null)
    const search = shallowRef<{ focus: () => void, search: (query: string) => void } | null>(null)
    const dialog = shallowRef<HTMLDialogElement | null>(null)
    const commands = computed(() => query.value ? props.commands.list(query.value) : [])
    const navigation = createHistoireSearchNavigation()
    // One publication owns both rendered rows and keyboard actions. Reconcile
    // synchronously so a state update cannot execute a former positional owner.
    watch(() => selected.value ? [] : commands.value, value => navigation.setExtensions(value.map(command => ({ id: command.id, activate: () => activate(command) }))), { immediate: true, flush: 'sync' })
    provideHistoireSearchNavigation(navigation)
    let active = true
    let returnFocus: HTMLElement | null = null
    /** Native dialog owns focus trap; revealing precedes search focus in same provider. */
    async function open() {
      if (!active || !dialog.value) return
      if (!dialog.value.open) {
        returnFocus = dialog.value.ownerDocument.activeElement as HTMLElement | null
        dialog.value.showModal()
      }
      search.value?.search('')
      await nextTick()
      if (active && dialog.value?.open) search.value?.focus()
    }
    /** Closing never restores focus into a removed dialog or provider. */
    function close(restore = true) {
      dialog.value?.close()
      selected.value = null
      if (restore && returnFocus?.isConnected) returnFocus.focus()
      returnFocus = null
    }
    /** Finite local focus intent also opens search requested from owned story frame. */
    function requestFocus(event: Event) {
      if ((event.target as Element)?.closest('.histoire-provider') !== context.root.value) return
      event.preventDefault()
      void open().catch(error => emit('error', error))
    }
    onMounted(() => context.root.value?.addEventListener(HISTOIRE_SEARCH_FOCUS, requestFocus))
    useHistoireResource(() => {
      active = false
      context.root.value?.removeEventListener(HISTOIRE_SEARCH_FOCUS, requestFocus)
      close(false)
    })
    /** Prompt callbacks/getParams keep existing plugin contract within standalone origin. */
    function execute(command: ClientCommand, params: Record<string, any>) {
      void props.commands.execute(command, params).catch((error) => {
        if (active) emit('error', error)
      })
    }
    /** Opening prompts does not run action; submission owns and observes its async completion. */
    function activate(command: ClientCommand) {
      // A stale DOM click also cannot activate a command retired before Vue's patch.
      if (!commands.value.some(current => current.id === command.id)) return
      if (command.prompts?.length) {
        selected.value = command
      }
      else {
        try {
          execute(command, command.getParams?.(props.commands.context()) ?? {})
          close()
        }
        catch (error) {
          emit('error', error)
        }
      }
    }
    expose({ focus: () => void open().catch(error => emit('error', error)) })
    return () => {
      return h('dialog', { 'ref': dialog, 'class': 'histoire-standalone-search', 'aria-label': 'Search stories and commands', 'data-test-id': 'search-modal', 'onCancel': (event: Event) => {
        event.preventDefault()
        close()
      }, 'onClick': (event: MouseEvent) => {
        if (event.target !== dialog.value) return
        const rect = dialog.value.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close()
      }, 'onKeydown': (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          close()
          return
        }
        if (!selected.value) navigation.keydown(event)
      } }, [
        h(HistoireSearch, { ref: search, onQuery: (value: string) => {
          query.value = value
          navigation.setResults([])
        }, onSelect: (result: HistoireSearchResult) => {
          close()
          if (result.kind === 'docs') {
            void props.commands.activateSearch(result).catch((error) => {
              if (active) emit('error', error)
            })
          }
        }, onError: (error: unknown) => emit('error', error) }),
        ...commands.value.map((command, position) => h(HstButton, { 'color': 'flat', 'key': command.id, 'type': 'button', 'aria-current': navigation.isActive(position, true) ? 'true' : undefined, 'onFocus': () => navigation.focus(position, true), 'onClick': () => activate(command) }, { default: () => command.label })),
        selected.value ? h('div', { 'class': 'histoire-standalone-command-modal', 'role': 'dialog', 'aria-label': selected.value.label }, h(CommandPrompts, { command: selected.value, context: props.commands.context(), execute, onClose: () => close() })) : null,
      ])
    }
  },
})
