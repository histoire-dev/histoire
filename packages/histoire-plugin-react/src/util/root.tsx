import type { ComponentType, ReactNode } from 'react'
import type { HstContextValue } from '../components/context.js'
import type { ReactStoryWrapper } from '../helpers.js'
import { withStoryExecution } from '@histoire/shared'
import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { HstContext } from '../components/context.js'

/** Own one React root and make initial render errors visible to Histoire callers. */
export function createReactHost(target: HTMLElement) {
  let rendering = false
  // JavaScript permits throwing null, zero, or undefined; truthiness loses them.
  let failed = false
  let failure: unknown
  const errorWindow = target.ownerDocument.defaultView?.window

  /** Match React's global reporting while preserving the target document's realm. */
  function reportFailure(error: unknown) {
    if (typeof errorWindow?.reportError === 'function') {
      errorWindow.reportError(error)
      return
    }
    if (errorWindow) {
      const event = new errorWindow.ErrorEvent('error', {
        bubbles: true,
        cancelable: true,
        message: typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : String(error),
        error,
      })
      if (!errorWindow.dispatchEvent(event)) return
    }
    console.error(error)
  }

  const app = createRoot(target, {
    /** Initial React 19 errors belong to the mount caller; later errors remain observable. */
    onUncaughtError(error) {
      if (rendering) {
        if (!failed) {
          failed = true
          failure = error
        }
      }
      else {
        reportFailure(error)
      }
    },
  })
  return {
    /** Root exposed to story setup callbacks. */
    app,
    /** Flush synchronous mount while attributing story test registrations. */
    render(component: ComponentType, context: HstContextValue, wrappers: ReactStoryWrapper[]) {
      let tree: ReactNode = createElement(component)
      for (const wrapper of [...wrappers].reverse()) tree = createElement(wrapper, {}, tree)
      failed = false
      failure = undefined
      rendering = true
      try {
        withStoryExecution(() => flushSync(() => app.render(<HstContext.Provider value={context}>{tree}</HstContext.Provider>)), target)
      }
      finally { rendering = false }
      if (failed) throw failure
    },
    /** Report cleanup failures without interrupting the adapter's remaining teardown. */
    destroy() {
      try {
        flushSync(() => app.unmount())
      }
      catch (error) { reportFailure(error) }
    },
  }
}
