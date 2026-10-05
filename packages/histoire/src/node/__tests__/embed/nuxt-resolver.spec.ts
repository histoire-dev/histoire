import { describe, expect, it } from 'vitest'
import { isolateNuxtResolver } from '../../../../../histoire-plugin-nuxt/src/resolve.js'

describe('nuxt resolution ownership across collection and client servers', () => {
  it('separates Nuxt environment-condition caches while preserving Vite resolution context', async () => {
    const conditions = new Map<string, string>()
    const plugin = { name: 'nuxt:resolve-bare-imports', async resolveId(this: any) {
      const name = this.environment.name
      if (!conditions.has(name)) conditions.set(name, this.environment.config.resolve.conditions[0])
      await this.resolve('nested')
      return conditions.get(name)
    } }
    const isolated = isolateNuxtResolver(plugin as any)
    const nested: string[] = []
    /** Collecting Vue files can use Node resolution in Vite's client environment. */
    function context(collecting: boolean, condition: string) {
      return {
        meta: { histoire: { isCollecting: collecting } },
        environment: { name: 'client', config: { resolve: { conditions: [condition] } } },
        resolve(this: any) { nested.push(this.environment.name) },
      }
    }
    expect(await (isolated.resolveId as any).call(context(true, 'node'))).toBe('node')
    expect(await (isolated.resolveId as any).call(context(false, 'import'))).toBe('import')
    expect(nested).toEqual(['client', 'client'])
    expect(plugin.resolveId).not.toBe(isolated.resolveId)
    expect(isolateNuxtResolver({ name: 'vite:vue' } as any)).toEqual({ name: 'vite:vue' })
  })
})
