import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const destination = fileURLToPath(new URL('../../histoire-controls/src/style/fonts/', import.meta.url))
/** Families and weight ranges selected by the C1 design reference. */
const families = [
  { package: '@fontsource-variable/manrope', prefix: 'manrope', name: 'Manrope', weights: '400 800' },
  { package: '@fontsource-variable/jetbrains-mono', prefix: 'jetbrains-mono', name: 'JetBrains Mono', weights: '400 500' },
]

await mkdir(destination, { recursive: true })
const faces = []
const sources = []
for (const family of families) {
  const packageFile = require.resolve(`${family.package}/package.json`)
  const source = dirname(packageFile)
  const metadata = JSON.parse(await readFile(packageFile, 'utf8'))
  const css = await readFile(join(source, 'wght.css'), 'utf8')
  for (const subset of ['latin-ext', 'latin']) {
    const filename = `${family.prefix}-${subset}-wght-normal.woff2`
    const sourceFace = css.split('@font-face').find(block => block.includes(filename))
    const unicodeRange = sourceFace?.match(/unicode-range:([^;]+);/)?.[1].trim()
    if (!unicodeRange) throw new Error(`Missing font subset: ${family.package}/${filename}`)
    await copyFile(join(source, 'files', filename), join(destination, filename))
    faces.push(`/* ${family.name} ${subset}; license: ./fonts/${family.prefix}.LICENSE */
@font-face {
  font-family: '${family.name}';
  font-style: normal;
  font-weight: ${family.weights};
  font-display: swap;
  src: url('./fonts/${filename}') format('woff2');
  unicode-range: ${unicodeRange};
}`)
  }
  await copyFile(join(source, 'LICENSE'), join(destination, `${family.prefix}.LICENSE`))
  sources.push(`${family.package}@${metadata.version}`)
}
await writeFile(new URL('../../histoire-controls/src/style/fonts.pcss', import.meta.url), `${faces.join('\n\n')}\n`)
await writeFile(join(destination, 'SOURCES.txt'), `${sources.join('\n')}\n`)
