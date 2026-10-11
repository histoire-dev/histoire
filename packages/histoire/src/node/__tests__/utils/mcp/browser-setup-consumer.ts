import { access, cp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { MCP_REPOSITORY_ROOT } from './cli-project.js'
import { createPackageConsumer } from './package-consumer.js'
import { startMcpProcess } from './process.js'

/** Browser cache entries that Playwright 1.49+ resolves independently. */
export type BrowserCacheChoice = 'chromium' | 'chromium-headless-shell'

/** Cached driver and exact browser revisions used by a strict consumer. */
export interface BrowserPackage {
  /** Workspace package root, used only as a read-only cache source. */
  root: string
  /** Version copied into the temporary consumer. */
  version: string
  /** Revisions declared by this exact driver. */
  revisions: Record<BrowserCacheChoice, string>
}

/** Resolve the cached driver without adding a registry dependency. */
export async function getBrowserPackage(): Promise<BrowserPackage> {
  const example = createRequire(resolve(MCP_REPOSITORY_ROOT, 'examples/vue3/package.json'))
  const playwrightManifest = example.resolve('playwright/package.json')
  const coreManifestPath = createRequire(playwrightManifest).resolve('playwright-core/package.json')
  const root = dirname(coreManifestPath)
  const manifest = JSON.parse(await readFile(coreManifestPath, 'utf8'))
  const browserManifest = JSON.parse(await readFile(resolve(root, 'browsers.json'), 'utf8'))
  /** Return one browser's pinned cache revision. */
  const revision = (name: BrowserCacheChoice) => {
    const browser = browserManifest.browsers.find((entry: { name: string }) => entry.name === name)
    if (!browser) throw new Error(`Cached Playwright driver does not declare ${name}`)
    return String(browser.revision)
  }
  return { root, version: manifest.version, revisions: { 'chromium': revision('chromium'), 'chromium-headless-shell': revision('chromium-headless-shell') } }
}

/** Select the existing browser cache only as a read-only symlink source. */
export function existingBrowserCache(coreRoot: string): string {
  const configured = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (configured && configured !== '0') return resolve(tmpdir(), configured)
  if (configured === '0') return resolve(coreRoot, '.local-browsers')
  if (process.platform === 'win32') return resolve(process.env.LOCALAPPDATA ?? homedir(), 'ms-playwright')
  if (process.platform === 'darwin') return resolve(homedir(), 'Library', 'Caches', 'ms-playwright')
  return resolve(homedir(), '.cache', 'ms-playwright')
}

/** Expose only named matching cache entries inside a disposable browser root. */
export async function createIsolatedBrowserCache(root: string, packageInfo: BrowserPackage, choices: BrowserCacheChoice[]): Promise<string> {
  const cache = resolve(root, 'browser cache')
  await mkdir(cache, { recursive: true })
  const sourceRoot = existingBrowserCache(packageInfo.root)
  for (const choice of choices) {
    const directory = choice === 'chromium' ? `chromium-${packageInfo.revisions.chromium}` : `chromium_headless_shell-${packageInfo.revisions['chromium-headless-shell']}`
    const source = resolve(sourceRoot, directory)
    await access(source)
    await symlink(source, resolve(cache, directory), process.platform === 'win32' ? 'junction' : 'dir')
  }
  return cache
}

/** Resolve copied core driver and the one deterministic story in a packed project. */
export async function createBrowserSetupConsumer(directory: string) {
  const consumer = await createPackageConsumer(directory)
  const browserPackage = await getBrowserPackage()
  const manifestPath = resolve(consumer.root, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.devDependencies = { ...manifest.devDependencies, 'playwright-core': browserPackage.version }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  const target = resolve(consumer.root, 'node_modules/playwright-core')
  await mkdir(dirname(target), { recursive: true })
  await cp(browserPackage.root, target, { recursive: true })
  await writeConsumerProject(consumer.root, { source: 'auto' })
  return { consumer, browserPackage }
}

/** Write the small project copied into CLI, dev, SDK, and artifact consumers. */
export async function writeConsumerProject(consumerRoot: string, browser: Record<string, string>): Promise<void> {
  const story = resolve(MCP_REPOSITORY_ROOT, 'packages/histoire/src/node/__tests__/fixtures/browser-setup/BrowserSetup.story.vue')
  await cp(story, resolve(consumerRoot, 'BrowserSetup.story.vue'))
  await writeFile(resolve(consumerRoot, 'histoire.config.ts'), `import { HstVue } from '@histoire/plugin-vue'; export default { plugins:[HstVue()], storyMatch:['BrowserSetup.story.vue'], routerMode:'hash', mcp:true, browser:${JSON.stringify(browser)}, preview:{globals:{theme:'default'}} };`)
  await writeFile(resolve(consumerRoot, 'vite.config.ts'), `import vue from '@vitejs/plugin-vue'; export default { plugins:[vue()] };`)
}

/** Invoke the packed CLI and parse its sole JSON setup snapshot. */
export async function checkConsumerSetup(cli: string, root: string, cache: string, check = true) {
  const runtime = startMcpProcess(['screenshot-setup', '--root', root, '--config', 'histoire.config.ts', ...(check ? ['--check'] : []), '--json'], tmpdir(), {
    PLAYWRIGHT_BROWSERS_PATH: cache,
  }, cli)
  const exit = await runtime.waitForExit(30_000)
  return { exit: exit.code, output: JSON.parse(runtime.output().trim()) }
}

/** Find the full Chromium executable under a test-owned isolated cache. */
export async function getCachedChromiumExecutable(cache: string, revision: string): Promise<string> {
  const directory = resolve(cache, `chromium-${revision}`)
  const candidates = process.platform === 'win32'
    ? ['chrome-win/chrome.exe', 'chrome-win64/chrome.exe']
    : process.platform === 'darwin'
      ? ['chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium']
      : ['chrome-linux64/chrome', 'chrome-linux/chrome']
  for (const candidate of candidates) {
    const path = resolve(directory, candidate)
    try {
      await access(path)
      return path
    }
    catch { /* Try the other platform layout shipped by this driver. */ }
  }
  throw new Error(`No full Chromium executable found for revision ${revision}`)
}
