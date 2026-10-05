import { useLayoutEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createReactHost } from '../util/root.js'

/** Real root ownership and error monitoring shared by each regression. */
let host: ReturnType<typeof createReactHost>
let target: HTMLDivElement
let errors: unknown[]
let report: ReturnType<typeof vi.fn>

/** Prevent expected browser errors from escaping the focused test harness. */
function onError(event: ErrorEvent) {
  errors.push(event.error)
  event.preventDefault()
}

/** Trigger a real render or layout-effect failure after initial mounting succeeds. */
function createFailureContent(error: Error, stage: 'render' | 'effect' = 'render') {
  /** A normal interaction reaches the requested post-mount failure. */
  return function Content() {
    const [fail, setFail] = useState(false)
    useLayoutEffect(() => {
      if (fail && stage === 'effect') throw error
    }, [fail])
    if (fail && stage === 'render') throw error
    return <button type="button" onClick={() => setFail(true)}>Fail</button>
  }
}

/** A cleanup failure must remain visible without interrupting target removal. */
function createCleanupContent(error: Error) {
  /** Install a real layout-effect cleanup rather than mocking React's callback. */
  return function Content() {
    useLayoutEffect(() => () => {
      throw error
    }, [])
    return <p>Mounted</p>
  }
}

/** Flush a later interaction; React 18 also throws synchronously after reporting. */
function triggerFailure(error: Error) {
  try {
    flushSync(() => target.querySelector('button')!.click())
  }
  catch (thrown) {
    expect(thrown).toBe(error)
  }
}

beforeEach(() => {
  errors = []
  report = vi.fn((error: unknown) => errors.push(error))
  vi.stubGlobal('reportError', report)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  window.addEventListener('error', onError)
  target = document.createElement('div')
  document.body.append(target)
  host = createReactHost(target)
})

afterEach(() => {
  host.destroy()
  target.remove()
  window.removeEventListener('error', onError)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it.each([new Error('initial render failed'), null, 0, undefined])('propagates initial failure %s without an additional global report', (error) => {
  /** Initial failures belong to the synchronous mount caller. */
  function Content(): never {
    throw error
  }
  let propagated = false
  try {
    host.render(Content, { mode: 'render', pending: [], isActive: () => true }, [])
  }
  catch (thrown) {
    propagated = true
    expect(thrown).toBe(error)
  }
  expect(propagated).toBe(true)
  // React 18 may also emit its own development error event before throwing.
  expect(report).not.toHaveBeenCalled()
})

it.each(['render', 'effect'] as const)('reports later %s failures through global error monitoring', async (stage) => {
  const error = new Error(`later ${stage} failed`)
  host.render(createFailureContent(error, stage), { mode: 'render', pending: [], isActive: () => true }, [])
  triggerFailure(error)
  await vi.waitFor(() => expect(errors).toContain(error))
  expect(target.childNodes).toHaveLength(0)
})

it('reports teardown failures while allowing mount ownership cleanup to finish', () => {
  const error = new Error('effect cleanup failed')
  host.render(createCleanupContent(error), { mode: 'render', pending: [], isActive: () => true }, [])
  expect(() => host.destroy()).not.toThrow()
  expect(errors).toContain(error)
  expect(target.childNodes).toHaveLength(0)
})

it('falls back to browser error events when native reportError is unavailable', async () => {
  vi.stubGlobal('reportError', undefined)
  const error = new Error('fallback render failed')
  host.render(createFailureContent(error), { mode: 'render', pending: [], isActive: () => true }, [])
  triggerFailure(error)
  await vi.waitFor(() => expect(errors).toContain(error))
  expect(report).not.toHaveBeenCalled()
})

it('reports in the target window and logs uncancelled fallback errors', () => {
  const error = new Error('uncancelled cleanup failed')
  const frame = document.createElement('iframe')
  document.body.append(frame)
  const owner = frame.contentWindow!
  const frameTarget = owner.document.createElement('div')
  owner.document.body.append(frameTarget)
  const frameHost = createReactHost(frameTarget)
  const observed = vi.fn()
  owner.addEventListener('error', observed)
  try {
    frameHost.render(createCleanupContent(error), { mode: 'render', pending: [], isActive: () => true }, [])
    frameHost.destroy()
    expect(observed).toHaveBeenCalledWith(expect.objectContaining({ error, target: owner }))
    expect(console.error).toHaveBeenCalledWith(error)
  }
  finally {
    frameHost.destroy()
    owner.removeEventListener('error', observed)
    frame.remove()
  }
})
