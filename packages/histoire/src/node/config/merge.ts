import type { Plugin, SupportMatchPattern } from '@histoire/shared'
import { createDefu } from 'defu'
import { mergeConfig as mergeViteConfig } from 'vite'

/**
 * Merges the `build` sub-config, concatenating `excludeFromVendorsChunk`
 * instead of replacing it (plugins contribute their own exclusions).
 */
export const mergeBuildConfig = createDefu((obj: any, key, value) => {
  if (obj[key] && key === 'excludeFromVendorsChunk') {
    obj[key] = [...obj[key], ...value]
    return true
  }
})

/**
 * Merges two Histoire configs.
 *
 * Arrays are replaced by default, except for the keys whose semantics require
 * accumulating: `vite` (composed as functions), `plugins` (deduplicated by
 * name), `setupCode`, `supportMatch` and `build`.
 */
export const mergeConfig = createDefu((obj: any, key, value) => {
  if (obj[key] && key === 'vite') {
    const initialValue = obj[key]

    // Convert to functions
    const initialFn: (...args: any[]) => Promise<any> = typeof initialValue === 'function' ? initialValue : async () => initialValue
    const valueFn: (...args: any[]) => Promise<any> = typeof value === 'function' ? value : async () => value

    obj[key] = async (...args) => {
      // `mergeViteConfig` doesn't accept functions so we need to call them
      const initialResult = await initialFn(...args)
      const valueResult = await valueFn(...args)
      return mergeViteConfig(initialResult, valueResult)
    }

    return true
  }

  if (obj[key] && key === 'plugins') {
    const initialValue = obj[key] as Plugin[]
    const newValue = obj[key] = [...value]
    const nameMap = newValue.reduce((map, plugin) => {
      map[plugin.name] = true
      return map
    }, {})
    for (const plugin of initialValue) {
      if (!nameMap[plugin.name]) {
        newValue.unshift(plugin)
      }
    }
    return true
  }

  if (obj[key] && key === 'setupCode') {
    obj[key] = [...obj[key], ...value]
    return true
  }

  if (obj[key] && key === 'supportMatch') {
    for (const item of value as SupportMatchPattern[]) {
      const existing: SupportMatchPattern = obj[key].find(p => p.id === item.id)
      if (existing) {
        existing.patterns = [...existing.patterns, ...item.patterns]
        existing.pluginIds = [...existing.pluginIds, ...item.pluginIds]
      }
      else {
        obj[key].push(item)
      }
    }
    return true
  }

  if (obj[key] && key === 'build') {
    obj[key] = mergeBuildConfig(obj[key], value)
    return true
  }

  // By default, arrays should be replaced
  if (obj[key] && Array.isArray(obj[key])) {
    obj[key] = value
    return true
  }
})
