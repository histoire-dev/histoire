import type { HistoireSession, HistoireSurface } from '@histoire/sdk'
import { createHistoireSession } from '@histoire/sdk'
import { addSelection } from './selection.js'

/** Explicit source/session ownership; caller keeps this cleanup for disconnect/pagehide. */
export function connectDemo(url: string, mode: string, container: HTMLElement, report: (error: unknown) => void) {
  const sessions: HistoireSession[] = []
  const subscriptions: (() => void)[] = []
  let removed = false
  let closing: Promise<void> | undefined
  /** Capture cleanup before asynchronous connection, including pagehide during handshake. */
  function close() {
    closing ??= (async () => {
      removed = true
      for (const stop of subscriptions.splice(0)) stop()
      const results = await Promise.allSettled(sessions.map(session => session.dispose()))
      container.replaceChildren()
      const errors = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      if (errors.length) throw new AggregateError(errors.map(result => result.reason), 'Session cleanup failed')
    })()
    return closing
  }
  /** Mount frame readiness is observed; failed surfaces stay visible through error boundary. */
  function surface(session: HistoireSession, owner: HTMLElement, name: HistoireSurface) {
    const element = document.createElement('section')
    element.dataset.surface = name
    owner.append(element)
    const mounted = session.mount(element, { surface: name })
    void mounted.ready.catch(report)
    return mounted
  }
  /** Reloaded source requires new caller intent; never replay state edits or tests. */
  function observeConnection(session: HistoireSession) {
    subscriptions.push(session.subscribe((snapshot) => {
      if (!removed && snapshot.status === 'disconnected') report(new Error('Source disconnected; connect again'))
    }))
  }
  const ready = (async () => {
    try {
      const session = createHistoireSession({ url })
      sessions.push(session)
      observeConnection(session)
      await session.connect()
      if (removed) return
      if (mode === 'explorer') {
        surface(session, container, 'explorer')
      }
      else if (mode === 'parts') {
        for (let index = 0; index < 2; index++) {
          const current = index ? createHistoireSession({ url }) : session
          if (index) {
            sessions.push(current)
            observeConnection(current)
            await current.connect()
            if (removed) return
          }
          const column = document.createElement('article')
          container.append(column)
          subscriptions.push(addSelection(column, current, report))
          for (const name of ['toolbar', 'search', 'tree', index ? 'grid' : 'preview', 'controls', 'docs', 'source', 'events', 'tests'] as const) surface(current, column, name)
        }
      }
      else {
        subscriptions.push(addSelection(container, session, report))
        for (const name of ['tree', 'toolbar', 'controls', 'source'] as const) surface(session, container, name)
        const button = document.createElement('button')
        button.textContent = 'Create hidden preview'
        button.disabled = true
        subscriptions.push(session.subscribe(snapshot => button.disabled = !snapshot.selection?.variantId || snapshot.runtime.status !== 'absent'))
        button.addEventListener('click', () => {
          button.disabled = true
          // User explicitly creates measured runtime. Data panels alone never execute stories.
          void (async () => {
            const hidden = session.createHiddenPreview()
            await hidden.ready
            const state = await session.state.get()
            if (removed) return
            const output = document.createElement('output')
            output.textContent = `Runtime ready; ${Object.keys(state.value).length} state fields`
            container.append(output)
          })().catch(report)
        })
        container.append(button)
      }
    }
    catch (error) {
      await close()
      throw error
    }
  })()
  return { ready, close }
}
