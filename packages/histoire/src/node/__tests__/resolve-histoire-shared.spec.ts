import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.resetAllMocks()
  vi.resetModules()
  vi.doUnmock('node:fs')
  vi.doUnmock('node:module')
})

describe('resolveHistoireSharedEntry', () => {
  it('prefers the built entry when it exists', async () => {
    vi.doMock('node:module', () => ({
      createRequire() {
        return {
          resolve(id: string) {
            if (id === '@histoire/shared/package.json') {
              return '/repo/packages/histoire-shared/package.json'
            }
            throw new Error(`Unexpected resolution: ${id}`)
          },
        }
      },
    }))

    vi.doMock('node:fs', () => ({
      default: {
        existsSync(path: string) {
          return path === '/repo/packages/histoire-shared/dist/index.js'
        },
      },
    }))

    const { resolveHistoireSharedEntry } = await import('../util/resolve-histoire-shared.js')

    expect(resolveHistoireSharedEntry()).toBe('/repo/packages/histoire-shared/dist/index.js')
  })

  it('falls back to the source entry before @histoire/shared has been built', async () => {
    vi.doMock('node:module', () => ({
      createRequire() {
        return {
          resolve(id: string) {
            if (id === '@histoire/shared/package.json') {
              return '/repo/packages/histoire-shared/package.json'
            }
            throw new Error(`Unexpected resolution: ${id}`)
          },
        }
      },
    }))

    vi.doMock('node:fs', () => ({
      default: {
        existsSync(path: string) {
          return path === '/repo/packages/histoire-shared/src/index.ts'
        },
      },
    }))

    const { resolveHistoireSharedEntry } = await import('../util/resolve-histoire-shared.js')

    expect(resolveHistoireSharedEntry()).toBe('/repo/packages/histoire-shared/src/index.ts')
  })
})
