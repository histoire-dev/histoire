import { connectDemo } from './surfaces.js'
import './style.css'

const app = document.querySelector<HTMLElement>('#app')!
app.innerHTML = `<form><label>Source URL <input name="source" type="url" required></label><label>View <select name="mode" aria-label="View"><option value="explorer">Explorer</option><option value="parts">Two sessions / independent parts</option><option value="hidden">Explicit hidden preview</option></select></label><button>Connect</button></form><p role="alert" hidden></p><div id="surfaces"></div>`
const form = app.querySelector<HTMLFormElement>('form')!
const source = form.elements.namedItem('source') as HTMLInputElement
source.value = new URLSearchParams(location.search).get('source') ?? import.meta.env.VITE_HISTOIRE_URL ?? ''
const container = app.querySelector<HTMLElement>('#surfaces')!
const alert = app.querySelector<HTMLParagraphElement>('[role="alert"]')!
let close: (() => Promise<void>) | undefined
let connecting = false
let removed = false

/** Observe source/mount failures without starting or retrying another execution. */
function report(error: unknown) {
  alert.hidden = false
  alert.textContent = error instanceof Error ? error.message : String(error)
}

form.addEventListener('submit', (event) => {
  event.preventDefault()
  if (connecting || removed) return
  connecting = true
  const button = form.querySelector<HTMLButtonElement>('button')!
  button.disabled = true
  const mode = (form.elements.namedItem('mode') as HTMLSelectElement).value
  void (async () => {
    await close?.()
    alert.hidden = true
    const demo = connectDemo(source.value, mode, container, report)
    close = demo.close
    await demo.ready
  })().catch(report).finally(() => {
    connecting = false
    button.disabled = false
  })
})
window.addEventListener('pagehide', () => {
  removed = true
  void close?.().catch(report)
}, { once: true })
