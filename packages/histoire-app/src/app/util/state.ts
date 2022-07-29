import { unref, isRef } from 'vue'

const isObject = (val) => val !== null && typeof val === 'object'

export function toRawDeep (val, seen = new WeakMap()) {
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

  if (Array.isArray(unwrappedValue)) {
    const result = []
    seen.set(unwrappedValue, result)
    result.push(...unwrappedValue.map(value => toRawDeep(value, seen)))
    return result
  } else {
    const result = {}
    seen.set(unwrappedValue, result)
    toRawObject(unwrappedValue, result, seen)
    return result
  }
}

const toRawObject = (obj: Record<any, any>, target: Record<any, any>, seen = new WeakMap()) => {
  Object.keys(obj).forEach((key) => {
    target[key] = toRawDeep(obj[key], seen)
  })
}
