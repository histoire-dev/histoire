import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { mcpToolInputSchemas } from '../../mcp/protocol/tool-schema.js'

describe('published MCP tool input schemas', () => {
  it('converts every input to JSON Schema, including bounded preview globals', () => {
    for (const schema of Object.values(mcpToolInputSchemas)) {
      expect(() => z.toJSONSchema(schema, { io: 'input' })).not.toThrow()
    }
    const schema = z.toJSONSchema(mcpToolInputSchemas.histoire_capture_screenshot, { io: 'input' })
    expect(schema.properties?.globals).toMatchObject({ type: 'object' })
  })
})
