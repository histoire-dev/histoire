import { describe, expect, it, vi } from 'vitest'
import { resolveMockImporter } from '../util/mock-importer.js'

describe('browser mock importer identity', () => {
  it('removes browser origin/base and uses exact loaded Vite module id', async () => {
    const getModuleByUrl = vi.fn(async () => ({ id: '/project/Preview.story.vue?t=123' }))
    const server = { config: { root: '/project', base: '/book/' }, moduleGraph: { getModuleByUrl } } as any
    await expect(resolveMockImporter(server, 'http://localhost:6006/book/Preview.story.vue?t=123')).resolves.toBe('/project/Preview.story.vue?t=123')
    expect(getModuleByUrl).toHaveBeenCalledWith('/Preview.story.vue?t=123')
  })

  it('preserves filesystem importers and strips base on unresolved browser URLs', async () => {
    const getModuleByUrl = vi.fn(async () => undefined)
    const server = { config: { root: '/project', base: '/book/' }, moduleGraph: { getModuleByUrl } } as any
    await expect(resolveMockImporter(server, '/project/Preview.story.vue')).resolves.toBe('/project/Preview.story.vue')
    expect(getModuleByUrl).not.toHaveBeenCalled()
    await expect(resolveMockImporter(server, '/book/Preview.story.vue')).resolves.toBe('/Preview.story.vue')
    await expect(resolveMockImporter(server, undefined)).resolves.toBeUndefined()
  })
})
