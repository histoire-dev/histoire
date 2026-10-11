import { Buffer } from 'node:buffer'
import { CAPTURE_LIMITS } from '../runtime/browser/limits.js'
import { readPngDimensions } from '../runtime/browser/png.js'

/** Validate PNG chunk structure and capture limits without decoding pixels. */
export function readVisualPngDimensions(bytes: Uint8Array): { width: number, height: number } {
  const dimensions = readPngDimensions(bytes)
  if (bytes.byteLength > CAPTURE_LIMITS.artifactBytes || dimensions.width > CAPTURE_LIMITS.width * 3 || dimensions.height > CAPTURE_LIMITS.height * 3 || dimensions.width < 1 || dimensions.height < 1) {
    throw new Error('Visual image exceeds capture limits')
  }
  return dimensions
}

/** Decode bounded PNGs before allocating buffers from untrusted dimensions. */
export async function decodeVisualPng(bytes: Uint8Array) {
  readVisualPngDimensions(bytes)
  const { PNG } = await import('pngjs')
  return PNG.sync.read(Buffer.from(bytes))
}

/** Compare actual decoded pixels; encoding changes cannot produce false regressions. */
export async function compareVisualImages(baseline: Uint8Array, current: Uint8Array, policy: { threshold: number, includeAA: boolean, maxDiffPixelRatio: number }) {
  const [expected, actual] = await Promise.all([decodeVisualPng(baseline), decodeVisualPng(current)])
  const dimensions = { baselineDimensions: { width: expected.width, height: expected.height }, currentDimensions: { width: actual.width, height: actual.height } }
  if (expected.width !== actual.width || expected.height !== actual.height) {
    return { status: 'incompatible' as const, ...dimensions }
  }
  const [{ default: pixelmatch }, { PNG }] = await Promise.all([import('pixelmatch'), import('pngjs')])
  const diff = new PNG({ width: actual.width, height: actual.height })
  const diffPixels = pixelmatch(expected.data, actual.data, diff.data, actual.width, actual.height, { threshold: policy.threshold, includeAA: policy.includeAA })
  const diffPixelRatio = diffPixels / (actual.width * actual.height)
  return { status: diffPixelRatio <= policy.maxDiffPixelRatio ? 'passed' as const : 'changed' as const, ...dimensions, diffPixels, diffPixelRatio, diff: PNG.sync.write(diff) }
}

/** Strict identity ignoring PNG encoding: same dimensions and same RGBA bytes, no tolerance. */
export async function visualPixelsIdentical(baseline: Uint8Array, current: Uint8Array): Promise<boolean> {
  if (Buffer.from(baseline).equals(current)) return true
  const [expected, actual] = await Promise.all([decodeVisualPng(baseline), decodeVisualPng(current)])
  return expected.width === actual.width && expected.height === actual.height && expected.data.equals(actual.data)
}
