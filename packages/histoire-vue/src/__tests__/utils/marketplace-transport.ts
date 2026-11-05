import type { VueWrapper } from '@vue/test-utils'
import type { VNodeChild } from 'vue'
import type { createTestWorkbenchHost } from '../../../../histoire/src/node/__tests__/utils/workbench-extensions.js'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { mount } from '@vue/test-utils'
import { vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { provideExtensionHost } from '../../../../histoire-app/src/app/composables/extensions.js'
import { createMarketplaceStore, provideMarketplaceStore } from '../../../../histoire-app/src/app/stores/marketplace.js'
import { createUiSettingsStore } from '../../../../histoire-app/src/app/stores/settings.js'
import { createMarketplaceClient } from '../../../../histoire-app/src/app/util/marketplace-client.js'
import { sourceFixture } from '../../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { createMarketplaceTransport } from '../../../../histoire/src/node/__tests__/utils/marketplace/transport.js'
import { memoryStorage } from '../../../../histoire/src/node/__tests__/utils/settings-storage.js'
import { resizeObserverFixture } from '../fixtures/resize-observer.js'

export { createMarketplaceTransport }

/** Let Vue capture inputs, then cross the catalog's public 150 ms debounce boundary. */
export async function flushCatalog(): Promise<void> {
  await nextTick()
  if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(150)
  else await new Promise(resolve => setTimeout(resolve, 150))
}

/** Isolate browser recovery receipts while retaining storage across fresh store owners. */
export function stubMarketplaceSession(): void {
  vi.stubGlobal('sessionStorage', memoryStorage())
}

/** Last outbound request at one exact external channel boundary. */
export function lastRequest(channel: ReturnType<typeof createMarketplaceTransport>, event: string) {
  const found = channel.sent.filter(item => item.event === `histoire:ui:marketplace-${event}`).at(-1)
  if (!found) throw new Error(`Missing request: ${event}`)
  return found
}

/** Resolve actions by visible or accessible name, independent of presentation. */
export function buttonByName(wrapper: VueWrapper, name: string) {
  const found = wrapper.findAll('button').find(item => item.text().trim() === name || item.attributes('aria-label') === name)
  if (!found) throw new Error(`Missing button: ${name}`)
  return found
}

/** jsdom lacks the native top layer; retain real dialog/store event wiring. */
export function stubDialog(dialog: HTMLDialogElement): HTMLDialogElement {
  dialog.showModal = () => {
    dialog.open = true
  }
  dialog.close = () => {
    dialog.open = false
    dialog.dispatchEvent(new Event('close'))
  }
  return dialog
}

/** Inputs shared by real marketplace component harnesses. */
interface MountMarketplaceOptions {
  /** Actual screen tree; no owned application components are stubbed. */
  render: (store: ReturnType<typeof createMarketplaceStore>) => VNodeChild
  /** Initialize real state before components observe it. */
  setup?: (store: ReturnType<typeof createMarketplaceStore>) => void
  /** Additional real component injection contexts. */
  provide?: () => void
  /** Persistence may span multiple fresh owners. */
  storage?: ReturnType<typeof memoryStorage>
  /** Static books have no socket. */
  offline?: boolean
  /** Exercise development-only settings branches. */
  dev?: boolean
  /** Components needing session controls use the real provider. */
  provider?: boolean
  /** Existing real extension host, owned by its scenario. */
  workbench?: ReturnType<typeof createTestWorkbenchHost>['workbench']
  /** Existing session shared with an extension host. */
  session?: ReturnType<typeof createHistoireSessionWithAdapters>
}

/** Mount a real store/client and optional session; substitute external channel/storage only. */
export function mountMarketplace(options: MountMarketplaceOptions) {
  resizeObserverFixture()
  const channel = createMarketplaceTransport()
  if (options.offline) channel.transport.available = () => false
  const storage = options.storage ?? memoryStorage()
  const settings = createUiSettingsStore({ storage })
  const store = createMarketplaceStore({ client: createMarketplaceClient({ transport: channel.transport }), settings, dev: options.dev })
  const session = options.session ?? (options.provider === false ? undefined : createHistoireSessionWithAdapters({ url: 'https://book.example/' }, sourceFixture().adapters))
  const Host = defineComponent(() => {
    provideMarketplaceStore(store)
    options.provide?.()
    if (options.workbench) provideExtensionHost(options.workbench)
    return () => options.render(store)
  })
  options.setup?.(store)
  const container = document.createElement('div')
  document.body.append(container)
  const wrapper = session
    ? mount(HistoireProvider, { props: { session }, slots: { default: () => h(Host) }, attachTo: container })
    : mount(Host, { attachTo: container })
  for (const dialog of wrapper.findAll<HTMLDialogElement>('dialog')) stubDialog(dialog.element)
  let disposed = false
  /** Release mounted ownership once, including scenarios disposing before their teardown. */
  async function dispose(): Promise<void> {
    if (disposed) return
    disposed = true
    wrapper.unmount()
    container.remove()
    store.dispose()
    await options.workbench?.dispose()
    await session?.dispose()
  }
  return { wrapper, store, settings, storage, channel, dispose }
}
