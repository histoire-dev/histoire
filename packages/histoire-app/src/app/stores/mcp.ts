import type { UiMcpCancelResult, UiMcpClientInfo, UiMcpOperationInfo, UiMcpSnapshot } from '@histoire/shared'
import type { InjectionKey } from 'vue'
import { computed, inject, provide, reactive, ref, shallowRef, watch } from 'vue'
import { onUiDisconnect, onUiEvent, sendUiEvent } from '../util/ui-channel.js'
import { followMcpTarget, isMcpOperationActive, isMcpOperationCancellable, mergeMcpOperations } from './mcp-activity.js'

/** Standalone caller owns routing; dev activity never imports legacy global router. */
export type McpNavigate = (target: NonNullable<UiMcpOperationInfo['target']>) => void | Promise<unknown>

/** Creates activity state owned by one standalone mount, shared by pane, canvas and Home. */
export function createMcpStore(navigate?: McpNavigate) {
  const status = ref<UiMcpSnapshot['status']>('unavailable')
  const endpoint = ref<string>()
  const stdio = shallowRef<UiMcpSnapshot['stdio']>()
  const clients = shallowRef<UiMcpClientInfo[]>([])
  const clientNames = new Map<string, string>()
  const operations = shallowRef<UiMcpOperationInfo[]>([])
  const omitted = shallowRef<UiMcpSnapshot['omitted']>()
  const follow = ref(true)
  const now = ref(Date.now())
  const error = ref<string>()
  const cancelling = ref<string[]>([])
  let disconnect: (() => void) | undefined
  let generation = 0
  const running = computed(() => operations.value.filter(isMcpOperationActive))
  const current = computed(() => running.value.find(operation => operation.state === 'running') ?? running.value[0])
  const history = computed(() => operations.value.filter(operation => !isMcpOperationActive(operation)))

  /** A new runtime snapshot replaces stale running calls after restart. */
  function acceptSnapshot(snapshot: UiMcpSnapshot) {
    const previous = operations.value
    status.value = snapshot.status
    endpoint.value = snapshot.endpoint
    stdio.value = snapshot.stdio
    clients.value = snapshot.clients
    // HTTP sessions can disconnect before their queued operation completes.
    // Remember public names only, keeping most recently observed identities.
    for (const client of snapshot.clients) {
      clientNames.delete(client.id)
      clientNames.set(client.id, client.name)
    }
    while (clientNames.size > 100) {
      const oldestId = clientNames.keys().next().value
      if (oldestId !== undefined) clientNames.delete(oldestId)
    }
    operations.value = mergeMcpOperations(snapshot.operations)
    omitted.value = snapshot.omitted
    cancelling.value = cancelling.value.filter(id => operations.value.some(operation => operation.id === id && isMcpOperationActive(operation)))
    const operation = operations.value.find(operation => operation.state === 'running')
    if (snapshot.status === 'enabled' && operation) {
      navigateToTarget(followMcpTarget(previous.find(item => item.id === operation.id), operation, follow.value))
    }
  }

  /** Follow events and fresh snapshots share the same mount ownership guard. */
  function navigateToTarget(target: UiMcpOperationInfo['target']) {
    if (!target || !navigate) return
    const owner = generation
    void Promise.resolve().then(() => {
      if (owner === generation && disconnect && follow.value) return navigate(target)
    }).catch(() => {
      if (owner === generation && disconnect) error.value = 'Could not follow operation target.'
    })
  }

  /** Lifecycle updates preserve history even while Follow is switched off. */
  function acceptOperation(operation: UiMcpOperationInfo) {
    const previous = operations.value.find(item => item.id === operation.id)
    operations.value = mergeMcpOperations(operations.value, operation)
    if (!isMcpOperationActive(operation)) cancelling.value = cancelling.value.filter(id => id !== operation.id)
    navigateToTarget(followMcpTarget(previous, operation, follow.value))
  }

  /** Rejection restores action availability and keeps feedback until next deliberate retry. */
  function acceptCancelResult(result: UiMcpCancelResult) {
    if (!result.error || !cancelling.value.includes(result.operationId)) return
    cancelling.value = cancelling.value.filter(id => id !== result.operationId)
    error.value = result.error.message
  }

  /** Lost channel clears active claims until server supplies its fresh snapshot. */
  function unavailable() {
    generation++
    status.value = 'unavailable'
    endpoint.value = undefined
    stdio.value = undefined
    clients.value = []
    omitted.value = undefined
    operations.value = operations.value.filter(operation => !isMcpOperationActive(operation))
    cancelling.value = []
  }

  /** Subscriptions begin once and are released with their owning standalone mount. */
  function connect() {
    if (disconnect) return close
    const off = [
      onUiEvent('histoire:ui:mcp-snapshot', acceptSnapshot),
      onUiEvent('histoire:ui:mcp-operation', acceptOperation),
      onUiEvent('histoire:ui:mcp-cancel-result', acceptCancelResult),
      onUiDisconnect(unavailable),
      watch(follow, (enabled) => {
        if (enabled && current.value?.state === 'running') navigateToTarget(current.value.target)
      }, { flush: 'sync' }),
    ]
    const clock = setInterval(() => now.value = Date.now(), 10_000)
    disconnect = () => {
      off.forEach(stop => stop())
      clearInterval(clock)
    }
    sendUiEvent('histoire:ui:ready', {})
    return close
  }

  /** Sends exact operation identity and waits for authoritative cancellation event. */
  function cancel(operationId: string) {
    const operation = operations.value.find(operation => operation.id === operationId)
    if (status.value !== 'enabled' || !operation || !isMcpOperationCancellable(operation) || cancelling.value.includes(operationId)) return
    error.value = undefined
    if (sendUiEvent('histoire:ui:mcp-cancel', { operationId }) === false) {
      error.value = 'MCP status unavailable.'
      return
    }
    cancelling.value = [...cancelling.value, operationId]
  }

  /** Closing makes pending async navigation feedback belong to no replacement mount. */
  function close() {
    disconnect?.()
    disconnect = undefined
    unavailable()
    clientNames.clear()
  }

  return reactive({
    status: computed(() => status.value),
    endpoint: computed(() => endpoint.value),
    stdio: computed(() => stdio.value),
    clients: computed(() => clients.value),
    operations: computed(() => operations.value),
    omitted: computed(() => omitted.value),
    running,
    current,
    history,
    follow,
    now: computed(() => now.value),
    error: computed(() => error.value),
    cancelling: computed(() => cancelling.value),
    connect,
    close,
    cancel,
    /** Public client display names avoid exposing internal principals. */
    clientName(clientId: string) { return clients.value.find(client => client.id === clientId)?.name ?? clientNames.get(clientId) ?? 'MCP client' },
  })
}

/** Per-mount activity contract; Vue reactive wrapper unwraps all public refs. */
export type McpStore = ReturnType<typeof createMcpStore>
const mcpStoreKey: InjectionKey<McpStore> = Symbol('histoire-mcp-store')

/** Root dev-only provider shares one store across lazy activity surfaces. */
export function provideMcpStore(store: McpStore): void {
  provide(mcpStoreKey, store)
}

/** Resolves activity only inside explicit dev provider, never globally. */
export function useMcpStore(): McpStore {
  const store = inject(mcpStoreKey)
  if (!store) throw new Error('MCP activity requires standalone dev provider.')
  return store
}
