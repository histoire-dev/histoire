import { cp, mkdir } from 'node:fs/promises'

// Both public CSS entrypoints resolve the same licensed, local font assets.
for (const directory of ['../dist/fonts/', '../dist/peer/fonts/']) {
  const destination = new URL(directory, import.meta.url)
  await mkdir(destination, { recursive: true })
  await cp(new URL('../src/style/fonts/', import.meta.url), destination, { recursive: true })
}
