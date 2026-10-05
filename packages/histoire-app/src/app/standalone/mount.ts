import type { HistoireSourceDescriptor } from '@histoire/protocol'
import { HistoireSdkError } from '@histoire/protocol'
import { createHistoireTestsModel } from '@histoire/vue/internal'
import { createApp, nextTick } from 'vue'
import App from '../App.vue'
import { setupPluginApi } from '../plugin.js'
import { histoireConfig } from '../util/config.js'
import { createStandaloneCommands } from './commands.js'
import { installStandaloneDocument } from './document.js'
import { createStandaloneFolders } from './folders.js'
import { createStandaloneNavigation } from './navigation.js'
import { restoreStandalonePreferences } from './preferences.js'
import { createStandaloneSelection } from './selection.js'
import { createStandaloneSession } from './session.js'
import { createStandaloneTests } from './tests.js'
import './style.css'

/** Standalone entry owns its controller and joins resource teardown at explicit caller target. */
export function mountStandaloneApp(options: {
  /** Caller-owned actual mount element. */
  container: HTMLElement
  /** Configured source base, independent of current URL route. */
  url: string
  /** Internal source reader and completed-publication subscription. */
  loadDescriptor: () => Promise<HistoireSourceDescriptor>
  subscribe: (listener: (descriptor: HistoireSourceDescriptor | null) => void) => () => void
}) {
  const window = options.container.ownerDocument.defaultView
  if (!window) throw new HistoireSdkError('BROWSER_REQUIRED', 'Standalone requires browser mount element')
  const core = createStandaloneSession(options)
  const abort = new AbortController()
  const resources: (() => void | Promise<void>)[] = []
  let closing: Promise<void> | undefined
  const ready = Promise.resolve().then(async () => {
    await core.connect()
    abort.signal.throwIfAborted()
    resources.push(await restoreStandalonePreferences(core, window, histoireConfig.theme.storeColorScheme, abort.signal))
    abort.signal.throwIfAborted()
    const selection = createStandaloneSelection(core)
    resources.push(selection.close)
    const navigation = createStandaloneNavigation(selection, { base: new URL(options.url).pathname, mode: histoireConfig.routerMode ?? 'history', error: console.error, dev: __HISTOIRE_DEV__ })
    resources.push(navigation.close)
    const folders = createStandaloneFolders(selection.session, window)
    resources.push(folders.close)
    const commands = createStandaloneCommands(selection.session, navigation.router)
    resources.push(commands.close)
    const tests = createStandaloneTests(selection.session, createHistoireTestsModel(selection.session))
    resources.push(tests.close)
    const document = installStandaloneDocument(selection.session, window.document, () => navigation.router.currentRoute.value.name === 'story', histoireConfig.theme.title)
    resources.push(document.close, navigation.router.afterEach(document.synchronize))
    const app = createApp(App, { session: selection.session, navigation, folders, commands, tests: tests.model, previewBase: options.url, hostWindow: window, onError: console.error })
    let mounted = false
    resources.push(() => {
      if (mounted) app.unmount()
    })
    app.use(navigation.router)
    abort.signal.throwIfAborted()
    app.mount(options.container)
    mounted = true
    resources.push(setupPluginApi(navigation.router) ?? (() => {}))
    await navigation.router.isReady()
    await navigation.synchronize()
    await nextTick()
    abort.signal.throwIfAborted()
    if (import.meta.hot) import.meta.hot.send('histoire:mount', {})
  }).catch(async (error) => {
    if (!abort.signal.aborted) await close()
    throw error
  })
  // Surface startup failures even when legacy bundle callers ignore the handle.
  void ready.catch(error => console.error('Histoire workbench startup failed', error))
  /** Abort startup/pending runtime intent, then unwind every acquired resource in reverse order. */
  function close(): Promise<void> {
    if (closing) return closing
    abort.abort()
    closing = Promise.resolve().then(async () => {
      const errors: unknown[] = []
      // Core disposal interrupts startup without waiting for initial story readiness.
      try {
        await core.dispose()
      }
      catch (error) {
        errors.push(error)
      }
      for (const cleanup of resources.splice(0).reverse()) {
        try {
          await cleanup()
        }
        catch (error) {
          errors.push(error)
        }
      }
      if (errors.length) throw new AggregateError(errors, 'Standalone cleanup failed')
    })
    void closing.catch(() => {})
    return closing
  }
  /** Page exit observes cleanup failures instead of leaking an abandoned Promise. */
  function pagehide() {
    void close().catch(() => {})
  }
  window.addEventListener('pagehide', pagehide, { once: true })
  resources.push(() => window.removeEventListener('pagehide', pagehide))
  return { ready, unmount: close }
}
