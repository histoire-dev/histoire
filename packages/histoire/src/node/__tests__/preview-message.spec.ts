import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isTrustedPreviewFrameMessage } from '../../../../histoire-app/src/app/util/preview-message.js'

describe('isTrustedPreviewFrameMessage', () => {
  const contentWindow = {}
  const frame = { contentWindow }
  const origin = 'https://host.test'

  beforeEach(() => {
    ;(globalThis as any).window = { location: { origin } }
  })

  afterEach(() => {
    delete (globalThis as any).window
  })

  it('accepts a message from the frame and the host origin', () => {
    expect(isTrustedPreviewFrameMessage(
      { source: contentWindow, origin, data: { __histoire: true } },
      frame,
    )).toBe(true)
  })

  it('rejects a message from the frame but another origin', () => {
    // The host components used to check only the source, so a same-source
    // message from a hijacked/other-origin document was trusted.
    expect(isTrustedPreviewFrameMessage(
      { source: contentWindow, origin: 'https://evil.test', data: { __histoire: true } },
      frame,
    )).toBe(false)
  })

  it('rejects a message from another window', () => {
    expect(isTrustedPreviewFrameMessage(
      { source: {}, origin, data: { __histoire: true } },
      frame,
    )).toBe(false)
  })

  it('rejects every message while no frame is mounted', () => {
    // Nothing to compare the source against: trusting the message anyway would
    // accept anything any window posts while the preview is being swapped.
    expect(isTrustedPreviewFrameMessage(
      { source: contentWindow, origin, data: { __histoire: true } },
      null,
    )).toBe(false)
    expect(isTrustedPreviewFrameMessage(
      { source: contentWindow, origin, data: { __histoire: true } },
      { contentWindow: null },
    )).toBe(false)
  })

  it('accepts a message whose event carries no origin', () => {
    // Some environments omit `origin` for same-frame messages; the source check
    // already pins the sender in that case.
    expect(isTrustedPreviewFrameMessage(
      { source: contentWindow, data: { __histoire: true } },
      frame,
    )).toBe(true)
  })

  it('rejects a message with no data at all', () => {
    expect(isTrustedPreviewFrameMessage(
      { source: contentWindow, origin },
      frame,
    )).toBe(false)
  })

  it('keeps requiring the __histoire marker', () => {
    expect(isTrustedPreviewFrameMessage(
      { source: contentWindow, origin, data: { type: 'anything' } },
      frame,
    )).toBe(false)
  })
})
