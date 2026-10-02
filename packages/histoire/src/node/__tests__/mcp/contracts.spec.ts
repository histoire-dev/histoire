import { describe, expect, it } from 'vitest'
import { McpDomainError, toResourceError } from '../../mcp/protocol/errors.js'
import { errorResult, successResult } from '../../mcp/protocol/results.js'
import { mcpToolInputSchemas } from '../../mcp/protocol/tool-schema.js'
import { HOSTILE_STORY_ID } from '../utils/preview-runtime-source.js'

describe('mCP contracts', () => {
  it('preserves exact hostile target IDs and rejects executable extras', () => {
    const input = { storyId: HOSTILE_STORY_ID, variantId: 'same / ? # % é', requestKey: 'request-1' }
    expect(mcpToolInputSchemas.histoire_capture_screenshot.parse(input)).toMatchObject(input)
    for (const extra of [{ url: 'https://example.com' }, { args: ['--watch'] }, { path: '../x' }]) {
      expect(mcpToolInputSchemas.histoire_capture_screenshot.safeParse({ ...input, ...extra }).success).toBe(false)
    }
    for (const pageSize of [Number.NaN, Infinity, 1.5, 0, 101]) {
      expect(mcpToolInputSchemas.histoire_list_stories.safeParse({ pageSize }).success).toBe(false)
    }
    expect(mcpToolInputSchemas.histoire_get_story.safeParse({ storyId: 'é'.repeat(1025) }).success).toBe(false)
  })

  it('emits equivalent structured and JSON success/error content', () => {
    const success = successResult({ storyId: HOSTILE_STORY_ID })
    expect(JSON.parse(success.content[0].text)).toEqual(success.structuredContent)
    const error = errorResult(new McpDomainError('STORY_NOT_FOUND', 'Missing story', false, { storyId: HOSTILE_STORY_ID }))
    expect(error.isError).toBe(true)
    expect(JSON.parse(error.content[0].text)).toEqual(error.structuredContent)
    expect(error.structuredContent.error.code).toBe('STORY_NOT_FOUND')
    expect(toResourceError(new McpDomainError('DOCS_NOT_FOUND', 'Missing docs'), 'histoire://project_test/project').code).toBe(-32602)
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(errorResult(new McpDomainError('INTERNAL_ERROR', 'Invalid details', false, circular)).structuredContent.error.details).toBeUndefined()
  })

  it('bounds result bytes without leaking unexpected exceptions', () => {
    const error = errorResult(new Error('secret absolute /root/private'))
    expect(error.structuredContent.error.message).toBe('Internal Histoire MCP error')
    expect(() => successResult({ text: 'x'.repeat(128 * 1024) })).toThrowError('MCP result exceeds response byte limit')
  })
})
