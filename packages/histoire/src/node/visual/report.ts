import type { HistoireVisualRunSummary } from '@histoire/shared'
import { withVisualCacheLock } from './cache-lock.js'
import { listVisualFiles, safeVisualRead, safeVisualWrite } from './files.js'

/** Escape author-provided labels in standalone report markup. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[character]!)
}

/** Standalone read-only report never relies on an active development server. */
export function renderVisualReport(run: HistoireVisualRunSummary): string {
  const results = run.results.map((result) => {
    // Slider compares baseline and current pixels, so it needs both images.
    const slider = !!result.images.baseline && !!result.images.current
    return `<article><h2>${escapeHtml(result.case.label)} · ${escapeHtml(result.spec.id)}</h2><p>${escapeHtml(result.status)}${result.approved ? ' · Approved' : ''}${result.diffPixels === undefined ? '' : ` · ${result.diffPixels} pixels (${((result.diffPixelRatio ?? 0) * 100).toFixed(3)}%)`}</p>${result.error ? `<p>${escapeHtml(result.error)}</p>` : ''}${result.warning ? `<p>${escapeHtml(result.warning)}</p>` : ''}<div class="views"><button data-mode="pair">Side by side</button><button data-mode="diff">Diff</button><button data-mode="overlay">Overlay</button>${slider ? '<button data-mode="slider">Slider</button>' : ''}<label>Opacity <input type="range" min="0" max="100" value="50" aria-label="Overlay opacity"></label></div>${slider ? '<p class="slider-caption">Baseline · Current</p>' : ''}<div class="images">${Object.entries(result.images).map(([kind, name]) => `<figure data-kind="${kind}"><figcaption>${kind === 'baseline' ? 'Baseline' : kind === 'current' ? 'Current' : 'Diff'}</figcaption><img src="images/${escapeHtml(name!)}" alt="${escapeHtml(`${kind} — ${result.case.label}`)}"></figure>`).join('')}${slider ? '<div class="split" role="slider" tabindex="0" aria-label="Baseline and current separator" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"></div>' : ''}</div></article>`
  }).join('')
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Histoire visual results</title><style>body{font:14px system-ui;margin:32px;background:#f5f5f6;color:#202125}h1{font-size:24px}h2{font-size:16px}article{background:white;border-radius:12px;padding:20px;margin:20px 0}.views{display:flex;gap:8px;align-items:center}.images{display:flex;gap:20px;overflow:auto}figure{margin:12px 0;min-width:0}figcaption{margin-bottom:8px}img{max-width:100%;height:auto}.images figure[data-kind=diff]{display:none}article[data-mode=diff] figure{display:none}article[data-mode=diff] figure[data-kind=diff]{display:block}article[data-mode=overlay] .images{display:grid}article[data-mode=overlay] figure:not([data-kind=diff]){grid-area:1/1}article[data-mode=overlay] figure[data-kind=current]{opacity:var(--opacity,.5)}article[data-mode=slider] .images{display:grid;position:relative;width:max-content;max-width:100%}article[data-mode=slider] figure{grid-area:1/1;margin:0}article[data-mode=slider] figcaption,article[data-mode=slider] figure[data-kind=diff]{display:none}article[data-mode=slider] figure[data-kind=current]{clip-path:inset(0 0 0 var(--split,50%))}.split,.slider-caption{display:none}article[data-mode=slider] .slider-caption{display:block;margin:12px 0 8px}article[data-mode=slider] .split{display:block;position:absolute;top:0;bottom:0;left:var(--split,50%);width:12px;margin-left:-6px;cursor:ew-resize;touch-action:none}.split::before{content:'';position:absolute;top:0;bottom:0;left:50%;width:1px;background:rgb(32 33 37/45%)}.split::after{content:'';position:absolute;top:50%;left:3px;width:6px;height:16px;margin-top:-8px;border-radius:3px;background:#202125;box-shadow:0 1px 2px rgb(0 0 0/25%)}.split:focus-visible{outline:none}.split:focus-visible::after{outline:2px solid #202125;outline-offset:2px}button{padding:7px 12px;border:1px solid #ddd;border-radius:6px;background:#f5f5f6;cursor:pointer}input{vertical-align:middle}.views label{display:none}article[data-mode=overlay] .views label{display:inline}</style><h1>Visual results</h1><p>${escapeHtml(run.platform)} · ${escapeHtml(run.baselineSource)} ${escapeHtml(run.baselineCommit ?? '')}</p><p>${run.results.filter(result => result.status === 'passed' || result.approved).length}/${run.total} passed · ${escapeHtml(run.state)}</p>${results}<script>document.querySelectorAll('[data-mode]').forEach(button=>{button.addEventListener('click',()=>button.closest('article').dataset.mode=button.dataset.mode)});document.querySelectorAll('input[type=range]').forEach(input=>input.addEventListener('input',()=>input.closest('article').style.setProperty('--opacity',input.value/100)));document.querySelectorAll('.split').forEach(split=>{const images=split.parentElement;const set=value=>{value=Math.min(100,Math.max(0,value));images.style.setProperty('--split',value+'%');split.setAttribute('aria-valuenow',Math.round(value))};const place=event=>{const rect=images.getBoundingClientRect();set((event.clientX-rect.left)/rect.width*100)};split.addEventListener('pointerdown',event=>{split.setPointerCapture(event.pointerId);place(event);event.preventDefault()});split.addEventListener('pointermove',event=>{if(split.hasPointerCapture(event.pointerId))place(event)});split.addEventListener('keydown',event=>{const value=Number(split.getAttribute('aria-valuenow'));const step=event.shiftKey?10:1;const next={ArrowLeft:value-step,ArrowRight:value+step,Home:0,End:100}[event.key];if(next!==undefined){event.preventDefault();set(next)}})});</script></html>`
}

/** Persist detached JSON and offline image review after completion or cancellation. */
export async function writeVisualReport(root: string, run: HistoireVisualRunSummary): Promise<void> {
  return withVisualCacheLock(root, `report-write:${run.id}`, async () => {
    const { readVisualEvidence } = await import('./recovery.js')
    const results = []
    for (const result of run.results) {
      const retained = await readVisualEvidence(root, run.id, result.id)
      // A delayed live summary cannot undo approval persisted by another review session.
      results.push(retained?.result.approved && retained.result.currentHash === result.currentHash ? retained.result : result)
    }
    await persistReport(root, { ...run, results, ok: run.state === 'completed' && results.length === run.total && results.every(result => result.status === 'passed' || result.approved) })
  })
}

/** Caller holds per-run report lock across read and publication. */
async function persistReport(root: string, run: HistoireVisualRunSummary): Promise<void> {
  await safeVisualWrite(root, run.reportPath, JSON.stringify(run, null, 2))
  await safeVisualWrite(root, run.htmlPath, renderVisualReport(run))
}

/** Approval updates original run report without claiming interrupted jobs completed. */
export async function refreshRecoveredVisualReport(root: string, evidence: import('./recovery.js').VisualEvidence): Promise<void> {
  await withVisualCacheLock(root, `report-write:${evidence.run.id}`, async () => {
    const { readVisualEvidence } = await import('./recovery.js')
    const results = []
    for (const name of await listVisualFiles(root, `.histoire/visual/runs/${evidence.run.id}/results`)) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue
      const entry = await readVisualEvidence(root, evidence.run.id, name.slice(0, -5))
      if (entry) results.push(entry.result)
    }
    const reportPath = `.histoire/visual/runs/${evidence.run.id}/report.json`
    const previous = await safeVisualRead(root, reportPath)
    const previousState = previous && JSON.parse(previous.toString()).state
    const state = ['completed', 'cancelled'].includes(previousState) ? previousState : evidence.run.state
    await persistReport(root, { ...evidence.run, state, reportPath, htmlPath: `.histoire/visual/runs/${evidence.run.id}/index.html`, results, ok: state === 'completed' && results.length === evidence.run.total && results.every(result => result.status === 'passed' || result.approved) })
  })
}
