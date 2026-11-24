import type { Client } from '@modelcontextprotocol/client'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { expect } from 'vitest'
import { readPngDimensions } from '../../../mcp/browser/screenshot.js'
import { callMcp, waitMcp } from './process.js'

/** Six public reads plus exact raw resource equivalence from an installed runtime. */
export async function probePackageReads(client: Client) {
  const status = await waitMcp(() => callMcp(client, 'histoire_get_project'), value => value.data?.status === 'ready' && !value.data.updating)
  expect(status.ok).toBe(true)
  const list = await callMcp(client, 'histoire_list_stories')
  expect(list.data.items.map((story: any) => story.id)).toContain('test-book')
  const story = await callMcp(client, 'histoire_get_story', { storyId: 'test-book' })
  const docs = await callMcp(client, 'histoire_get_docs', { storyId: 'test-book' })
  const source = await callMcp(client, 'histoire_get_source', { storyId: 'test-book' })
  // A new collection may start after the readiness read; retry only its explicit transient response.
  const preview = await waitMcp(() => callMcp(client, 'histoire_get_preview', { storyId: 'test-book', variantId: 'normal' }), value => value.ok || value.error?.code !== 'PROJECT_STARTING' || value.error?.retryable !== true)
  expect([story, docs, source, preview].every(value => value.ok), JSON.stringify({ story: story.error, docs: docs.error, source: source.error, preview: preview.error })).toBe(true)
  // History routes serve browser document navigation, not arbitrary API Accepts.
  expect((await fetch(preview.data.storyUrl, { headers: { Accept: 'text/html' } })).status).toBe(200)
  expect(source.data.text).toContain('onTest')
  expect((await client.readResource({ uri: story.data.resources.docs })).contents[0]).toMatchObject({ text: docs.data.text })
  expect((await client.readResource({ uri: story.data.resources.source })).contents[0]).toMatchObject({ text: source.data.text })
  return status.data
}

/** Poll one admitted operation; distinguish completed assertions from job failure. */
export async function probePackageJob(client: Client, name: string, requestKey: string) {
  const admitted = await callMcp(client, name, { storyId: 'test-book', variantId: 'normal', requestKey })
  expect(admitted.ok).toBe(true)
  const operation = await waitMcp(() => callMcp(client, 'histoire_get_operation', { operationId: admitted.data.operationId }), value => ['completed', 'failed', 'cancelled'].includes(value.data?.state), 120_000)
  return operation.data
}

/** Installed or copied runtime returns a PNG and passing hook/test summary. */
export async function probePackageBrowserExecution(client: Client, engine: 'project-vitest' | 'built-preview') {
  const requestKey = `package-screenshot-${engine}`
  let screenshot = await probePackageJob(client, 'histoire_capture_screenshot', requestKey)
  const error = screenshot.error
  // A cold Chromium launch can exceed the candidate budget on a busy runner.
  // A new key starts one fresh capture instead of returning the failed operation.
  if (screenshot.state === 'failed' && error?.code === 'TIMEOUT' && error.retryable === true && /^Browser setup exceeded its (?:candidate )?deadline$/.test(error.message)) {
    console.warn(`Retrying packed screenshot (${engine}): ${error.message}`)
    screenshot = await probePackageJob(client, 'histoire_capture_screenshot', `${requestKey}-retry`)
  }
  expect(screenshot, JSON.stringify({ engine, error: screenshot.error })).toMatchObject({ state: 'completed' })
  expect(screenshot.result).toMatchObject({ mimeType: 'image/png', width: 1280, height: 800 })
  const artifact = await client.readResource({ uri: screenshot.result.artifactUri })
  expect(artifact.contents[0]).toMatchObject({ mimeType: 'image/png' })
  const contents = artifact.contents[0]
  if (!('blob' in contents)) throw new Error('Screenshot artifact has no PNG bytes')
  const bytes = Buffer.from(contents.blob, 'base64')
  expect(readPngDimensions(bytes)).toEqual({ width: 1280, height: 800 })
  expect(bytes.byteLength).toBe(screenshot.result.bytes)
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(screenshot.result.sha256)
  const tests = await probePackageJob(client, 'histoire_run_tests', `package-tests-${engine}`)
  expect(tests, JSON.stringify({ engine, error: tests.error })).toMatchObject({ state: 'completed' })
  expect(tests.result.engine).toBe(engine)
  expect(tests.result.summary, JSON.stringify(tests.result.summary.errors)).toMatchObject({ passed: 3, failed: 0, skipped: 1 })
}
