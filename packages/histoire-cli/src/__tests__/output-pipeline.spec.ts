import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { createLogHistory } from '../terminal/output/history.js'
import { createOutputPipeline } from '../terminal/output/pipeline.js'

/** Collects raw writes of a visible sink. */
function sink() {
  const writes: string[] = []
  return { writes, write: (data: string | Uint8Array) => void writes.push(Buffer.from(data).toString()) }
}

// Boundary: real pipeline and history over fake visible sinks (the only substitute).
// Defects: changed visible output, unsanitized or unbounded retention, lost tails.
describe('output pipeline', () => {
  it('forwards bytes unchanged while retaining sanitized, redacted text per stream', () => {
    const history = createLogHistory()
    const stdout = sink()
    const stderr = sink()
    const pipeline = createOutputPipeline({ history, secrets: ['s3cret-value'], passthrough: { stdout, stderr } })
    pipeline.onOutput({ stream: 'stdout', generation: 'g1', chunk: Buffer.from('\x1B[32mgreen s3cret-value\x1B[0m\npart') })
    pipeline.onOutput({ stream: 'stderr', generation: 'g1', chunk: Buffer.from('oops\n') })
    // Stream end flushes the unterminated tail.
    pipeline.onOutput({ stream: 'stdout', generation: 'g1' })
    expect(stdout.writes.join('')).toBe('\x1B[32mgreen s3cret-value\x1B[0m\npart')
    expect(stderr.writes.join('')).toBe('oops\n')
    expect(history.entries().map(({ source, level, text }) => [source, level, text])).toEqual([
      ['stdout', 'log', 'green [credential]'],
      ['stderr', 'error', 'oops'],
      ['stdout', 'log', 'part'],
    ])
  })

  it('drops a credential prefix left by a cut console or diagnostic text', () => {
    const history = createLogHistory()
    const pipeline = createOutputPipeline({ history, secrets: ['s3cret-value'] })
    pipeline.onLog({ level: 'log', text: 'ok', truncated: 5 })
    pipeline.onLog({ level: 'log', text: `${'a'.repeat(16 * 1024 - 6)}s3cret`, truncated: 10 })
    pipeline.onDiagnostic(`${'b'.repeat(16 * 1024 - 6)}s3cret-value`)
    const texts = history.entries().map(entry => entry.text)
    expect(texts[1]).toBe('a'.repeat(16 * 1024 - 6))
    expect(texts[2]).toBe('b'.repeat(16 * 1024 - 6))
  })

  it('records console and diagnostic text, echoing it on the stream plain mode used before', () => {
    const history = createLogHistory()
    const stdout = sink()
    const stderr = sink()
    const pipeline = createOutputPipeline({ history, passthrough: { stdout, stderr } })
    pipeline.onLog({ level: 'info', text: 'a\nb' })
    pipeline.onLog({ level: 'warn', text: 'careful \x1B[31mred' })
    pipeline.onLog({ level: 'nonsense', text: 'ignored' })
    pipeline.onDiagnostic('proxy notice')
    expect(stdout.writes).toEqual(['a\nb\n'])
    expect(stderr.writes).toEqual(['careful \x1B[31mred\n', 'proxy notice\n'])
    expect(history.entries().map(entry => entry.text)).toEqual(['a\nb', 'careful red', 'proxy notice'])
  })

  it('flushes the old generation tail when a new generation writes', () => {
    const history = createLogHistory()
    const pipeline = createOutputPipeline({ history })
    pipeline.onOutput({ stream: 'stdout', generation: 'old', chunk: Buffer.from('tail') })
    pipeline.onOutput({ stream: 'stdout', generation: 'new', chunk: Buffer.from('fresh\n') })
    expect(history.entries().map(({ text, generation }) => [text, generation])).toEqual([['tail', 'old'], ['fresh', 'new']])
  })
})

describe('log history', () => {
  it('evicts oldest entries by count and bytes, counts omissions and keeps ids increasing across clear', () => {
    const history = createLogHistory({ entries: 3, bytes: 10 })
    const add = (text: string) => history.append({ source: 'stdout', level: 'log', text, truncated: 0 }).id
    expect([add('aaaa'), add('bbbb'), add('cccc')]).toEqual([1, 2, 3])
    expect(history.entries().map(entry => entry.text)).toEqual(['bbbb', 'cccc'])
    expect(history.omitted).toBe(1)
    add('x'.repeat(50))
    expect(history.entries().map(entry => entry.id)).toEqual([4])
    history.clear()
    expect(add('after')).toBe(5)
    expect(history.omitted).toBe(3)
  })
})
