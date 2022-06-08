import { unref, isRef } from 'vue'

const isObject = (val) => val !== null && typeof val === 'object'

export function toRawDeep (val, seen = new Set()) {
  const unwrappedValue = isRef(val) ? unref(val) : val

  if (typeof unwrappedValue === 'symbol') {
    return unwrappedValue.toString()
  }

  if (seen.has(unwrappedValue)) {
    return Array.isArray(unwrappedValue) ? [] : {}
  }

  seen.add(unwrappedValue)

  if (!isObject(unwrappedValue)) {
    return unwrappedValue
  }

  if (Array.isArray(unwrappedValue)) {
    return unwrappedValue.map(value => toRawDeep(value, seen))
  }

  return toRawObject(unwrappedValue, seen)
}

const toRawObject = (obj: Record<any, any>, seen = new Set()) => Object.keys(obj).reduce((raw, key) => {
  raw[key] = toRawDeep(obj[key], seen)
  return raw
}, {})
