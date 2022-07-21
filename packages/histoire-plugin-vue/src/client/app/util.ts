import { unref, isRef, watch } from 'vue'
import {
  unref as _unref,
  isRef as _isRef,
  watch as _watch,
} from '@histoire/vendors/dist/client/vue'
import { applyState } from '@histoire/shared'

const isObject = (val) => val !== null && typeof val === 'object'

/**
 * Using external/user Vue
 */
export function toRawDeep (val, seen = new Map()) {
  const unwrappedValue = isRef(val) ? unref(val) : val

  if (typeof unwrappedValue === 'symbol') {
    return unwrappedValue.toString()
  }

  if (!isObject(unwrappedValue)) {
    return unwrappedValue
  }

  if (seen.has(unwrappedValue)) {
    return seen.get(unwrappedValue)
  }

  let result

  if (Array.isArray(unwrappedValue)) {
    result = unwrappedValue.map(value => toRawDeep(value, seen))
  } else {
    result = toRawObject(unwrappedValue, seen)
  }

  seen.set(unwrappedValue, result)

  return result
}

const toRawObject = (obj: Record<any, any>, seen = new Map()) => Object.keys(obj).reduce((raw, key) => {
  raw[key] = toRawDeep(obj[key], seen)
  return raw
}, {})

/**
 * Using bundled Vue
 */
export function _toRawDeep (val, seen = new Map()) {
  const unwrappedValue = _isRef(val) ? _unref(val) : val

  if (typeof unwrappedValue === 'symbol') {
    return unwrappedValue.toString()
  }

  if (!isObject(unwrappedValue)) {
    return unwrappedValue
  }

  if (seen.has(unwrappedValue)) {
    return seen.get(unwrappedValue)
  }

  let result

  if (Array.isArray(unwrappedValue)) {
    result = unwrappedValue.map(value => _toRawDeep(value, seen))
  } else {
    result = _toRawObject(unwrappedValue, seen)
  }

  seen.set(unwrappedValue, result)

  return result
}

const _toRawObject = (obj: Record<any, any>, seen = new Map()) => Object.keys(obj).reduce((raw, key) => {
  raw[key] = _toRawDeep(obj[key], seen)
  return raw
}, {})

/**
 * Synchronize states between the bundled and external/user versions of Vue
 * @param bundledState Reactive state created with the bundled Vue
 * @param externalState Reactive state created with the external/user Vue
 */
export function syncStateBundledAndExternal (bundledState, externalState) {
  let syncing = false

  const _stop = _watch(() => bundledState, value => {
    if (!syncing && value != null) {
      syncing = true
      applyState(externalState, _toRawDeep(value))
      syncing = false
    }
  }, {
    deep: true,
    immediate: true,
    flush: 'sync',
  })

  const stop = watch(() => externalState, value => {
    if (!syncing && value != null) {
      syncing = true
      applyState(bundledState, toRawDeep(value))
      syncing = false
    }
  }, {
    deep: true,
    immediate: true,
    flush: 'sync',
  })

  return {
    stop () {
      _stop()
      stop()
    },
  }
}
