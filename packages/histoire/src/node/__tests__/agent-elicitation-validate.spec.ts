import type { UiAgentElicitationField } from '@histoire/shared'
import { describe, expect, it } from 'vitest'
import { validateElicitationContent } from '../../../../histoire-shared/src/agent-elicitation.js'

const fields: UiAgentElicitationField[] = [
  { key: 'name', type: 'text', required: true, minLength: 2, maxLength: 5, pattern: '^[a-z]+$' },
  { key: 'mail', type: 'text', required: false, format: 'email' },
  { key: 'color', type: 'choice', required: true, options: [{ value: 'red', label: 'Red' }, { value: 'blue', label: 'Blue' }] },
  { key: 'tags', type: 'multi-choice', required: false, minItems: 1, maxItems: 2, options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }] },
  { key: 'size', type: 'number', required: false, integer: true, minimum: 1, maximum: 10 },
  { key: 'ok', type: 'boolean', required: true },
]

describe('elicitation content validation', () => {
  it('accepts valid content, drops unknown keys and omits empty optional values', () => {
    expect(validateElicitationContent(fields, { name: 'abc', mail: '', color: 'red', tags: ['a', 'b'], ok: false, extra: 'x' })).toEqual({ content: { name: 'abc', color: 'red', tags: ['a', 'b'], ok: false } })
  })

  it('reports every invalid field', () => {
    const result = validateElicitationContent(fields, { name: 'ABCDEFG', mail: 'nope', color: 'green', tags: ['a', 'b', 'c'], size: 2.5 })
    expect('errors' in result && Object.keys(result.errors).sort()).toEqual(['color', 'mail', 'name', 'ok', 'size', 'tags'])
  })

  it('rejects wrong value types and non-object content', () => {
    expect(validateElicitationContent(fields, null)).toHaveProperty('errors')
    const result = validateElicitationContent(fields, { name: 12, color: 'red', ok: 'yes', tags: 'a' })
    expect('errors' in result && Object.keys(result.errors).sort()).toEqual(['name', 'ok', 'tags'])
  })

  it('ignores an invalid agent pattern instead of throwing', () => {
    expect(validateElicitationContent([{ key: 'v', type: 'text', required: true, pattern: '(' }], { v: 'x' })).toEqual({ content: { v: 'x' } })
  })
})
