import type { BrowserContextOptions } from 'playwright'
import type { LaunchPreviewBrowser } from '../../../mcp/browser/dependencies.js'
import type { PreviewSessionOptions } from '../../../mcp/browser/session.js'
import { vi } from 'vitest'
import { createPreviewHostRegistry } from '../../../mcp/browser/preview-host.js'
import { readPreviewPng } from './preview-png.js'

/** Reuse actual Chromium fixture for screenshot and artifact assertions. */
export const PREVIEW_PNG = readPreviewPng()

/** Controlled session acquisition, preserving actual host lease ownership. */
export function createPreviewBrowserFixture(options: { png?: Uint8Array, wait?: () => Promise<void>, close?: () => Promise<void> } = {}) {
  const host = createPreviewHostRegistry({ base: '/book/' })
  const main = { parentFrame: () => null }
  const frame = { parentFrame: () => main, evaluate: vi.fn(async () => {}) }
  const screenshot = vi.fn(async () => options.png ?? PREVIEW_PNG)
  const listeners = new Map<string, () => void>()
  const page = { on: vi.fn((event, listener) => listeners.set(event, listener)), off: vi.fn(event => listeners.delete(event)), evaluate: vi.fn(async (_callback, expected) => expected ? true : 'document'), setDefaultTimeout: vi.fn(), setDefaultNavigationTimeout: vi.fn(), goto: vi.fn(async () => {}), waitForFunction: vi.fn(options.wait ?? (async () => {})), frames: () => [main, frame], mainFrame: () => main, locator: () => ({ screenshot }) }
  const newPage = vi.fn(async () => page)
  const newContext = vi.fn(async (_options?: BrowserContextOptions) => ({ newPage }))
  const close = vi.fn(options.close ?? (async () => {}))
  const launch = vi.fn(async () => ({ newContext, close }))
  const session: PreviewSessionOptions = { root: '/project', host, launch: launch as unknown as LaunchPreviewBrowser, target: { origin: 'http://localhost:6006', storyId: 'story', variantId: 'variant', epoch: 'epoch', width: 480, height: 320, backgroundColor: 'transparent', textDirection: 'ltr', isActive: () => true } }
  return { host, page, frame, launch, newContext, newPage, screenshot, close, session, fail: () => listeners.get('pageerror')?.() }
}
