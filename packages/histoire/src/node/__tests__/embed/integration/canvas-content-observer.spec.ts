import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { createEmbedBridgeFixture } from '../../utils/embed/bridge-fixture.js'
import { MCP_REPOSITORY_ROOT } from '../../utils/mcp/cli-project.js'

it('measures real flow, fonts/images and viewport feedback, and releases retired documents', async () => {
  const fixture = await createEmbedBridgeFixture({ mode: 'source-dev', embedding: false, story: '<template><Story id="observer"><Variant id="one"><div /></Variant></Story></template>', config: 'routerMode:"hash",vite:{server:{watch:{ignored:["**/packages/histoire*/**"]}}},' })
  const page = await fixture.browser.newPage()
  try {
    await page.goto(fixture.bookUrl)
    const modulePath = join(MCP_REPOSITORY_ROOT, 'packages/histoire-app/src/app/components/canvas/content-measure.ts')
    // Real exported observer runs against a real iframe; no geometry or observer doubles.
    await page.evaluate(`(async()=>{
      const {observeCanvasContentSize}=await import(${JSON.stringify(new URL(`@fs${modulePath}`, fixture.bookUrl).pathname)});
      const iframe=document.createElement('iframe');iframe.style.cssText='width:400px;height:300px;border:0';document.body.append(iframe);
      const doc=iframe.contentDocument;doc.open();doc.write('<html><head><style>body{margin:0}html,body,#app{height:100%}.__histoire-render-story{min-height:100%;overflow:auto}</style></head><body><div id="app"><div data-histoire-runtime-content data-histoire-variant-id="one"><div class="__histoire-render-story"><div id="box" style="box-sizing:content-box;width:120px;height:60px;padding:10px;margin:5px"></div></div></div></div></body></html>');doc.close();
      window.contentProbe={iframe,values:[],active:true};
      contentProbe.stop=observeCanvasContentSize({document:doc,variantId:'one',fallback:{width:400,height:300},isCurrent:()=>contentProbe.active,publish(size){contentProbe.values.push(size);iframe.style.width=size.width+'px';iframe.style.height=size.height+'px'}});
    })()`)
    const last = () => page.evaluate('contentProbe.values.at(-1)')
    await expect.poll(last).toEqual({ width: 150, height: 90 })
    await page.evaluate('contentProbe.iframe.contentDocument.querySelector("#box").style.cssText="width:40px;height:20px"')
    await expect.poll(last).toEqual({ width: 40, height: 20 })
    await page.evaluate(`contentProbe.iframe.contentDocument.querySelector('#box').innerHTML='<div style="position:absolute;width:900px;height:900px"></div>';`)
    await page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    expect(await last()).toEqual({ width: 40, height: 20 })
    await page.evaluate(`contentProbe.iframe.contentDocument.querySelector('.__histoire-render-story').innerHTML='<img id="image" style="display:block">'`)
    await expect.poll(last).toEqual({ width: 1, height: 1 })
    await page.evaluate(`contentProbe.iframe.contentDocument.querySelector('#image').src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"/>')`)
    await expect.poll(last).toEqual({ width: 80, height: 40 })

    await page.evaluate(`contentProbe.iframe.contentDocument.querySelector('.__histoire-render-story').innerHTML='<span id="text" style="font:40px monospace">MMMMMMMMMMMMMMMMMMMMMMMMMMMM</span>'`)
    await expect.poll(async () => (await last()).width).toBeGreaterThan(600)
    const beforeFont = await last()
    const font = await readFile(join(MCP_REPOSITORY_ROOT, 'packages/histoire-app/node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2'))
    await page.evaluate(async (base64: string) => {
      const probe = (window as any).contentProbe
      const doc = probe.iframe.contentDocument
      const face = new doc.defaultView.FontFace('ContentProbe', Uint8Array.from(atob(base64), char => char.charCodeAt(0)))
      doc.fonts.add(face)
      doc.querySelector('#text').style.fontFamily = 'ContentProbe, monospace'
      await face.load()
      await doc.fonts.ready
    }, font.toString('base64'))
    await expect.poll(last).not.toEqual(beforeFont)
    await expect.poll(async () => page.evaluate(`(()=>{const probe=contentProbe;const root=probe.iframe.contentDocument.querySelector('[data-histoire-runtime-content]');return Math.ceil(root.getBoundingClientRect().width)===probe.values.at(-1).width})()`)).toBe(true)

    await page.evaluate(`contentProbe.iframe.contentDocument.querySelector('.__histoire-render-story').innerHTML='<div style="width:20000px;height:20px"></div>'`)
    await expect.poll(last).toEqual({ width: 16384, height: 20 })
    await page.evaluate(`contentProbe.iframe.contentDocument.querySelector('.__histoire-render-story').innerHTML='<div style="width:20px;height:20000px"></div>'`)
    await expect.poll(last).toEqual({ width: 20, height: 16384 })

    await page.evaluate(`contentProbe.iframe.contentDocument.querySelector('.__histoire-render-story').innerHTML='<div style="box-sizing:content-box;width:100vw;height:30px;padding:0 10px"></div>'`)
    await expect.poll(last).toEqual({ width: 400, height: 30 })
    await page.evaluate('new Promise(resolve=>{let frames=0;function next(){if(++frames===12)resolve();else requestAnimationFrame(next)}requestAnimationFrame(next)})')
    expect(await last()).toEqual({ width: 400, height: 30 })
    await page.evaluate(`contentProbe.iframe.contentDocument.querySelector('.__histoire-render-story').innerHTML='<div style="width:70px;height:35px"></div>'`)
    await expect.poll(last).toEqual({ width: 70, height: 35 })

    await page.evaluate(`contentProbe.stop();contentProbe.count=contentProbe.values.length;contentProbe.iframe.contentDocument.querySelector('.__histoire-render-story').innerHTML='<div style="width:300px;height:200px"></div>'`)
    // A subsequent frame confirms actual queued callbacks cannot publish after cleanup.
    await page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    expect(await page.evaluate('contentProbe.values.length')).toBe(await page.evaluate('contentProbe.count'))
    expect(await page.evaluate('contentProbe.iframe.contentDocument.querySelector("[data-histoire-content-sizing]")')).toBeNull()
  }
  finally {
    await page.close()
    await fixture.close()
  }
}, 120_000)
