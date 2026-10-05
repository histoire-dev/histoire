import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { operationFixture } from '../utils/mcp/operations.js'
import { createPreviewPng } from '../utils/mcp/preview-png.js'

describe('scaled screenshot retention', () => {
  it('retains maximum device pixels through polling and principal-owned resources', async () => {
    const { operations } = operationFixture()
    const artifact = createPreviewPng(11520, 6480)
    operations.registerExecutor('screenshot', () => ({ run: () => ({ artifact, result: { storyId: 'story', variantId: 'variant', width: 11520, height: 6480, mimeType: 'image/png', bytes: artifact.length, sha256: createHash('sha256').update(artifact).digest('hex'), artifactUri: '' } }) }))
    const input = { storyId: 'story', variantId: 'variant', requestKey: 'maximum', width: 3840, height: 2160, deviceScaleFactor: 3, textDirection: 'ltr' } as const
    const job = operations.admit('alice', 'screenshot', input)
    await vi.waitFor(() => expect(operations.get('alice', job.operationId).state).toBe('completed'))
    const polled = operations.get('alice', job.operationId)
    expect(polled.result).toMatchObject({ width: 11520, height: 6480 })
    const resource = operations.readResource({ projectId: 'project_test', kind: 'operation', operationId: job.operationId }, `histoire://project_test/operations/${job.operationId}`, 'alice')
    expect(JSON.parse(resource.contents[0].text!).result).toMatchObject({ width: 11520, height: 6480 })
    expect(() => operations.admit('alice', 'screenshot', { ...input, deviceScaleFactor: 2 })).toThrow('different operation parameters')
    await operations.close()
  })

  it('reuses sorted globals while rejecting changed globals under same retry key', async () => {
    const { operations } = operationFixture()
    const artifact = createPreviewPng(1280, 800)
    operations.registerExecutor('screenshot', () => ({ run: () => ({ artifact, result: { storyId: 'story', variantId: 'variant', width: 1280, height: 800, mimeType: 'image/png', bytes: artifact.length, sha256: createHash('sha256').update(artifact).digest('hex'), artifactUri: '' } }) }))
    const input = { storyId: 'story', variantId: 'variant', requestKey: 'globals', globals: { theme: 'contrast', number: 2 } } as any
    const job = operations.admit('alice', 'screenshot', input)
    expect(operations.admit('alice', 'screenshot', { ...input, globals: { number: 2, theme: 'contrast' } }).operationId).toBe(job.operationId)
    expect(() => operations.admit('alice', 'screenshot', { ...input, globals: { theme: 'light' } })).toThrow('different operation parameters')
    await operations.close()
  })
})
