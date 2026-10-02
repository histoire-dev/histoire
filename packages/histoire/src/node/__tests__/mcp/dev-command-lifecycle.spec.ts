import { beforeEach, describe, expect, it, vi } from 'vitest'
import { devCommand } from '../../commands/dev.js'
import { createProjectRuntimeController } from '../../runtime/controller.js'

vi.mock('../../runtime/controller.js', () => ({ createProjectRuntimeController: vi.fn() }))

describe('dev command shutdown ownership', () => {
  let start: ReturnType<typeof vi.fn>
  let close: ReturnType<typeof vi.fn>
  let unsubscribe: ReturnType<typeof vi.fn>

  beforeEach(() => {
    start = vi.fn(async () => {})
    close = vi.fn(async () => {})
    unsubscribe = vi.fn()
    vi.mocked(createProjectRuntimeController).mockReturnValue({ start, close, subscribe: () => unsubscribe } as any)
  })

  it('removes only owned SIGINT/SIGTERM handlers when closed', async () => {
    const interrupt = process.listeners('SIGINT')
    const terminate = process.listeners('SIGTERM')
    const command = await devCommand({ port: 6006, host: '127.0.0.1', open: false, config: 'histoire.config.ts' })
    expect(process.listeners('SIGINT')).toHaveLength(interrupt.length + 1)
    expect(process.listeners('SIGTERM')).toHaveLength(terminate.length + 1)
    await command.close()
    expect(process.listeners('SIGINT')).toEqual(interrupt)
    expect(process.listeners('SIGTERM')).toEqual(terminate)
    expect(close).toHaveBeenCalledOnce()
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(createProjectRuntimeController).toHaveBeenCalledWith(expect.objectContaining({ port: 6006, host: '127.0.0.1', open: false, config: 'histoire.config.ts' }))
  })

  it('removes command handlers after startup failure', async () => {
    const interrupt = process.listeners('SIGINT')
    const terminate = process.listeners('SIGTERM')
    start.mockRejectedValueOnce(new Error('startup failed'))
    await expect(devCommand({ port: 6006 })).rejects.toThrow('startup failed')
    expect(process.listeners('SIGINT')).toEqual(interrupt)
    expect(process.listeners('SIGTERM')).toEqual(terminate)
    expect(close).toHaveBeenCalledOnce()
  })
})
