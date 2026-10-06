import { describe, expect, it } from 'vitest'
import { createTailwindBook } from '../../utils/tailwind-browser.js'

describe('automatic Tailwind token books', () => {
  it.each([['dev', 3], ['static', 3], ['dev', 4], ['static', 4]] as const)('renders %s token stories with Tailwind v%i', async (mode, version) => {
    const fixture = await createTailwindBook(version, mode)
    const page = await fixture.browser.newPage({ viewport: { width: 1100, height: 850 } })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('response', (response) => {
      if (response.status() >= 400 && !response.url().endsWith('/favicon.ico') && !(response.status() === 404 && response.url().endsWith('/histoire-embed-origins.json'))) errors.push(`${response.status()} ${response.url()}`)
    })
    try {
      const stories = fixture.catalog.stories
      const story = version === 3 ? stories.find(story => story.id === 'tailwind') : stories.find(story => story.title.includes('main.css'))
      expect(story).toBeTruthy()
      await page.goto(`${fixture.hosts.hostOrigin}/host.html`)
      await page.evaluate(`Promise.race([(async()=>{
        const {createHistoireSession}=await import('/sdk.js');
        window.session=createHistoireSession({url:${JSON.stringify(fixture.bookUrl)}});
        await session.connect();await session.selection.select({storyId:${JSON.stringify(story.id)},variantId:'background-color'});
        window.primary=session.mount(document.querySelector('#mount'),{surface:'preview'});await primary.ready;
        window.controls=session.mount(document.querySelector('#controls'),{surface:'controls'});await controls.ready;
      })(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Token runtime readiness timed out')),15000))])`)
      const runtime = () => page.frames().find(frame => frame.url().includes('__sandbox.html') && new URL(frame.url()).searchParams.get('storyId') === story.id && new URL(frame.url()).searchParams.get('controls') !== 'true')!
      const controls = () => page.frames().find(frame => frame.url().includes('__sandbox.html') && new URL(frame.url()).searchParams.get('controls') === 'true')!
      const name = version === 3 ? 'ac-bg-brand' : 'bg-brand'
      await expect.poll(() => runtime().locator(`[data-tailwind-value="${name}"]`).evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(18, 52, 86)')
      await controls().getByRole('textbox', { name: 'Filter tokens' }).fill('no-match[')
      await expect.poll(() => runtime().getByRole('status').textContent()).toBe('No matching tokens')
      await controls().getByRole('textbox', { name: 'Filter tokens' }).fill('brand')
      await expect.poll(() => runtime().locator(`[data-tailwind-value="${name}"]`).count()).toBe(1)
      const copy = runtime().getByRole('button', { name: 'Copy token name', exact: true }).first()
      // Stub OS clipboard boundaries, covering native API and iframe fallback.
      await runtime().evaluate(`window.copiedTokens=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.copiedTokens.push(text)}});document.execCommand=command=>{if(command==='copy'){window.copiedTokens.push(document.activeElement.value);return true}return false}`)
      await copy.press('Enter')
      await expect.poll(() => runtime().evaluate('window.copiedTokens')).toEqual([name])
      await page.evaluate(`session.selection.select({storyId:${JSON.stringify(story.id)},variantId:'font-size'})`)
      await expect.poll(() => controls().getByRole('textbox', { name: 'Sample text' }).count()).toBe(1)
      await controls().getByRole('textbox', { name: 'Sample text' }).fill('Changed typography sample')
      await expect.poll(() => runtime().locator('[data-tailwind-value$="text-lg"]').textContent()).toBe('Changed typography sample')
      await expect.poll(() => runtime().locator('[data-tailwind-value$="text-lg"]').evaluate(el => getComputedStyle(el).fontSize)).toBe('20px')
      await expect.poll(() => runtime().locator('[data-tailwind-value$="text-lg"]').evaluate(el => getComputedStyle(el).lineHeight)).toBe('30px')
      if (version === 3) {
        await page.evaluate(`session.selection.select({storyId:${JSON.stringify(story.id)},variantId:'font-family'})`)
        await expect.poll(() => runtime().locator('[data-tailwind-value="ac-font-sans"]').evaluate((el) => {
          const computed = getComputedStyle(el)
          return { family: computed.fontFamily, features: computed.fontFeatureSettings, variations: computed.fontVariationSettings }
        })).toEqual({ family: 'Inter, sans-serif', features: '"cv11"', variations: '"wght" 650' })
      }
      if (version === 4) {
        const second = stories.find(story => story.title.includes('admin.css'))!
        await page.evaluate(`(async()=>{const{createHistoireSession}=await import('/sdk.js');window.secondSession=createHistoireSession({url:${JSON.stringify(fixture.bookUrl)}});await secondSession.connect();await secondSession.selection.select({storyId:${JSON.stringify(second.id)},variantId:'background-color'});window.second=secondSession.mount(document.querySelector('#second'),{surface:'preview'});await second.ready})()`)
        const secondFrame = page.frames().find(frame => frame.url().includes('__sandbox.html') && new URL(frame.url()).searchParams.get('storyId') === second.id)!
        expect(await secondFrame.locator('[data-tailwind-value="bg-brand"]').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(171, 205, 239)')
        await page.evaluate(`session.selection.select({storyId:${JSON.stringify(story.id)},variantId:'background-color'})`)
        await page.evaluate(`session.settings.update({colorScheme:'dark'})`)
        await expect.poll(() => runtime().locator('[data-tailwind-value="bg-brand"]').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(101, 67, 33)')
        await page.locator('#mount').evaluate(el => el.style.width = '320px')
        expect(await runtime().evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth')).toBe(true)
        if (mode === 'static') await page.screenshot({ path: '/tmp/histoire-tailwind-v4-static.png' })
      }
      expect(errors).toEqual([])
    }
    catch (error) {
      throw new Error(`${String(error)}; browser errors: ${errors.join('; ')}`)
    }
    finally {
      await page.close()
      await fixture.close()
    }
  })
})
