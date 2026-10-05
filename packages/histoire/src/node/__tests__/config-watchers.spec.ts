import type { RuntimeGeneration } from '../runtime/types.js'
import { EventEmitter } from 'node:events'
import { writeFileSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import chokidar from 'chokidar'
import { join } from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { configFileHash, writeConfig } from '../config/codemod/index.js'
import { resolveConfigFile } from '../config/index.js'
import { captureProjectConfigurationRevision, watchProjectConfiguration } from '../runtime/config-watchers.js'
import { createProjectRuntimeController } from '../runtime/controller.js'
import { configTestProject, disposeConfigProjects } from './utils/config-codemod.js'

afterEach(disposeConfigProjects)

/** Creates a minimal runtime whose close spy proves retirement ownership. */
function runtimeGeneration(root: string, configurationRevision: Awaited<ReturnType<typeof captureProjectConfigurationRevision>>, viteConfigFile?: string): RuntimeGeneration {
  return {
    context: { root } as any,
    server: {} as any,
    ready: Promise.resolve(),
    configurationRevision,
    viteConfigFile,
    close: vi.fn(async () => {}),
    collect: vi.fn(async () => {}),
    onCollection: vi.fn(() => () => {}),
  }
}

describe('project config creation ownership', () => {
  it('reconciles bytes changed during a real chokidar initial scan', async () => {
    const grid = 'export default { ui: { defaultArrange: "grid" } }'
    const list = 'export default { ui: { defaultArrange: "list" } }'
    const { root, file } = await configTestProject(grid)
    const restart = vi.fn()
    const realWatch = chokidar.watch
    const watch = vi.spyOn(chokidar, 'watch').mockImplementation(((...arguments_: Parameters<typeof chokidar.watch>) => {
      const watcher = realWatch(...arguments_)
      // chokidar has begun its real initial scan, but `ready` cannot yet have
      // fired. `ignoreInitial` would otherwise absorb these new bytes.
      writeFileSync(file, list)
      return watcher
    }) as typeof chokidar.watch)
    let cleanup: (() => Promise<void>) | undefined
    try {
      cleanup = await watchProjectConfiguration({ context: { root } } as RuntimeGeneration, {}, restart)
      await vi.waitFor(() => expect(restart).toHaveBeenCalledWith('Histoire'))
      expect(restart).toHaveBeenCalledTimes(1)
    }
    finally {
      await cleanup?.()
      watch.mockRestore()
    }
  })

  it('coalesces repeated notifications while retaining later distinct edits', async () => {
    const { root, file } = await configTestProject('export default {}')
    // Synthetic bursts stay isolated from platform notifications. Real creation
    // coverage below uses chokidar and the same atomic config writer directly.
    const watcher = Object.assign(new EventEmitter(), { close: vi.fn(async () => {}) }) as unknown as ReturnType<typeof chokidar.watch>
    const watch = vi.spyOn(chokidar, 'watch').mockImplementation(() => {
      queueMicrotask(() => watcher.emit('ready'))
      return watcher
    })
    const restart = vi.fn()
    const cleanup = await watchProjectConfiguration({ context: { root } } as RuntimeGeneration, {}, restart)
    try {
      await writeConfig(file, 'export default { ui: { defaultArrange: "list" } }', { root, expectedHash: await configFileHash(file, { root }) })
      // Atomic publication may report both events for exactly the same bytes.
      watcher.emit('add', file)
      watcher.emit('change', file)
      await vi.waitFor(() => expect(restart).toHaveBeenCalledTimes(1))
      await writeConfig(file, 'export default { ui: { defaultArrange: "grid" } }', { root, expectedHash: await configFileHash(file, { root }) })
      watcher.emit('change', file)
      await vi.waitFor(() => expect(restart).toHaveBeenCalledTimes(2))
      await rm(file)
      watcher.emit('unlink', file)
      watcher.emit('unlink', file)
      await vi.waitFor(() => expect(restart).toHaveBeenCalledTimes(3))
      await writeConfig(file, 'export default { ui: { defaultArrange: "grid" } }', { root, expectedHash: undefined })
      watcher.emit('add', file)
      watcher.emit('change', file)
      await vi.waitFor(() => expect(restart).toHaveBeenCalledTimes(4))
    }
    finally {
      await cleanup()
      watch.mockRestore()
    }
    watcher.emit('change', file)
    expect(restart).toHaveBeenCalledTimes(4)
  })

  it.each(['histoire.config.ts', 'histoire.config.js'])('restarts once after first %s creation and detaches on close', async (name) => {
    const { root } = await configTestProject()
    const restart = vi.fn()
    const cleanup = await watchProjectConfiguration({ context: { root } } as RuntimeGeneration, {}, restart)
    try {
      await writeConfig(join(root, name), 'export default { ui: { defaultArrange: "list" } }', { root, expectedHash: undefined })
      await vi.waitFor(() => expect(restart).toHaveBeenCalledTimes(1))
      expect(restart).toHaveBeenCalledWith('Histoire')
    }
    finally { await cleanup() }
    await writeFile(join(root, name), 'export default {}')
    expect(restart).toHaveBeenCalledTimes(1)
  })

  it('retires stale acquisition before publishing ready when config changes before watcher install', async () => {
    const grid = 'export default { ui: { defaultArrange: "grid" } }'
    const list = 'export default { ui: { defaultArrange: "list" } }'
    const { root, file } = await configTestProject(grid)
    const acquired: string[] = []
    const generations: RuntimeGeneration[] = []
    const readyEpochs: string[] = []
    let replaceInitialConfig = true
    const controller = createProjectRuntimeController({
      root,
      async onGeneration() {
        if (!replaceInitialConfig) return
        replaceInitialConfig = false
        await writeFile(file, list)
      },
    }, {
      start: async () => {
        // Mirrors production acquisition: revision is captured before loading
        // config, so an onGeneration write cannot become this run's baseline.
        const configurationRevision = await captureProjectConfigurationRevision(root)
        acquired.push(await readFile(file, 'utf8'))
        const runtime = runtimeGeneration(root, configurationRevision)
        generations.push(runtime)
        return runtime
      },
    })
    const unsubscribe = controller.subscribe((status, handle) => {
      if (status === 'ready') readyEpochs.push(handle!.epoch)
    })
    try {
      const ready = await controller.start()
      expect(acquired).toEqual([grid, list])
      expect(generations[0].close).toHaveBeenCalledTimes(1)
      expect(readyEpochs).toEqual([ready.epoch])
      expect(controller.status).toBe('ready')
    }
    finally {
      unsubscribe()
      await controller.close()
    }
    expect(generations[1].close).toHaveBeenCalledTimes(1)
  })

  it('retires acquisition when Vite config is created before watcher installation', async () => {
    const { root } = await configTestProject('export default {}')
    const viteFile = join(root, 'vite.config.ts')
    const acquired: string[] = []
    const generations: RuntimeGeneration[] = []
    let createViteConfig = true
    const controller = createProjectRuntimeController({
      root,
      async onGeneration() {
        if (!createViteConfig) return
        createViteConfig = false
        await writeFile(viteFile, 'export default { base: "/list/" }')
      },
    }, {
      start: async () => {
        const configurationRevision = await captureProjectConfigurationRevision(root)
        const viteCode = await readFile(viteFile, 'utf8').catch(() => 'absent')
        acquired.push(viteCode)
        const runtime = runtimeGeneration(root, configurationRevision, viteCode === 'absent' ? undefined : viteFile)
        generations.push(runtime)
        return runtime
      },
    })
    try {
      await controller.start()
      expect(acquired).toEqual(['absent', 'export default { base: "/list/" }'])
      expect(generations[0].close).toHaveBeenCalledTimes(1)
      expect(controller.status).toBe('ready')
    }
    finally { await controller.close() }
  })

  it('retires acquired TypeScript config when priority falls to existing JavaScript config', async () => {
    const grid = 'export default { ui: { defaultArrange: "grid" } }'
    const list = 'export default { ui: { defaultArrange: "list" } }'
    const { root, file } = await configTestProject(grid)
    const javascriptFile = join(root, 'histoire.config.js')
    await writeFile(javascriptFile, list)
    const acquired: string[] = []
    const generations: RuntimeGeneration[] = []
    let deleteTypeScript = true
    const controller = createProjectRuntimeController({
      root,
      async onGeneration() {
        if (!deleteTypeScript) return
        deleteTypeScript = false
        await rm(file)
      },
    }, {
      start: async () => {
        const configurationRevision = await captureProjectConfigurationRevision(root)
        acquired.push(await readFile(resolveConfigFile(root)!, 'utf8'))
        const runtime = runtimeGeneration(root, configurationRevision)
        generations.push(runtime)
        return runtime
      },
    })
    try {
      await controller.start()
      expect(acquired).toEqual([grid, list])
      expect(generations[0].close).toHaveBeenCalledTimes(1)
    }
    finally { await controller.close() }
  })

  it('retires JavaScript config when higher-priority TypeScript config is created', async () => {
    const grid = 'export default { ui: { defaultArrange: "grid" } }'
    const list = 'export default { ui: { defaultArrange: "list" } }'
    const { root } = await configTestProject(list, 'histoire.config.js')
    const typescriptFile = join(root, 'histoire.config.ts')
    const acquired: string[] = []
    const generations: RuntimeGeneration[] = []
    let createTypeScript = true
    const controller = createProjectRuntimeController({
      root,
      async onGeneration() {
        if (!createTypeScript) return
        createTypeScript = false
        await writeFile(typescriptFile, grid)
      },
    }, {
      start: async () => {
        const configurationRevision = await captureProjectConfigurationRevision(root)
        acquired.push(await readFile(resolveConfigFile(root)!, 'utf8'))
        const runtime = runtimeGeneration(root, configurationRevision)
        generations.push(runtime)
        return runtime
      },
    })
    try {
      await controller.start()
      expect(acquired).toEqual([list, grid])
      expect(generations[0].close).toHaveBeenCalledTimes(1)
    }
    finally { await controller.close() }
  })

  it('retires inherited JavaScript config when a parent TypeScript config takes priority', async () => {
    const grid = 'export default { ui: { defaultArrange: "grid" } }'
    const list = 'export default { ui: { defaultArrange: "list" } }'
    const { root } = await configTestProject()
    const parent = join(root, 'parent')
    const child = join(parent, 'child')
    const javascriptFile = join(parent, 'histoire.config.js')
    const typescriptFile = join(parent, 'histoire.config.ts')
    await mkdir(child, { recursive: true })
    await writeFile(javascriptFile, list)
    const acquired: string[] = []
    const generations: RuntimeGeneration[] = []
    let createTypeScript = true
    const controller = createProjectRuntimeController({
      root: child,
      async onGeneration() {
        if (!createTypeScript) return
        createTypeScript = false
        await writeFile(typescriptFile, grid)
      },
    }, {
      start: async () => {
        const configurationRevision = await captureProjectConfigurationRevision(child)
        acquired.push(await readFile(resolveConfigFile(child)!, 'utf8'))
        const runtime = runtimeGeneration(child, configurationRevision)
        generations.push(runtime)
        return runtime
      },
    })
    try {
      await controller.start()
      expect(acquired).toEqual([list, grid])
      expect(generations[0].close).toHaveBeenCalledTimes(1)
    }
    finally { await controller.close() }
  })
})
