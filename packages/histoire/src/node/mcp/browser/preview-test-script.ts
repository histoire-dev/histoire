import { COLLECT_TESTS, RUN_TESTS, TEST_DEFINITIONS, TEST_RESULT } from '@histoire/shared'
import { MCP_LIMITS } from '../protocol/limits.js'

/** Fixed host operation state; messages retain document and tuple authority. */
interface PreviewTestHostState {
  /** Captured generation and host lease identity. */
  active: boolean
  /** Readiness refers to exactly one sandbox document. */
  ready: boolean
  /** Exact collected story. */
  storyId: string
  /** Exact scoped variant. */
  variantId: string
  /** Host capability, absent from public URLs except nonce host path. */
  nonce: string
  /** Captured project generation. */
  epoch: string
  /** Current sandbox document lifetime. */
  documentId?: string
  /** Safe same-origin document lookup; cross-origin navigation loses authority. */
  currentDocumentId: () => string | undefined
  /** Fixed internal dispatch, installed before navigation. */
  tests?: ReturnType<typeof installPreviewTestHost>
}

/** Internal command accepts identifiers, never caller JavaScript or URLs. */
export interface PreviewTestCommand {
  /** Fixed operation kind. */
  kind: 'collect' | 'run'
  /** Fresh unique correlation ID for this request. */
  id: string
  /** Document that was ready before dispatch. */
  documentId: string
  /** Captured independent authority. */
  nonce: string
  /** Captured generation. */
  epoch: string
  /** Exact selected story. */
  storyId: string
  /** Exact selected variant. */
  variantId: string
}

/** Self-contained function serialized into trusted host, with no module globals. */
export function installPreviewTestHost(frame: HTMLIFrameElement, state: PreviewTestHostState, options: { origin: string, types: readonly string[], resultBytes: number }) {
  const pending = new Map<string, PreviewTestCommand>()
  const results = new Map<string, unknown>()
  const used = new Set<string>()
  /** Check both live document and original tuple before dispatch or settlement. */
  function current(command: PreviewTestCommand) {
    return state.active && state.ready && state.nonce === command.nonce && state.epoch === command.epoch
      && state.storyId === command.storyId && state.variantId === command.variantId
      && state.documentId === command.documentId && state.currentDocumentId() === command.documentId
  }
  window.addEventListener('message', (event) => {
    const data = event.data
    const kind = data?.type === options.types[2] ? 'collect' : data?.type === options.types[3] ? 'run' : undefined
    if (!kind || event.source !== frame.contentWindow || event.origin !== options.origin || data.__histoire !== true) return
    const id = kind === 'collect' ? data.requestId : data.runId
    const command = pending.get(id)
    if (!command || command.kind !== kind || !current(command) || data.documentId !== command.documentId
      || data.mcpNonce !== command.nonce || data.mcpEpoch !== command.epoch
      || data.storyId !== command.storyId || data.variantId !== command.variantId) {
      return
    }
    pending.delete(id)
    const result = kind === 'collect' ? { count: Array.isArray(data.definitions) ? data.definitions.length : undefined, error: data.error } : { summary: data.summary }
    try {
      results.set(id, new TextEncoder().encode(JSON.stringify(result)).byteLength <= options.resultBytes ? result : { oversized: true })
    }
    catch { results.set(id, { malformed: true }) }
  })
  const api = {
    /** Dispatch once; response loss never repeats test side effects. */
    request(command: PreviewTestCommand) {
      if (!current(command) || pending.size || used.has(command.id)) return false
      used.add(command.id)
      pending.set(command.id, command)
      frame.contentWindow!.postMessage({
        __histoire: true,
        type: options.types[command.kind === 'collect' ? 0 : 1],
        ...(command.kind === 'collect' ? { requestId: command.id } : { runId: command.id }),
        variantKey: `${command.storyId}:${command.variantId}`,
        storyId: command.storyId,
        variantId: command.variantId,
        documentId: command.documentId,
        mcpNonce: command.nonce,
        mcpEpoch: command.epoch,
      }, options.origin)
      return true
    },
    /** Poll only completion or lost authority; Playwright owns deadline. */
    settled(command: PreviewTestCommand) { return results.has(command.id) || !current(command) },
    /** Consume one response and discard pending state on failed navigation. */
    take(command: PreviewTestCommand) {
      const result = current(command) ? results.get(command.id) : undefined
      results.delete(command.id)
      pending.delete(command.id)
      return result
    },
  }
  state.tests = api
  return api
}

/** Fragment references only enclosing fixed bootstrap frame/state/options. */
export function renderPreviewTestScript(): string {
  return `(${installPreviewTestHost.toString()})(frame, state, { origin: options.authority.origin, types: ${JSON.stringify([COLLECT_TESTS, RUN_TESTS, TEST_DEFINITIONS, TEST_RESULT])}, resultBytes: ${MCP_LIMITS.artifactBytes} });`
}
