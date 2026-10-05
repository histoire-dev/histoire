import type { ExecutionService } from '../../runtime/execution-service.js'
import type { createDevMcpProject } from '../project/dev-facade.js'
import { McpDomainError } from '../protocol/errors.js'
import { createMcpOperations } from './store.js'

/** Reuse private captured runtime without giving SDK handlers Context/Vite access. */
export function createDevMcpOperations(project: ReturnType<typeof createDevMcpProject>, execution: ExecutionService, ownsExecution = true, clientIdForPrincipal?: (principal: string) => string) {
  return createMcpOperations({
    execution,
    ownsExecution,
    clientIdForPrincipal,
    capture() {
      const value = project.capture()
      const snapshot = value.catalog.current
      if (!snapshot) throw new McpDomainError('PROJECT_STARTING', 'Project catalog is starting', true)
      return {
        projectId: project.projectId,
        epoch: value.handle.epoch,
        revision: snapshot.revision,
        value,
        isActive: value.handle.isActive,
        validate(input) {
          if (value.catalog.updating) throw new McpDomainError('PROJECT_STARTING', 'Project catalog is updating', true)
          const selected = value.catalog.getStory(input.storyId, input.expectedRevision)
          if (input.variantId !== undefined) {
            value.catalog.getTarget(input.storyId, input.variantId, input.expectedRevision)
          }
          else {
            if (selected.story.docsOnly) throw new McpDomainError('VARIANT_NOT_FOUND', 'Documentation story has no executable variants')
            for (const variant of selected.story.variants) value.catalog.getTarget(input.storyId, variant.id, input.expectedRevision)
          }
        },
      }
    },
  })
}
