import type { Context } from '../context.js'
import fs from 'node:fs'

/**
 * Reads raw source for virtual or disk-backed story files.
 */
export function getStorySource(file: Context['storyFiles'][number]) {
  return file.moduleCode ?? (!file.virtual && fs.existsSync(file.path)
    ? fs.readFileSync(file.path, 'utf8')
    : '')
}

/**
 * Detects whether story source directly calls `onTest(...)`.
 */
export function fileHasOnTestCall(file: Context['storyFiles'][number]) {
  return /\bonTest\s*\(/.test(stripNonCodeSegments(getStorySource(file)))
}

/**
 * Detects whether a story file contains Vitest mock calls that require a full
 * iframe reload to recover cleanly after HMR.
 */
export function fileHasVitestMocks(file: Context['storyFiles'][number]) {
  return /\bvi\.(?:mock|doMock|unmock|doUnmock)\s*\(/.test(stripNonCodeSegments(getStorySource(file)))
}

/**
 * Strips comments and quoted literals so source regex checks only inspect code.
 */
function stripNonCodeSegments(source: string) {
  let output = ''
  let index = 0

  while (index < source.length) {
    const char = source[index]
    const next = source[index + 1]

    if (char === '/' && next === '/') {
      index = consumeLineComment(source, index + 2)
      continue
    }

    if (char === '/' && next === '*') {
      const consumed = consumeBlockComment(source, index + 2)
      output += consumed.blank
      index = consumed.index
      continue
    }

    if (char === '\'' || char === '"' || char === '`') {
      const consumed = consumeQuotedLiteral(source, index + 1, char)
      output += consumed.blank
      index = consumed.index
      continue
    }

    output += char
    index++
  }

  return output
}

/**
 * Consumes `//` comment. Newline stays in outer loop.
 */
function consumeLineComment(source: string, start: number) {
  let index = start

  while (index < source.length && source[index] !== '\n') {
    index++
  }

  return index
}

/**
 * Consumes block comment while preserving newline layout.
 */
function consumeBlockComment(source: string, start: number) {
  let blank = '  '
  let index = start

  while (index < source.length) {
    const char = source[index]
    const next = source[index + 1]

    if (char === '*' && next === '/') {
      blank += '  '
      index += 2
      break
    }

    blank += char === '\n' ? '\n' : ' '
    index++
  }

  return {
    blank,
    index,
  }
}

/**
 * Consumes quoted literal while preserving newlines.
 */
function consumeQuotedLiteral(source: string, start: number, quote: '\'' | '"' | '`') {
  let blank = ' '
  let index = start

  while (index < source.length) {
    const char = source[index]

    if (char === '\\') {
      blank += '  '
      index += 2
      continue
    }

    blank += char === '\n' ? '\n' : ' '
    index++

    if (char === quote) {
      break
    }
  }

  return {
    blank,
    index,
  }
}
