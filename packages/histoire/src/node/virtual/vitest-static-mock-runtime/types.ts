export interface StaticMockOptions {
  /** Vitest mock mode requested by compiler-inserted mock hints. */
  mock?: 'auto' | 'factory' | 'spy'
}

/** Arguments accepted by Vitest's browser mock queue. */
export type StaticPreviewQueueMockArgs = [rawId: string, importer: string, factoryOrOptions?: unknown]

export interface StaticPreviewMocker {
  /** Pending mock registration tasks tracked by Vitest's browser mocker. */
  queue: Set<Promise<unknown>>
  /** Queues a mock registration in Vitest's browser mocker. */
  queueMock: (...args: StaticPreviewQueueMockArgs) => void
  /** Registered mocks keyed by their browser import URL. */
  registry: { keys: () => IterableIterator<string> }
  /** Imports a module after pending mock registrations have resolved. */
  wrapDynamicImport: <T>(moduleFactory: () => Promise<T>) => Promise<T>
}
