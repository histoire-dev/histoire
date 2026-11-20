import { Buffer } from 'node:buffer'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { officialPluginNames, officialRoot, readOfficialHistory, validateOfficialManifest } from './snapshot-official-history.mjs'

/** Unsafe or remote constructs never belong in a bundled monochrome logo. */
const unsafeLogo = /<script|<style|foreignObject|href|url\(|\son[a-z]+\s*=/i

/**
 * Turns an official package's monochrome `marketplace-logo.svg` into a data URI.
 * The workbench draws it as a mask in the plugin's tint, so only its shape matters.
 * @param svg Logo source.
 * @param plugin Official plugin short name, for errors.
 * @returns `data:image/svg+xml` URI.
 */
export function officialLogoUrl(svg, plugin) {
  const source = svg.trim()
  if (!source.startsWith('<svg') || !source.endsWith('</svg>') || source.length > 8192 || unsafeLogo.test(source)) throw new Error(`Invalid official logo: ${plugin}`)
  return `data:image/svg+xml;base64,${Buffer.from(source).toString('base64')}`
}

/**
 * Reads the optional bundled logo next to an official package manifest.
 * @param directory Package directory.
 * @param plugin Official plugin short name.
 * @returns Data URI, or `undefined` when the package has no logo file.
 */
async function readOfficialLogo(directory, plugin) {
  try {
    return officialLogoUrl(await readFile(resolve(directory, 'marketplace-logo.svg'), 'utf8'), plugin)
  }
  catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

/** Generate portable detail DTOs from package JSON only, without loading plugin code. */
export async function generateOfficialIndex(root = officialRoot) {
  const entries = await Promise.all(officialPluginNames.map(async (plugin) => {
    const pkg = JSON.parse(await readFile(resolve(root, `packages/histoire-plugin-${plugin}/package.json`), 'utf8'))
    if (pkg.name !== `@histoire/plugin-${plugin}`) throw new Error(`Invalid official package identity: ${plugin}`)
    const manifest = validateOfficialManifest(pkg.histoire?.marketplace, `${plugin}/package.json`)
    const history = await readOfficialHistory(resolve(root, `packages/histoire-plugin-${plugin}`), manifest)
    // A plugin can be listed before its first publication without inventing a previous release.
    if (history.length && !history.some(entry => entry.version === pkg.version)) throw new Error(`Snapshot current official release before generating index: ${plugin}`)
    const logoUrl = await readOfficialLogo(resolve(root, `packages/histoire-plugin-${plugin}`), plugin) ?? manifest.logoUrl
    return {
      id: pkg.name,
      displayName: manifest.displayName,
      summary: manifest.summary,
      publisher: '@histoire',
      official: true,
      category: manifest.category,
      frameworks: manifest.frameworks ?? [],
      adds: manifest.adds ?? [],
      monogram: manifest.monogram,
      tint: manifest.tint,
      ...(logoUrl ? { logoUrl } : {}),
      latest: pkg.version,
      ...(pkg.license ? { license: pkg.license } : {}),
      repoUrl: `https://github.com/histoire-dev/histoire/tree/main/packages/histoire-plugin-${plugin}`,
      docsUrl: plugin === 'a11y' || plugin === 'designs'
        ? `https://histoire.dev/guide/plugins/${plugin}.html`
        : plugin === 'vue-devtools' ? 'https://histoire.dev/guide/devframe.html' : 'https://histoire.dev/guide/plugins/official.html',
      // No project context exists in the bundled index; live joins refine compatibility.
      compatible: { ok: true },
      manifest,
      history,
      versions: history.map(entry => ({ version: entry.version, ...(entry.publishedAt ? { date: entry.publishedAt } : {}), compatible: true })),
      provenance: false,
      requires: manifest.requires ?? {},
      access: manifest.access ?? [],
      ...(manifest.releaseNotes ? { releaseNotes: manifest.releaseNotes } : {}),
    }
  }))
  return entries.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
}

/** Write the catalog consumed by the Node build and the static workbench. */
export async function writeOfficialIndex(root = officialRoot) {
  const target = resolve(root, 'packages/histoire/src/node/marketplace/catalog/official.json')
  await writeFile(target, `${JSON.stringify(await generateOfficialIndex(root), null, 2)}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await writeOfficialIndex()
}
