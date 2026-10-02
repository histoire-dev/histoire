import { ResourceTemplate } from '@modelcontextprotocol/server'

/** Finite discovery metadata; content is read on demand rather than eagerly listed. */
export function createReadResourceTemplates(projectId: string) {
  return [
    { name: 'histoire_story', title: 'Story metadata', mimeType: 'application/json', template: new ResourceTemplate(`histoire://${projectId}/stories/{storyId}{?revision}`, { list: undefined }) },
    { name: 'histoire_docs', title: 'Story documentation', mimeType: 'text/plain', template: new ResourceTemplate(`histoire://${projectId}/stories/{storyId}/docs{?offset,limit,revision}`, { list: undefined }) },
    { name: 'histoire_source', title: 'Story source', mimeType: 'text/plain', template: new ResourceTemplate(`histoire://${projectId}/stories/{storyId}/source{?startLine,lineCount,revision}`, { list: undefined }) },
  ]
}
