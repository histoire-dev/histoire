import { unref, isRef } from 'vue'
import type { Variant } from '../types'

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

export function clone (data) {
  try {
    return structuredClone(data)
  } catch (e) {
    console.warn(e, `Fallback to JSON cloning`)
    try {
      return JSON.parse(JSON.stringify(data))
    } catch (e) {
      console.error(e)
    }
    return data
  }
}

export function omit (data, keys: string[]) {
  const copy = {}
  for (const key in data) {
    if (!keys.includes(key)) {
      copy[key] = data[key]
    }
  }
  return copy
}

export function applyStateToVariant (variant: Variant, state: any) {
  if (variant.state) {
    for (const key in state) {
      if (variant.state[key] && !key.startsWith('_h') && typeof variant.state[key] === 'object' && !Array.isArray(variant.state[key])) {
        Object.assign(variant.state[key], state[key])
      } else {
        variant.state[key] = state[key]
      }
    }
  } else {
    variant.state = state
  }
}
