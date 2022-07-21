import { unref, isRef } from 'vue'

const isObject = (val) => val !== null && typeof val === 'object'

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
