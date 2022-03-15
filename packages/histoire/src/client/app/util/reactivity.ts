import { unref, isRef } from 'vue'

const isObject = (val) => val !== null && typeof val === 'object'

export function toRawDeep (val) {
  const unwrappedValue = isRef(val) ? unref(val) : val

  if (!isObject(unwrappedValue)) {
    return unwrappedValue
  }

  if (Array.isArray(unwrappedValue)) {
    return unwrappedValue.map(toRawDeep)
  }

  return toRawObject(unwrappedValue)
}

const toRawObject = (obj: Record<any, any>) => Object.keys(obj).reduce((raw, key) => {
  raw[key] = toRawDeep(obj[key])
  return raw
}, {})
