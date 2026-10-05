import type { HistoireSession } from '@histoire/sdk'
import { createHistoireSession } from '@histoire/sdk'
import { createApp, defineComponent, h, nextTick, ref, shallowRef } from 'vue'
import { BookPanels } from './BookPanels.js'
import '@histoire/vue/style.css'
import './style.css'

/** Host owns connection/disposal; providers remove only their own child resources. */
const Host = defineComponent({
  setup() {
    const source = ref(new URLSearchParams(location.search).get('source') ?? import.meta.env.VITE_HISTOIRE_URL ?? '')
    const hostValue = ref('Host value')
    const sessions = shallowRef<HistoireSession[]>([])
    const error = ref('')
    const connecting = ref(false)
    const owned = new Set<HistoireSession>()
    let removed = false
    /** Every asynchronous surface failure is observed by host boundary. */
    function report(value: unknown) {
      error.value = value instanceof Error ? value.message : String(value)
    }
    /** Explicit reconnect removes old providers before joining caller-owned controllers. */
    async function connect() {
      if (connecting.value || removed) return
      connecting.value = true
      const previous = sessions.value
      sessions.value = []
      const next: HistoireSession[] = []
      try {
        await nextTick()
        await Promise.all(previous.map(session => session.dispose()))
        for (const session of previous) owned.delete(session)
        for (let index = 0; index < 2; index++) {
          const session = createHistoireSession({ url: source.value })
          owned.add(session)
          next.push(session)
        }
        await Promise.all(next.map(session => session.connect()))
        if (removed) {
          await Promise.all(next.map(session => session.dispose()))
          return
        }
        sessions.value = next
        error.value = ''
      }
      catch (value) {
        await Promise.all(next.map(session => session.dispose()))
        for (const session of next) owned.delete(session)
        report(value)
      }
      finally { connecting.value = false }
    }
    window.addEventListener('pagehide', () => {
      removed = true
      void Promise.all(Array.from(owned, session => session.dispose())).catch(report)
    }, { once: true })
    return () => [
      h('form', { onSubmit: (event: Event) => {
        event.preventDefault()
        void connect().catch(report)
      } }, [
        h('label', ['Source URL ', h('input', { type: 'url', required: true, value: source.value, onInput: (event: Event) => source.value = (event.target as HTMLInputElement).value })]),
        h('button', { disabled: connecting.value }, 'Connect two sessions'),
      ]),
      h('label', ['Host field ', h('input', { value: hostValue.value, onInput: (event: Event) => hostValue.value = (event.target as HTMLInputElement).value })]),
      error.value ? h('p', { role: 'alert' }, error.value) : null,
      h('div', { class: 'books' }, sessions.value.map((session, index) => h(BookPanels, { key: index, session, initialGrid: Boolean(index), onError: report }))),
    ]
  },
})

createApp(Host).mount('#app')
