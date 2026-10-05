import { watch } from 'node:fs'
import { cp } from 'node:fs/promises'

const source = new URL('../src/styles/', import.meta.url)
const destination = new URL('../dist/', import.meta.url)

/** Preserve explicit root stylesheet and future panel styles in published output. */
async function copyStyles() {
  await cp(source, destination, { recursive: true })
}
await copyStyles()
if (process.argv.includes('--watch')) {
  // Serialize copying so concurrent file notifications never write one output twice.
  let copying = Promise.resolve()
  watch(source, { recursive: true }, () => {
    copying = copying.then(copyStyles).catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    })
  })
}
