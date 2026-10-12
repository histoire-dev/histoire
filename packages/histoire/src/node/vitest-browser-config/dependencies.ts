import type { Context } from '../context.js'
import fs from 'node:fs'
import { join, resolve } from 'pathe'
import { findProjectPackageDirectories, withPackageDirs } from '../util/resolve-package.js'

/** Node browser providers are executed by Vitest, never by its browser page. */
const NODE_BROWSER_PROVIDERS = new Set(['playwright', 'playwright-core', '@playwright/test'])

/**
 * Tells whether an installed package extends Vite (it depends or peer-depends
 * on `vite`). Such plugins only run in Node: prebundling one for the page pulls
 * Vite and its native watcher addon (`fsevents` on macOS) that esbuild cannot load.
 * @param root The project root the package is installed from.
 * @param name The package name.
 */
function isVitePlugin(root: string, name: string) {
  const directory = findProjectPackageDirectories(root, name)[0]
  if (!directory) return false
  try {
    const manifest = JSON.parse(fs.readFileSync(join(directory, 'package.json'), 'utf8')) as Record<string, Record<string, string> | undefined>
    return [manifest.dependencies, manifest.peerDependencies].some(dependencies => dependencies?.vite !== undefined)
  }
  catch {
    return false
  }
}

/**
 * Packages that must NEVER be prebundled for the browser run: Vitest and its
 * expect/snapshot internals are resolved to the project's own copy by the
 * resolve plugin, and optimizing them would fork that copy.
 */
export const VITEST_BROWSER_OPTIMIZER_EXCLUDES = [
  ...NODE_BROWSER_PROVIDERS,
  'vitest',
  'expect-type',
  '@vitest/expect',
  '@vitest/snapshot',
  'vitest > expect-type',
  'vitest > @vitest/expect > chai',
  'vitest > @vitest/snapshot > magic-string',
]

/**
 * Builds the `optimizeDeps.include` list: every browser dependency name plus,
 * when resolvable, its installed directory (so nested entry points are
 * prebundled too).
 * @param ctx The histoire context.
 */
export function getVitestBrowserOptimizeDeps(ctx: Context) {
  return [...new Set(withPackageDirs(getVitestBrowserDependencyNames(ctx)))]
}

/**
 * Lists the packages force-included in the browser dependency optimizer.
 *
 * Deliberately broad (every project dependency AND devDependency): the browser
 * run disables Vite's dep discovery, so a story importing a package that was not
 * pre-bundled triggers a mid-run optimizer reload that kills the browser
 * connection — the failure `shouldRetryBrowserRun` in `test.ts` has to retry.
 * Node browser providers and Vite plugins stay excluded: scanning their server
 * graph can fail on optional platform modules such as Playwright's Chromium
 * BiDi implementation or Vite's `fsevents` watcher.
 * @param ctx The histoire context, used for the project root and support plugins.
 */
export function getVitestBrowserDependencyNames(ctx: Context) {
  const deps = new Set<string>()

  if (ctx.supportPlugins.some(plugin => plugin.id === 'vue3')) {
    deps.add('vue')
    deps.add('pinia')
    deps.add('floating-vue')
    deps.add('@vueuse/core')
  }

  if (ctx.supportPlugins.some(plugin => plugin.id === 'svelte4')) {
    deps.add('svelte')
  }

  if (ctx.supportPlugins.some(plugin => plugin.id === 'react')) {
    for (const name of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime']) deps.add(name)
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(resolve(ctx.root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }

    for (const dep of [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
    ]) {
      if (
        dep !== 'histoire'
        && !NODE_BROWSER_PROVIDERS.has(dep)
        && dep !== 'vite'
        && dep !== 'vitest'
        && !dep.startsWith('@histoire/')
        && !dep.startsWith('@vitest/')
        && !dep.startsWith('@types/')
        && !dep.startsWith('@vue/')
        && !isVitePlugin(ctx.root, dep)
      ) {
        deps.add(dep)
      }
    }
  }
  catch {}

  return [...deps]
}
