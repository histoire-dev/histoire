import type { UiScreenshotRequest } from '@histoire/shared'
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PreviewError } from '../runtime/browser/errors.js'
import { createExecutionService } from '../runtime/execution-service.js'
import { listScreenshotFiles, readScreenshotFile, saveScreenshotFile } from '../server/ui-channel/files.js'
import { createUiScreenshotService } from '../server/ui-channel/screenshot-service.js'
import { deferred } from './utils/mcp/deferred.js'
import { createPreviewBrowserFixture, PREVIEW_PNG } from './utils/mcp/preview-browser.js'

const roots: string[] = []
/** Reuse project-local screenshot fixtures without invoking a real browser. */
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'histoire-ui-screenshot-'))
  roots.push(root)
  const browser = createPreviewBrowserFixture()
  const execution = createExecutionService()
  const resolve = vi.fn(() => browser.session)
  const service = createUiScreenshotService({ root, execution, resolve })
  return { root, browser, execution, resolve, service }
}
/** Canonical bounded request used by channel behavior checks. */
function request(): UiScreenshotRequest {
  return { requestId: 'capture', targets: [{ storyId: 'story', variantId: 'variant' }, { storyId: 'story', variantId: 'second' }], viewport: { width: 480, height: 320 }, scale: 2, format: 'png', background: '$checkerboard' }
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('ui screenshot lane', () => {
  it('enqueues every target and persists one correlated result with recent inventory', async () => {
    const value = await fixture()
    const enqueue = vi.spyOn(value.execution, 'enqueue')
    const output = await value.service.capture(request(), {})
    expect(enqueue).toHaveBeenCalledTimes(2)
    expect(output).toMatchObject({ requestId: 'capture', files: [{ storyId: 'story', variantId: 'variant' }, { storyId: 'story', variantId: 'second' }] })
    if (!('files' in output)) throw new Error('Capture did not persist files')
    expect(await readFile(join(value.root, output.files[0].path))).toEqual(PREVIEW_PNG)
    expect(await listScreenshotFiles(value.root)).toEqual(expect.arrayContaining(output.files))
    expect(value.resolve).toHaveBeenNthCalledWith(2, request(), request().targets[1])
    await value.service.close()
    await value.execution.close()
  })

  it('captures immutable props for distinct displayed cells sharing one base variant', async () => {
    const value = await fixture()
    const ready = deferred<void>()
    value.browser.page.waitForFunction.mockImplementationOnce(() => ready.promise)
    value.resolve.mockImplementation((_request, target) => ({ ...value.browser.session, target: { ...value.browser.session.target, ...target } }))
    const input = { ...request(), targets: [
      { storyId: 'story', variantId: 'variant', frameKey: 'first-cell', propsOverride: { emphasized: false, nested: { label: 'Captured' } } },
      { storyId: 'story', variantId: 'variant', frameKey: 'second-cell', propsOverride: { emphasized: true, nested: { label: 'Captured' } } },
    ] }
    const capture = value.service.capture(input, {})
    await vi.waitFor(() => expect(value.browser.page.waitForFunction).toHaveBeenCalledOnce())
    input.targets.forEach((target) => {
      target.propsOverride.emphasized = !target.propsOverride.emphasized
      target.propsOverride.nested.label = 'Edited while queued'
    })
    ready.resolve()
    const output = await capture
    expect(value.resolve.mock.calls.map(([, target]) => target.propsOverride)).toEqual([
      { emphasized: false, nested: { label: 'Captured' } },
      { emphasized: true, nested: { label: 'Captured' } },
    ])
    expect(output).toMatchObject({ files: [{ frameKey: 'first-cell' }, { frameKey: 'second-cell' }] })
    expect(JSON.stringify(output)).not.toContain('propsOverride')
    if (!('files' in output)) throw new Error('Capture did not persist cells')
    expect(output.files[0].path).not.toBe(output.files[1].path)
    expect(await listScreenshotFiles(value.root)).toEqual(expect.arrayContaining(output.files))
    await value.service.close()
    await value.execution.close()
  })

  it('cancels exactly browser-owned request while MCP lane work remains alive', async () => {
    const value = await fixture()
    const blocked = deferred<void>()
    value.browser.page.waitForFunction.mockImplementation(() => blocked.promise)
    value.browser.close.mockImplementation(async () => {
      blocked.reject(new Error('closed'))
    })
    const owner = {}
    const capture = value.service.capture(request(), owner)
    await vi.waitFor(() => expect(value.browser.page.waitForFunction).toHaveBeenCalled())
    const mcp = value.execution.enqueue({ principal: 'mcp-client', run: async () => 'MCP result' })
    value.service.cancel('capture', {})
    expect(value.browser.close).not.toHaveBeenCalled()
    value.service.cancel('capture', owner)
    expect(await capture).toMatchObject({ requestId: 'capture', error: { code: 'cancelled' } })
    await expect(mcp.result).resolves.toBe('MCP result')
    await value.service.close()
    await value.execution.close()
  })

  it('retains successful files when another target fails without exposing raw errors', async () => {
    const value = await fixture()
    value.resolve.mockImplementationOnce(() => value.browser.session).mockImplementationOnce(() => {
      throw new Error('/private/path token=secret')
    })
    const output = await value.service.capture(request(), {})
    expect(output).toMatchObject({ files: [{ variantId: 'variant' }], errors: [{ variantId: 'second', error: { code: 'failed' } }] })
    expect(JSON.stringify(output)).not.toContain('secret')
    await value.service.close()
    await value.execution.close()
  })

  it('reports missing Playwright as unavailable with install guidance', async () => {
    const value = await fixture()
    value.browser.launch.mockImplementation(async () => {
      throw new PreviewError('DEPENDENCY_MISSING', 'private dependency resolver failure')
    })
    expect(await value.service.capture(request(), {})).toMatchObject({ error: { code: 'unavailable', message: expect.stringContaining('pnpm exec playwright install chromium') } })
    await value.service.close()
    await value.execution.close()
  })

  it('sanitizes filenames and rejects symlinked screenshot directories', async () => {
    const value = await fixture()
    const file = await saveScreenshotFile(value.root, { storyId: '../story', variantId: '../../variant' }, 'png', PREVIEW_PNG)
    expect(file.path).toMatch(/^\.histoire\/screenshots\/story--variant--[^/]+\.png$/)
    expect((await readScreenshotFile(value.root, file.path.split('/').pop()!))?.bytes).toEqual(PREVIEW_PNG)
    expect(await readScreenshotFile(value.root, '../secret.png')).toBeUndefined()
    const outside = await mkdtemp(join(tmpdir(), 'histoire-outside-'))
    roots.push(outside)
    await rm(join(value.root, '.histoire'), { recursive: true })
    await symlink(outside, join(value.root, '.histoire'))
    await expect(saveScreenshotFile(value.root, { storyId: 'story', variantId: 'variant' }, 'png', PREVIEW_PNG)).rejects.toThrow('symlink')
    await value.service.close()
    await value.execution.close()
  })
})
