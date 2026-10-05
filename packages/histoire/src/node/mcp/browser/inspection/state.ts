import type { HistoireJsonValue as JsonValue } from '@histoire/protocol'
import type { PreviewTestCommand } from '../../../runtime/browser/preview-test-script.js'
import type { McpInspectionResult } from '../../protocol/inspection-schema.js'

/** Bounded, detached variant-state shape returned from the trusted preview. */
export type VariantStateProjection = Pick<Extract<McpInspectionResult, { inspection: 'variant' }>, 'state' | 'components' | 'propsAvailable' | 'omittedValues' | 'truncated'>

/** Finite state read uses existing runtime message names and exact ready document. */
export function requestPreviewState(options: Omit<PreviewTestCommand, 'kind'> & { requestType: string, resultType: string, timeoutMs: number }): Promise<VariantStateProjection> {
  return new Promise((resolve, reject) => {
    const state = (window as any).__HST_MCP_PREVIEW__
    const frame = document.querySelector<HTMLIFrameElement>('#histoire-mcp-preview')
    /** WindowProxy survives reload; every dispatch and reply checks document identity. */
    const current = () => state?.active && state.ready && state.nonce === options.nonce && state.epoch === options.epoch && state.storyId === options.storyId && state.variantId === options.variantId && state.documentId === options.documentId && state.currentDocumentId() === options.documentId
    let timer: ReturnType<typeof setTimeout>
    /** Remove listeners before resolving so repeated replies cannot retain owners. */
    function finish(value?: VariantStateProjection, error?: Error): void {
      clearTimeout(timer)
      window.removeEventListener('message', receive)
      if (error) reject(error)
      else resolve(value!)
    }
    /** Reject foreign frames, replaced documents and unrelated request identifiers. */
    function receive(event: MessageEvent): void {
      const data = event.data
      if (event.source !== frame?.contentWindow || event.origin !== window.location.origin || !data?.__histoire || data.type !== options.resultType || data.requestId !== options.id) return
      if (!current() || data.documentId !== options.documentId || data.storyId !== options.storyId || data.variantId !== options.variantId) {
        finish(undefined, new Error('Inspection document changed'))
        return
      }
      if (data.error || !data.result || typeof data.result !== 'object' || Array.isArray(data.result)) {
        finish(undefined, new Error('Runtime state unavailable'))
        return
      }
      finish(data.result as VariantStateProjection)
    }
    if (!current() || !frame?.contentWindow) {
      finish(undefined, new Error('Inspection document changed'))
      return
    }
    window.addEventListener('message', receive)
    timer = setTimeout(() => finish(undefined, new Error('Runtime inspection timed out')), options.timeoutMs)
    frame.contentWindow.postMessage({ __histoire: true, type: options.requestType, command: 'state.get', inspection: true, payload: null, requestId: options.id, documentId: options.documentId, storyId: options.storyId, variantId: options.variantId, mcpNonce: options.nonce, mcpEpoch: options.epoch }, window.location.origin)
  })
}

/** Convert runtime state to bounded JSON without invoking getters, factories or callbacks. */
export function projectVariantState(input: Record<string, unknown>): VariantStateProjection {
  const ancestors = new WeakSet<object>()
  const omitted = Symbol('histoire-inspection-omitted')
  let omittedValues = 0
  let remaining = 24 * 1024
  let metadataRemaining = 20 * 1024
  let fields = 0
  /** Bound component/prop labels before they become a large cross-frame payload. */
  function retainMetadata(value: string, overhead = 0): boolean {
    const size = new TextEncoder().encode(value).byteLength + overhead
    if (size > metadataRemaining) {
      omittedValues++
      return false
    }
    metadataRemaining -= size
    return true
  }
  /** Access only own data descriptors, including Vue proxy descriptors. */
  function dataValue(value: unknown, name: string): { present: boolean, value?: unknown } {
    if (!value || typeof value !== 'object') return { present: false }
    const descriptor = Object.getOwnPropertyDescriptor(value, name)
    if (!descriptor) return { present: false }
    if (!('value' in descriptor)) {
      omittedValues++
      return { present: true, value: omitted }
    }
    return { present: true, value: unwrapRef(descriptor.value) }
  }
  /** Normalize normal refs while omitting computed refs without reading `.value`. */
  function unwrapRef(value: unknown): unknown {
    if (!value || typeof value !== 'object') return value
    const marker = Object.getOwnPropertyDescriptor(value, '__v_isRef')
    if (!marker || !('value' in marker) || marker.value !== true) return value
    const computed = Object.getOwnPropertyDescriptor(value, 'effect')
    const evaluate = Object.getOwnPropertyDescriptor(value, 'fn')
    if ((computed && 'value' in computed && computed.value === value) || (evaluate && 'value' in evaluate && typeof evaluate.value === 'function')) {
      omittedValues++
      return omitted
    }
    const referenceValue = Object.getOwnPropertyDescriptor(value, '_value')
    if (!referenceValue || !('value' in referenceValue)) {
      omittedValues++
      return omitted
    }
    return referenceValue.value
  }
  /** Keep shared references, omit cycles/opaque values and bound recursive work. */
  function json(value: unknown, depth = 0): JsonValue {
    value = unwrapRef(value)
    if (value === omitted) return null
    if (++fields > 2000 || depth > 10 || remaining <= 0) {
      omittedValues++
      return null
    }
    if (value === null) {
      remaining -= 4
      return null
    }
    if (typeof value === 'boolean') {
      remaining -= 5
      return value
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      remaining -= 24
      return value
    }
    if (typeof value === 'string') {
      const text = value.slice(0, Math.min(4096, Math.max(0, Math.floor(remaining / 6))))
      remaining -= new TextEncoder().encode(JSON.stringify(text)).byteLength
      if (text !== value) omittedValues++
      return text
    }
    if (!value || typeof value !== 'object' || ancestors.has(value)) {
      omittedValues++
      return null
    }
    ancestors.add(value)
    let result: JsonValue
    if (Array.isArray(value)) {
      const items: JsonValue[] = []
      for (let index = 0; index < Math.min(value.length, 100); index++) {
        const item = dataValue(value, String(index))
        items.push(item.value === omitted ? null : json(item.value, depth + 1))
      }
      if (value.length > 100) omittedValues += value.length - 100
      result = items
    }
    else {
      const record: Record<string, JsonValue> = {}
      for (const name of Object.keys(value)) {
        // References to other state objects must not expose runtime-owned metadata.
        if (name.startsWith('_h')) continue
        if (remaining <= 0 || fields > 2000) {
          omittedValues++
          break
        }
        const field = dataValue(value, name)
        if (name.length > 256 || ['__proto__', 'constructor', 'prototype'].includes(name) || !field.present || field.value === omitted) {
          if (field.value !== omitted) omittedValues++
          continue
        }
        remaining -= new TextEncoder().encode(JSON.stringify(name)).byteLength + 1
        record[name] = json(field.value, depth + 1)
      }
      result = record
    }
    ancestors.delete(value)
    return result
  }
  const metadata = dataValue(input, '_hPropDefs')
  const definitions = Array.isArray(metadata.value) ? metadata.value : []
  const propState = dataValue(input, '_hPropState').value
  const components: Extract<McpInspectionResult, { inspection: 'variant' }>['components'] = []
  let metadataExhausted = false
  for (let definitionIndex = 0; definitionIndex < Math.min(definitions.length, 100) && !metadataExhausted; definitionIndex++) {
    const definition = dataValue(definitions, String(definitionIndex)).value
    const name = dataValue(definition, 'name')
    const index = dataValue(definition, 'index')
    const declaredProps = dataValue(definition, 'props')
    const componentName = name.value
    const componentIndex = index.value
    if (componentName === omitted || componentIndex === omitted || declaredProps.value === omitted || typeof componentName !== 'string' || typeof componentIndex !== 'number' || !Number.isInteger(componentIndex) || componentIndex < 0 || !Array.isArray(declaredProps.value)) {
      if (componentName !== omitted && componentIndex !== omitted && declaredProps.value !== omitted) omittedValues++
      continue
    }
    const componentLabel = componentName.slice(0, 256)
    if (componentName.length > 256) omittedValues++
    if (!retainMetadata(componentLabel, 32)) {
      omittedValues += definitions.length - definitionIndex - 1
      break
    }
    const props: typeof components[number]['props'] = []
    for (let propIndex = 0; propIndex < Math.min(declaredProps.value.length, 100) && !metadataExhausted; propIndex++) {
      const item = dataValue(declaredProps.value, String(propIndex)).value
      const propName = dataValue(item, 'name')
      if (propName.value === omitted || typeof propName.value !== 'string' || propName.value.length > 256) {
        if (propName.value !== omitted) omittedValues++
        continue
      }
      if (!retainMetadata(propName.value, 48)) {
        omittedValues += declaredProps.value.length - propIndex - 1
        metadataExhausted = true
        break
      }
      const typeValues = dataValue(item, 'types').value
      const types: string[] = []
      if (Array.isArray(typeValues)) {
        for (let typeIndex = 0; typeIndex < Math.min(typeValues.length, 16); typeIndex++) {
          const type = dataValue(typeValues, String(typeIndex)).value
          if (typeof type !== 'string') {
            omittedValues++
            continue
          }
          if (type.length > 128) omittedValues++
          const typeLabel = type.slice(0, 128)
          if (!retainMetadata(typeLabel, 4)) {
            omittedValues += typeValues.length - typeIndex - 1
            metadataExhausted = true
            break
          }
          types.push(typeLabel)
        }
        if (!metadataExhausted && typeValues.length > 16) omittedValues += typeValues.length - 16
      }
      const overrides = dataValue(propState, String(componentIndex)).value
      const override = dataValue(overrides, propName.value)
      const defaultValue = dataValue(item, 'default')
      const currentValue = dataValue(item, 'value')
      const value = override.present ? override : currentValue
      const enumValues = dataValue(item, 'values').value
      const values: JsonValue[] = []
      if (Array.isArray(enumValues)) {
        for (let valueIndex = 0; valueIndex < Math.min(enumValues.length, 100); valueIndex++) {
          const itemValue = dataValue(enumValues, String(valueIndex)).value
          values.push(itemValue === omitted ? null : json(itemValue))
        }
        if (enumValues.length > 100) omittedValues += enumValues.length - 100
      }
      const required = dataValue(item, 'required').value
      props.push({ name: propName.value, ...(Array.isArray(typeValues) ? { types } : {}), ...(typeof required === 'boolean' ? { required } : {}), ...(defaultValue.present ? { default: defaultValue.value === omitted ? null : json(defaultValue.value) } : {}), ...(value.present ? { value: value.value === omitted ? null : json(value.value) } : {}), ...(Array.isArray(enumValues) ? { values } : {}) })
    }
    if (!metadataExhausted && declaredProps.value.length > 100) omittedValues += declaredProps.value.length - 100
    components.push({ name: componentLabel, index: componentIndex, props })
  }
  if (definitions.length > 100) omittedValues += definitions.length - 100
  const state = json(input) as Record<string, JsonValue>
  const result: VariantStateProjection = { state: state && !Array.isArray(state) ? state : {}, components, propsAvailable: Array.isArray(metadata.value), omittedValues, truncated: omittedValues > 0 }
  /** Keep the message transport below the complete inspection result budget. */
  while (new TextEncoder().encode(JSON.stringify(result)).byteLength > 48 * 1024) {
    result.truncated = true
    result.omittedValues++
    const component = result.components.at(-1)
    if (component?.props.length) {
      component.props.pop()
    }
    else if (component) {
      result.components.pop()
    }
    else {
      const name = Object.keys(result.state).at(-1)
      if (!name) break
      delete result.state[name]
    }
  }
  return result
}
