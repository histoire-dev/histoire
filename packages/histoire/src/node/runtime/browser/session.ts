import type { Browser, BrowserContext, Frame, Page } from 'playwright'
import type { LaunchPreviewBrowser } from './dependencies.js'
import type { PreviewHostRegistry, PreviewHostTarget } from './preview-host.js'
import { closePreviewBrowser } from './cleanup.js'
import { resolvePreviewBrowser } from './dependencies.js'
import { PreviewError } from './errors.js'
import { CAPTURE_LIMITS } from './limits.js'

/** Browser session options shared by dev screenshots and deployed preview tests. */
export interface PreviewSessionOptions {
  /** Optional peer resolution root. */
  root: string
  /** Dedicated nonce host served by this process. */
  host: PreviewHostRegistry
  /** Internally resolved exact target and appearance. */
  target: PreviewHostTarget
  /** Injectable acquisition used by focused lifecycle tests. */
  launch?: LaunchPreviewBrowser
  /** Whole preview deadline, including browser startup. */
  timeoutMs?: number
  /** Screenshot/inspection fixed style policy; test execution preserves story styles. */
  deterministicCapture?: boolean
  /** Fixed internal observer attaches before navigation; never supplied by MCP callers. */
  observePage?: (page: Page) => void
}

/** Fresh owned browser/context/page; creation itself never launches resources. */
export function createPreviewSession(options: PreviewSessionOptions) {
  let browser: Browser | undefined
  let context: BrowserContext | undefined
  let page: Page | undefined
  let frame: Frame | undefined
  let lease: ReturnType<PreviewHostRegistry['open']> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let signal: AbortSignal | undefined
  let removeAbort: (() => void) | undefined
  let removePageError: (() => void) | undefined
  let closing: Promise<void> | undefined
  let acquiring: Promise<Browser> | undefined
  let closed = false
  let opened = false
  let timedOut = false
  let pageFailed = false
  let until = 0
  /** Reuse one observed cleanup even when cancellation races normal completion. */
  function close() {
    closed = true
    lease?.close()
    removeAbort?.()
    removePageError?.()
    clearTimeout(timer)
    return closing ??= (async () => {
      const owned = browser ?? await acquiring?.catch(() => undefined)
      if (owned) await closePreviewBrowser(owned)
      browser = undefined
      context = undefined
      page = undefined
      frame = undefined
    })()
  }
  /** Remaining budget for every browser API; no independent readiness sleeps. */
  function remaining() {
    if (pageFailed) throw new PreviewError('PREVIEW_NOT_READY', 'Preview page failed', true)
    signal?.throwIfAborted()
    if (closed) throw new PreviewError('CANCELLED', 'Preview session is closed')
    return Math.max(1, until - Date.now())
  }
  /** Check live iframe document, whose WindowProxy survives a reload. */
  async function isDocumentReady(documentId: string): Promise<boolean> {
    remaining()
    return page!.evaluate((expected) => {
      const state = (window as any).__HST_MCP_PREVIEW__
      return !!(state?.active && state.ready && state.documentId === expected && state.currentDocumentId() === expected)
    }, documentId)
  }
  /** Retry only replaced iframe documents while preserving original deadline. */
  async function waitForReady() {
    for (;;) {
      await page!.waitForFunction(({ nonce, epoch, storyId, variantId }) => {
        const state = (window as any).__HST_MCP_PREVIEW__
        const current = state?.active && state.nonce === nonce && state.epoch === epoch && state.storyId === storyId && state.variantId === variantId && state.documentId === state.currentDocumentId()
        if (current && state.propsFailed) throw new Error('Preview props override rejected')
        return current && state.ready
      }, { nonce: lease!.nonce, epoch: options.target.epoch, storyId: options.target.storyId, variantId: options.target.variantId }, { timeout: remaining() })
      const documentId = await page!.evaluate(() => (window as any).__HST_MCP_PREVIEW__.documentId as string)
      frame = page!.frames().find(candidate => candidate.parentFrame() === page!.mainFrame())
      if (!frame) throw new PreviewError('PREVIEW_NOT_READY', 'Preview iframe is unavailable', true)
      try {
        await frame.evaluate(async (capture) => {
          // Fixed internal capture policy; callers cannot inject CSS or scripts.
          if (capture) {
            const style = document.createElement('style')
            style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'
            document.head.appendChild(style)
          }
          await document.fonts.ready
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        }, options.deterministicCapture === true)
      }
      catch (error) {
        if (!await isDocumentReady(documentId)) continue
        throw error
      }
      if (!await isDocumentReady(documentId)) continue
      return { page: page!, frame, nonce: lease!.nonce, documentId }
    }
  }
  return {
    /** Exact owned page for fixed internal automation; never exposed as a tool. */
    get page() { return page },
    /** Exact selected sandbox document, available after readiness. */
    get frame() { return frame },
    /** Captured nonce identity used by deployed test request matching. */
    get nonce() { return lease?.nonce },
    /** Whole-session deadline also owns screenshot and deployed test waits. */
    get timedOut() { return timedOut },
    /** Uncaught page error is distinct from caller cancellation. */
    get pageFailed() { return pageFailed },
    remaining,
    isDocumentReady,
    waitForReady,
    close,
    /** Acquire and await sandbox plus variant readiness, fonts and two frames. */
    async open(externalSignal: AbortSignal) {
      if (closed || opened) throw new PreviewError('CANCELLED', 'Preview session is closed or already opened')
      opened = true
      const deadline = new AbortController()
      signal = AbortSignal.any([externalSignal, deadline.signal])
      until = Date.now() + (options.timeoutMs ?? CAPTURE_LIMITS.previewTimeoutMs)
      timer = setTimeout(() => {
        timedOut = true
        deadline.abort()
      }, remaining())
      try {
        const launch = options.launch ?? await resolvePreviewBrowser(options.root)
        acquiring = launch({ headless: true, timeout: remaining() })
        browser = await acquiring
        /** Abort browser APIs promptly; the lane still awaits confirmed cleanup. */
        const onAbort = () => {
          void close().catch(() => {})
        }
        signal.addEventListener('abort', onAbort, { once: true })
        removeAbort = () => signal?.removeEventListener('abort', onAbort)
        if (signal.aborted) onAbort()
        remaining()
        context = await browser.newContext({ viewport: { width: options.target.width, height: options.target.height }, colorScheme: options.target.colorScheme, deviceScaleFactor: options.target.deviceScaleFactor ?? 1, reducedMotion: 'reduce', ...(options.deterministicCapture ? { timezoneId: 'UTC', locale: 'en-US' } : {}) })
        remaining()
        page = await context.newPage()
        options.observePage?.(page)
        /** Uncaught preview errors fail the owned job without exposing raw stacks. */
        const onPageError = () => {
          pageFailed = true
          deadline.abort()
        }
        page.on('pageerror', onPageError)
        removePageError = () => page?.off('pageerror', onPageError)
        page.setDefaultTimeout(remaining())
        page.setDefaultNavigationTimeout(remaining())
        lease = options.host.open(options.target)
        await page.goto(lease.url, { waitUntil: 'domcontentloaded', timeout: remaining() })
        return await waitForReady()
      }
      catch (error) {
        if (timedOut) throw new PreviewError('TIMEOUT', 'Preview did not become ready within its deadline', true)
        if (externalSignal.aborted) throw new PreviewError('CANCELLED', 'Preview operation cancelled')
        if (pageFailed) throw new PreviewError('PREVIEW_NOT_READY', 'Preview page failed', true)
        if (error instanceof PreviewError) throw error
        throw new PreviewError('PREVIEW_NOT_READY', 'Preview could not become ready', true)
      }
    },
  }
}
