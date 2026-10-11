import type { Page } from 'playwright'
import { describe, expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'

/** Attach probe to each browser's real private Vite socket. */
async function probe(page: Page, url: string) {
  await page.goto(url)
  await page.getByRole('navigation', { name: 'Workbench' }).waitFor()
  await page.locator('iframe[title="Histoire variant"]').first().contentFrame().getByRole('button').first().waitFor()
  // Preserve native browser imports outside Vitest's SSR transformation.
  await page.evaluate(`(async () => {
    const { createHotContext } = await import(${JSON.stringify(new URL('/book/@vite/client', url).href)})
    const hot = createHotContext('/visual-ownership-probe')
    const replies = []
    hot.on('histoire:ui:visual-result', reply => replies.push(reply))
    Object.assign(window, { visualProbe: { replies, send: request => hot.send('histoire:ui:visual', request) } })
  })()`)
}
/** Submit exact DTO without bypassing channel validation or browser correlation. */
async function send(page: Page, request: object) {
  await page.evaluate(value => (window as any).visualProbe.send(value), request)
}
/** Read only this client's replies from real channel. */
async function replies(page: Page, id: string) {
  return page.evaluate(requestId => (window as any).visualProbe.replies.filter((reply: any) => reply.requestId === requestId), id)
}

describe('visual browser ownership', () => {
  it('reviews and approves large saved props and axes through bounded pages', async () => {
    const fixture = await createEmbedBridgeFixture({ mode: 'dev', embedding: false, config: 'visual:{profiles:[{id:\'small\',width:320,height:240}]},' })
    const page = await fixture.browser.newPage()
    try {
      await probe(page, `${fixture.bookUrl}story/overlap?variantId=main`)
      await send(page, { requestId: 'large-save', action: 'save', case: { storyId: 'overlap', variantId: 'main', label: 'Large case', propsOverride: { text: 'x'.repeat(16300) }, axes: { text: 'x'.repeat(40000) } } })
      await expect.poll(async () => (await replies(page, 'large-save'))[0]?.case?.id).toBeTruthy()
      const caseId = (await replies(page, 'large-save'))[0].case.id
      // Without retained evidence, incremental run captures and announces this comparison.
      await send(page, { requestId: 'large-run', action: 'run', options: { caseId, incremental: true } })
      await expect.poll(async () => (await replies(page, 'large-run')).at(-1)?.run?.state, { timeout: 60_000 }).toBe('completed')
      const runId = (await replies(page, 'large-run')).at(-1).run.id
      await send(page, { requestId: 'large-results', action: 'results', runId })
      await expect.poll(async () => (await replies(page, 'large-results'))[0]?.run?.results?.[0]?.currentHash).toBeTruthy()
      const result = (await replies(page, 'large-results'))[0].run.results[0]
      expect(result.case).toMatchObject({ id: caseId, label: 'Large case' })
      expect(result.case.propsOverride).toBeUndefined()
      expect((await replies(page, 'large-run'))[0].planned).toEqual([result.id])
      await send(page, { requestId: 'large-approve', action: 'approve', options: { runId, resultIds: [result.id] } })
      await expect.poll(async () => (await replies(page, 'large-approve'))[0]?.receipts?.[0]?.status).toBe('approved')
      await send(page, { requestId: 'large-repeat', action: 'run', options: { caseId } })
      await expect.poll(async () => (await replies(page, 'large-repeat')).at(-1)?.run?.state, { timeout: 60_000 }).toBe('completed')
      await send(page, { requestId: 'large-repeat-results', action: 'results', runId: (await replies(page, 'large-repeat')).at(-1).run.id })
      await expect.poll(async () => (await replies(page, 'large-repeat-results'))[0]?.run?.results?.[0]?.status).toBe('passed')
      await send(page, { requestId: 'large-incremental', action: 'run', options: { caseId, incremental: true } })
      await expect.poll(async () => (await replies(page, 'large-incremental')).at(-1)?.run?.state, { timeout: 60_000 }).toBe('completed')
      const incremental = await replies(page, 'large-incremental')
      expect(incremental.some((reply: any) => reply.planned)).toBe(false)
      expect(incremental.at(-1).run).toMatchObject({ total: 0, reused: { total: 1, failing: 0 } })
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })

  it('rejects foreign cancellation/results, drains owner cancellation, and permits fresh run after disconnect', async () => {
    const fixture = await createEmbedBridgeFixture({ mode: 'dev', embedding: false, config: 'visual:{profiles:[{id:\'small\',width:320,height:240}]},' })
    const first = await fixture.browser.newPage()
    const second = await fixture.browser.newPage()
    try {
      const selectedUrl = `${fixture.bookUrl}story/overlap?variantId=main`
      await probe(first, selectedUrl)
      await probe(second, selectedUrl)
      await send(first, { requestId: 'owner-run', action: 'run' })
      await expect.poll(async () => (await replies(first, 'owner-run'))[0]?.run?.id).toBeTruthy()
      const runId = (await replies(first, 'owner-run'))[0].run.id
      await send(second, { requestId: 'owner-run', action: 'run' })
      await expect.poll(async () => (await replies(second, 'owner-run'))[0]?.error).toBe('Visual request identity already in use')
      await send(second, { requestId: 'foreign-cancel', action: 'cancel', runId })
      await send(second, { requestId: 'foreign-results', action: 'results', runId })
      await expect.poll(async () => (await replies(second, 'foreign-cancel'))[0]?.error).toBe('Visual run unavailable for this browser')
      await expect.poll(async () => (await replies(second, 'foreign-results'))[0]?.error).toBe('Visual run unavailable for this browser')
      expect(await replies(first, 'foreign-cancel')).toEqual([])
      await send(first, { requestId: 'owner-cancel', action: 'cancel', runId })
      await expect.poll(async () => (await replies(first, 'owner-run')).at(-1)?.run?.state, { timeout: 40_000 }).toBe('cancelled')
      await first.close()
      await send(second, { requestId: 'fresh-run', action: 'run' })
      await expect.poll(async () => (await replies(second, 'fresh-run')).at(-1)?.run?.state, { timeout: 60_000 }).toBe('completed')
      const fresh = (await replies(second, 'fresh-run')).at(-1).run
      await send(second, { requestId: 'fresh-results', action: 'results', runId: fresh.id })
      await expect.poll(async () => (await replies(second, 'fresh-results'))[0]?.run?.results?.[0]?.currentHash).toMatch(/^[a-f0-9]{64}$/)
    }
    finally {
      await first.close()
      await second.close()
      await fixture.close()
    }
  })
})
