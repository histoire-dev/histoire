import type { Component } from 'vue'
import HstJson from './components/json/HstJson.vue'
import HstNumber from './components/number/HstNumber.vue'
import HstSwitch from './components/switch/HstSwitch.vue'
import HstText from './components/text/HstText.vue'

/** Shared control mapping compiled with vendor Vue or host Vue by each entry. */
export function getControlComponent(type: string | undefined): Component {
  if (type === 'string') return HstText
  if (type === 'number') return HstNumber
  if (type === 'boolean') return HstSwitch
  return HstJson
}

/** Ordinary editable state excludes runtime metadata and empty Vue data. */
export function getControlStateKeys(state: Record<string, unknown>): string[] {
  return Object.keys(state).filter(key => !key.startsWith('_h') && !(key === '$data' && state[key] && typeof state[key] === 'object' && !Object.keys(state[key]).length))
}

/** Replace only automatic-prop override metadata; omitted override resets runtime default. */
export function createPropOverridePatch(state: Record<string, unknown>, index: number, name: string, value: unknown, remove = false) {
  const current = state._hPropState as Record<number, Record<string, unknown>> | undefined
  const component = { ...current?.[index] }
  if (remove) delete component[name]
  else component[name] = value
  return { _hPropState: { ...current, [index]: component } }
}
