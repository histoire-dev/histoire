import type { BigIntStats } from 'node:fs'
import { Buffer } from 'node:buffer'
import { constants } from 'node:fs'
import { open, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, sep, win32 } from 'node:path'
import { MCP_LIMITS } from '../protocol/limits.js'
import { hashContent } from './content-hash.js'

/** Physical files are bounded before allocation or parsing. */
export const MAX_CONTENT_BYTES = MCP_LIMITS.sourceBytes

/** Signals a retryable snapshot race rather than accepting changed bytes. */
export class CatalogContentChangedError extends Error {}

/** Reader failure with a safe public category and no filesystem error cause. */
export class RegisteredContentError extends Error {
  /** Distinguishes root escapes from invalid, unavailable, or oversized text. */
  readonly code: 'PATH_OUTSIDE_ROOT' | 'SOURCE_UNAVAILABLE'

  /** Creates a deliberately safe message, excluding any untrusted path. */
  constructor(code: RegisteredContentError['code'], message: string) {
    super(message)
    this.code = code
  }
}

/** Identity captured from an already verified opened file. */
export interface ContentIdentity {
  /** Device/inode, size and content-relevant timestamps. */
  key: string
  /** Canonical contained path; never serialized publicly. */
  absolutePath: string
}

/** Exact bounded bytes and opened-file identity for freshness checks. */
export interface RegisteredText {
  /** Valid original UTF-8 content. */
  text: string
  /** Hash of full original bytes. */
  sha256: string
  /** Verified file identity. */
  identity: ContentIdentity
}

/** Validates canonical containment without path-prefix vulnerabilities. */
export function isPathWithinRoot(root: string, file: string): boolean {
  const value = relative(root, file)
  return value === '' || (!value.startsWith(`..${sep}`) && value !== '..' && !isAbsolute(value))
}

/** Captures replacement and in-place edit indicators using nanosecond timestamps. */
function identityKey(value: BigIntStats): string {
  return `${value.dev}:${value.ino}:${value.size}:${value.mtimeNs}:${value.ctimeNs}`
}

/** Rejects unbounded or nonregular files before allocating or consuming bytes. */
function requireTextFile(value: BigIntStats): void {
  if (!value.isFile() || value.size > BigInt(MAX_CONTENT_BYTES)) {
    throw new RegisteredContentError('SOURCE_UNAVAILABLE', 'Registered content is not a bounded regular text file')
  }
}

/** Resolves only catalog-registered paths and verifies containment before opening. */
async function resolveRegisteredPath(root: string, file: string): Promise<string> {
  const canonical = await realpath(file)
  if (!isPathWithinRoot(root, canonical)) throw new RegisteredContentError('PATH_OUTSIDE_ROOT', 'Registered content is outside project root')
  return canonical
}

/** Reads a bounded file, verifying identity before consuming any potentially raced bytes. */
async function readStableText(root: string, file: string): Promise<RegisteredText | undefined> {
  const absolutePath = await resolveRegisteredPath(root, file)
  const observed = await stat(absolutePath, { bigint: true })
  requireTextFile(observed)
  // No-follow prevents a final-component symlink swap where supported.
  // Nonblocking avoids hanging if a regular file is replaced with a FIFO.
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)
  const handle = await open(absolutePath, flags)
  try {
    const before = await handle.stat({ bigint: true })
    requireTextFile(before)
    if (identityKey(observed) !== identityKey(before)) return
    if (await resolveRegisteredPath(root, file) !== absolutePath) return
    const buffer = Buffer.alloc(Number(before.size) + 1)
    let bytesRead = 0
    // FileHandle.read may legally return a short read; loop within one fixed
    // allocation. Extra byte detects growth without an unbounded readFile.
    while (bytesRead < buffer.length) {
      const result = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead)
      if (!result.bytesRead) break
      bytesRead += result.bytesRead
    }
    const after = await handle.stat({ bigint: true })
    const currentPath = await resolveRegisteredPath(root, file)
    const current = await stat(currentPath, { bigint: true })
    if (identityKey(before) !== identityKey(after) || identityKey(after) !== identityKey(current) || bytesRead !== Number(before.size) || currentPath !== absolutePath) return
    // Preserve BOM as source data; default TextDecoder behavior strips it.
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, bytesRead))
    if (text.includes('\0')) throw new RegisteredContentError('SOURCE_UNAVAILABLE', 'Registered content is not text')
    return { text, sha256: hashContent(text), identity: { key: identityKey(after), absolutePath } }
  }
  finally { await handle.close() }
}

/** Reads valid UTF-8 from a registered file, retrying one unstable identity. */
export async function readRegisteredText(root: string, file: string): Promise<RegisteredText> {
  if (file.includes('\0')) throw new RegisteredContentError('SOURCE_UNAVAILABLE', 'Registered content path is invalid')
  if (process.platform !== 'win32' && win32.isAbsolute(file) && !isAbsolute(file)) throw new RegisteredContentError('PATH_OUTSIDE_ROOT', 'Registered content is outside project root')
  try {
    const canonicalRoot = await realpath(root)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const captured = await readStableText(canonicalRoot, file)
        if (captured) return captured
      }
      catch (error) {
        // ELOOP is a rejected final symlink race, not permission to follow it.
        if ((error as NodeJS.ErrnoException)?.code === 'ELOOP') continue
        throw error
      }
    }
    throw new CatalogContentChangedError('Registered content changed while reading')
  }
  catch (error) {
    if (error instanceof RegisteredContentError || error instanceof CatalogContentChangedError) throw error
    throw new RegisteredContentError('SOURCE_UNAVAILABLE', 'Registered content cannot be read as bounded UTF-8 text')
  }
}
