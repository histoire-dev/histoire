import type { McpStory } from '../protocol/story-schema.js'
import { encodeMcpResourceUri } from '../protocol/uris.js'

/** Attach finite canonical content references to one allowlisted story DTO. */
export function createStoryResult(value: { projectId: string, revision: string, story: McpStory }) {
  const address = { projectId: value.projectId, storyId: value.story.id, revision: value.revision }
  return {
    ...value,
    resources: {
      story: encodeMcpResourceUri({ ...address, kind: 'story' }),
      ...(value.story.docsAvailable ? { docs: encodeMcpResourceUri({ ...address, kind: 'docs' }) } : {}),
      ...(value.story.sourceAvailable ? { source: encodeMcpResourceUri({ ...address, kind: 'source' }) } : {}),
    },
  }
}
