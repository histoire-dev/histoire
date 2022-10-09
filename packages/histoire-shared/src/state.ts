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

export function applyState (target: any, state: any) {
  for (const key in state) {
    target[key] = state[key]
  }
}
