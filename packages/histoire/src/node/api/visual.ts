import type { HistoireProjectVisual } from '@histoire/shared'
import type { ProjectServices } from './internal.js'
import { createVisualService } from '../visual/service.js'
import { resolveVisualSource } from '../visual/source.js'

/** Bind public Node operations to current ready development generation only. */
export function createProjectVisual(services: ProjectServices, track: <T>(promise: Promise<T>) => Promise<T>, assertOpen: () => void) {
  const service = createVisualService(() => {
    const source = services.dev?.controller.current
    if (services.preview || services.dev?.handle.status !== 'ready' || !source) {
      throw new Error('Visual testing requires a ready development source; static sources are unsupported')
    }
    return resolveVisualSource(source.context, source.server, services.dev.execution, source.isActive, source.epoch)
  })
  const api: HistoireProjectVisual = {
    listCases() {
      assertOpen()
      return track(service.listCases())
    },
    run(options) {
      assertOpen()
      return track(service.run(options))
    },
    approve(options) {
      assertOpen()
      return track(service.approve(options))
    },
  }
  return { api, close: service.close }
}
