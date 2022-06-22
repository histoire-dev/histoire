import type { Variant } from './types'

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

export function applyStateToVariant (variant: Variant, state: any, override = false) {
  if (variant.state) {
    for (const key in state) {
      if (!override && variant.state[key] && !key.startsWith('_h') && typeof variant.state[key] === 'object' && !Array.isArray(variant.state[key])) {
        Object.assign(variant.state[key], state[key])
      } else {
        variant.state[key] = state[key]
      }
    }
  } else {
    variant.state = state
  }
}
