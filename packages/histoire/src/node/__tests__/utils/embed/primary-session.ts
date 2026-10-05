import type { HistoireSurface, HistoireTarget } from '@histoire/protocol'

/** One consumer-requested mount attempt; never retries or reconnects on caller behalf. */
export async function attemptEmbedPrimary(page: any, url: string, target: HistoireTarget, surface: HistoireSurface, options: {
  /** Keep explicit data-only session already connected by caller fixture. */
  reuseSession?: boolean
} = {}) {
  return page.evaluate(`(async()=>{
    const {createHistoireSession}=await import('/sdk.js');
    ${options.reuseSession ? '' : `window.session=createHistoireSession({url:${JSON.stringify(url)}});await session.connect();`}
    await session.selection.select(${JSON.stringify(target)});
    window.primary=session.mount(document.querySelector('#mount'),{surface:${JSON.stringify(surface)}});
    try{await primary.ready;return null}
    catch(error){return {code:error.code,status:session.getSnapshot().status,stale:session.getSnapshot().stale}}
  })()`)
}
