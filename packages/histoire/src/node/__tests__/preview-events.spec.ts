import { afterEach, expect, it, vi } from 'vitest'
import { EVENT_SEND } from '../../../../histoire-app/src/app/util/const.js'
import { logEvent } from '../../../../histoire-app/src/app/util/events.js'
import { FAKE_ORIGIN, installFakeWindow } from './utils/fake-window.js'

afterEach(() => vi.unstubAllGlobals())

it('attributes story events to current runtime document without wildcard messaging', async () => {
  const fixture = installFakeWindow({ href: `${FAKE_ORIGIN}/__sandbox.html?documentId=current` })
  vi.stubGlobal('Node', class {})
  vi.stubGlobal('Window', class {})
  fixture.window.__HST_PREVIEW_DOCUMENT_ID__ = 'current'
  try {
    await logEvent('saved', { count: 2 })
    expect(fixture.parentMessages).toEqual([{
      targetOrigin: FAKE_ORIGIN,
      payload: { __histoire: true, type: EVENT_SEND, documentId: 'current', event: { name: 'saved', argument: { count: 2 } } },
    }])
  }
  finally {
    fixture.uninstall()
  }
})
