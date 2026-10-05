import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const source = require('@iconify-json/carbon/icons.json')

const destination = new URL('../../histoire-shared/src/icons/carbon-icons.json', import.meta.url)
const names = JSON.parse(await readFile(new URL('../../histoire-shared/src/icons/icon-names.json', import.meta.url), 'utf8'))

/** Resolve aliases once so browser code receives only literal offline SVG data. */
function resolveIcon(name) {
  const icon = source.icons[name]
  if (icon) return icon
  const alias = source.aliases?.[name]
  if (!alias) throw new Error(`Unknown Carbon icon: ${name}`)
  return { ...resolveIcon(alias.parent), ...alias, parent: undefined }
}

// One entry per line keeps this generated data inspectable without thousands of path lines.
const entries = names.map(name => `    ${JSON.stringify(name)}: ${JSON.stringify(resolveIcon(name))}`)
await writeFile(destination, `{
  "prefix": "carbon",
  "width": ${source.width ?? 32},
  "height": ${source.height ?? 32},
  "icons": {
${entries.join(',\n')}
  }
}\n`)
