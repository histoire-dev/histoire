import type { ExecutionService } from '../runtime/execution-service.js'
import type { DevHosting } from '../runtime/hosting/dev.js'
import type { PreviewHosting } from '../runtime/hosting/preview.js'
import type { HistoireProject } from './types.js'

/** Canonical private services retained by project; public observations expose DTOs only. */
export interface ProjectServices {
  /** Explicit canonical project root. */
  root: string
  /** Explicit root-resolved configuration module. */
  configFile?: string
  /** One actual FIFO scheduler for every project adapter. */
  execution: ExecutionService
  /** Independent active development source. */
  dev?: DevHosting
  /** Independent active immutable built source. */
  preview?: PreviewHosting
}

/** Weak identity keeps unsupported first-party service handoff out of public snapshots. */
const projects = new WeakMap<HistoireProject, ProjectServices>()

/** Registers service identity without acquiring external resources. */
export function registerProjectServices(project: HistoireProject, services: ProjectServices): void {
  projects.set(project, services)
}

/** Internal execution/source adapter boundary consumed by later SDK capture integration. */
export function getProjectServices(project: HistoireProject): ProjectServices {
  const services = projects.get(project)
  if (!services) throw new Error('Unknown Histoire project')
  return services
}
