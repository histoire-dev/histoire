import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { parseFailure } from '../../marketplace/jobs/failure.js'
import { createJobOutput } from '../../marketplace/jobs/output.js'

describe('marketplace package output', () => {
  it('redacts credentials split across chunks and strips terminal sequences', () => {
    const lines: string[] = []
    const output = createJobOutput(lines, () => {})
    output.write('\x1B[')
    output.write('32mhttps://user:sec')
    expect(lines).toEqual([])
    output.write('ret@example.com/pkg?token=hid')
    output.write('den\x1B[0m\nwaiting\n')
    expect(lines).toEqual(['https://[credential]@example.com/pkg?token=[credential]', 'waiting'])
  })
  it('bounds retained output by line count and serialized bytes', () => {
    const lines: string[] = []
    const output = createJobOutput(lines, () => {})
    output.write(`${'x'.repeat(10000)}\n${'a\n'.repeat(500)}`)
    expect(lines).toHaveLength(400)
    expect(lines.every(line => line === 'a')).toBe(true)
    output.write(`${'"'.repeat(2000)}\n`.repeat(400))
    expect(Buffer.byteLength(JSON.stringify(lines))).toBeLessThanOrEqual(40000)
  })
  it.each([
    ['ERR_PNPM_PEER_DEP_ISSUES\nunmet peer vite@"^7.0.0": found 6.1.0', 'peer-conflict'],
    ['npm error ERESOLVE unable to resolve dependency tree\nFound: vite@6.1.0', 'peer-conflict'],
    ['npm error E404', 'not-found'],
    ['error ENOTFOUND registry.npmjs.org', 'network'],
  ])('classifies %s', (text, code) => {
    expect(parseFailure(text).code).toBe(code)
  })
})
