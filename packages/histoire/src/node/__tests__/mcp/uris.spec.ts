import { describe, expect, it } from 'vitest'
import { decodeMcpCursor, encodeMcpCursor } from '../../mcp/protocol/cursors.js'
import { decodeMcpResourceUri, encodeMcpResourceUri } from '../../mcp/protocol/uris.js'
import { HOSTILE_STORY_ID } from '../utils/preview-runtime-source.js'

const projectId = 'project_test'
const revision = 'b213d53b-4dbe-453f-9868-7ab80758904b:1'

describe('mCP resource URIs', () => {
  it.each([HOSTILE_STORY_ID, '..', '.', 'a/b', 'a ?#%', '日本語', '%2F', '%'])('round-trips exact ID %j', (storyId) => {
    const uri = encodeMcpResourceUri({ projectId, kind: 'docs', storyId, offset: 0, limit: 8192, revision })
    expect(decodeMcpResourceUri(uri, projectId)).toEqual({ projectId, kind: 'docs', storyId, offset: 0, limit: 8192, revision })
  })

  it.each([
    'histoire://foreign/project',
    'histoire://project_test/stories/..',
    'histoire://project_test/stories/%2e%2e',
    'histoire://project_test/stories/%FF',
    'histoire://project_test/stories/%',
    'histoire://project_test/stories/foo/docs?offset=0&offset=1',
    'histoire://project_test/stories/foo/docs?offset=01',
    'histoire://project_test/stories/foo?url=https%3A%2F%2Fevil.com',
    'file:///etc/passwd',
  ])('rejects ambiguous or foreign URI %j', (uri) => {
    expect(() => decodeMcpResourceUri(uri, projectId)).toThrow()
  })

  it('binds pagination cursors to captured project, revision, and filters', () => {
    const cursor = encodeMcpCursor({ projectId, revision, filterHash: 'a'.repeat(64), offset: 50 })
    expect(decodeMcpCursor(cursor, { projectId, revision, filterHash: 'a'.repeat(64) }).offset).toBe(50)
    expect(() => decodeMcpCursor(cursor, { projectId: 'foreign', revision, filterHash: 'a'.repeat(64) })).toThrow()
    expect(() => decodeMcpCursor(`${cursor}=`, { projectId, revision, filterHash: 'a'.repeat(64) })).toThrow()
  })
})
