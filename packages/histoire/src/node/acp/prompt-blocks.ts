import type { ContentBlock } from '@agentclientprotocol/sdk'
import { Buffer } from 'node:buffer'
import { open, readFile, realpath, stat } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { basename, isAbsolute, relative, resolve } from 'pathe'
import { imageType } from '../comments/attachments.js'

/** Largest image sent inline as base64; bigger ones are linked instead. */
const INLINE_IMAGE_BYTES = 4 * 1024 * 1024
/** Default total of inline image bytes across one prompt. */
const INLINE_TOTAL_BYTES = 12 * 1024 * 1024
/** Leading bytes read to detect an image signature. */
const SNIFF_BYTES = 16

/** One project file referenced by a prompt (attachment, mention or screenshot). */
export interface PromptFile {
  /** Project-relative path. */
  path: string
  /** Display name; defaults to the file name. */
  name?: string
  /** Client-declared media type; never trusted for images. */
  mimeType?: string
  /** Attached to an earlier message of the thread; skipped when the agent session already saw it. */
  earlier?: boolean
}

/** Inputs of one ACP prompt request. */
export interface PromptBlocksInput {
  /** Project root that every file must stay inside. */
  root: string
  /** User request text. */
  text: string
  /** Serialized Histoire context. */
  context: string
  /** Text is a slash command that must lead the prompt. */
  command?: boolean
  /** Referenced project files. */
  files: readonly PromptFile[]
  /** Agent advertised `promptCapabilities.image`. */
  image: boolean
  /** Total inline image bytes allowed across the prompt; defaults to 12MB. */
  inlineBytes?: number
}

/** A project file resolved to its real location. */
interface ResolvedFile {
  /** Real absolute path inside the real root. */
  real: string
  /** File size in bytes. */
  size: number
  /** Image type sniffed from content. */
  image?: string
}

/**
 * Real path of a referenced file when it is a regular file inside the real project root.
 * Symlinks are followed on both sides so a linked folder cannot escape the project.
 * @param realRoot Real project root.
 * @param root Project root as configured.
 * @param file Referenced file.
 */
async function resolveFile(realRoot: string, root: string, file: PromptFile): Promise<ResolvedFile | undefined> {
  const real = await realpath(resolve(root, file.path)).catch(() => undefined)
  if (!real) return undefined
  const inside = relative(realRoot, real)
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) return undefined
  const entry = await stat(real).catch(() => undefined)
  if (!entry?.isFile()) return undefined
  return { real, size: entry.size, image: await sniff(real) }
}

/**
 * Image type from the leading bytes of a file.
 * @param file Absolute path.
 */
async function sniff(file: string): Promise<string | undefined> {
  const handle = await open(file, 'r').catch(() => undefined)
  if (!handle) return undefined
  try {
    const buffer = Buffer.alloc(SNIFF_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, SNIFF_BYTES, 0)
    return imageType(buffer.subarray(0, bytesRead))
  }
  finally { await handle.close() }
}

/**
 * Link to a project file. Image media types are only kept when the content really is an image.
 * @param file Referenced file.
 * @param resolved Real location.
 */
function linkBlock(file: PromptFile, resolved: ResolvedFile): ContentBlock {
  const mimeType = resolved.image ?? (file.mimeType && !file.mimeType.startsWith('image/') ? file.mimeType : undefined)
  return { type: 'resource_link', uri: pathToFileURL(resolved.real).href, name: file.name ?? basename(resolved.real), ...(mimeType ? { mimeType } : {}), size: resolved.size }
}

/**
 * ACP prompt content: text first (a slash command alone, ahead of the context), then one block per distinct referenced file.
 * Real images are inlined for image-capable agents until the total inline budget is spent; everything else is linked.
 * @param input Prompt inputs.
 */
export async function buildPromptBlocks(input: PromptBlocksInput): Promise<ContentBlock[]> {
  const blocks: ContentBlock[] = input.command
    ? [{ type: 'text', text: input.text }, { type: 'text', text: input.context }]
    : [{ type: 'text', text: `${input.context}\n\n${input.text}` }]
  const realRoot = await realpath(input.root).catch(() => resolve(input.root))
  let budget = input.inlineBytes ?? INLINE_TOTAL_BYTES
  const seen = new Set<string>()
  // Sequential so the inline budget is spent in file order.
  for (const file of input.files) {
    const resolved = await resolveFile(realRoot, input.root, file)
    if (!resolved || seen.has(resolved.real)) continue
    seen.add(resolved.real)
    if (input.image && resolved.image && resolved.size <= INLINE_IMAGE_BYTES && resolved.size <= budget) {
      const data = await readFile(resolved.real)
      // Content may change after sniffing; check the bytes actually sent.
      const mimeType = imageType(data)
      if (mimeType && data.byteLength <= budget) {
        budget -= data.byteLength
        blocks.push({ type: 'image', data: data.toString('base64'), mimeType })
        continue
      }
    }
    blocks.push(linkBlock(file, resolved))
  }
  return blocks
}
