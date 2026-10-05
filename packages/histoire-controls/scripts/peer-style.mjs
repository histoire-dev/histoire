import { readFile, writeFile } from 'node:fs/promises'

// Component SFC styles and utilities are scoped independently, then shipped as
// one explicit stylesheet. Importing JS never mutates the host document.
const [components, utilities] = await Promise.all([
  readFile(new URL('../dist/peer/index.css', import.meta.url), 'utf8'),
  readFile(new URL('../dist/peer/style.css', import.meta.url), 'utf8'),
])
await writeFile(new URL('../dist/peer/style.css', import.meta.url), `${components}\n${utilities}`)
