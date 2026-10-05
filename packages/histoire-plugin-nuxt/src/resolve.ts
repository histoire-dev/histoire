import type { Plugin } from 'vite'

/**
 * Nuxt caches package-export conditions by environment name inside its resolver.
 * Histoire's collecting and browser servers both have a Vite client environment,
 * but collecting Vue files can require Node conditions. Separate only Nuxt's
 * cache key; nested Vite resolutions retain their real owning environment.
 */
export function isolateNuxtResolver(plugin: Plugin): Plugin {
  const hook = plugin.resolveId
  if (plugin.name !== 'nuxt:resolve-bare-imports' || !hook) return plugin
  const original = typeof hook === 'function' ? hook : hook.handler
  /** Preserve plugin context and hook metadata without mutating shared Nuxt plugin instance. */
  function resolveId(this: any, ...args: any[]) {
    if (!this.meta.histoire?.isCollecting || !this.environment) return original.apply(this, args as any)
    const environment = new Proxy(this.environment, { get(target, key) {
      return key === 'name' ? `histoire-collect:${target.name}` : Reflect.get(target, key, target)
    } })
    const context = new Proxy(this, { get(target, key) {
      if (key === 'environment') return environment
      const value = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    } })
    return original.apply(context, args as any)
  }
  return { ...plugin, resolveId: typeof hook === 'function' ? resolveId : { ...hook, handler: resolveId } }
}
