import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Repository root keeps logged paths short and comparable across packages. */
const repository = resolve(fileURLToPath(new URL('../', import.meta.url)))

/** Wait for save bursts (editors, agents, codemods) to settle before rebuilding. */
const BUILD_DELAY = 300

/** Same file reported again within this window belongs to the same burst. */
const LOG_DEDUPE_WINDOW = 1000

/**
 * Rolldown watch options for package library builds started with `vite build --watch`.
 *
 * Vite 8 resolves its chokidar `ignored` list (node_modules, outDir...) but only
 * forwards polling options to Rolldown, so nothing is ignored and every fs event
 * rebuilds immediately. These options restore the exclusions, debounce bursts and
 * name the file that triggered each rebuild so feedback loops can be traced.
 *
 * Returns `undefined` without the CLI watch flag: any `build.watch` object in
 * config would otherwise turn plain `vite build` into watch mode.
 * @param {string} name Label prefixed to rebuild logs, e.g. package name.
 * @returns {import('vite').BuildEnvironmentOptions['watch'] | undefined} Watch options or undefined.
 */
export function rolldownWatchOptions(name) {
  if (!process.argv.includes('--watch') && !process.argv.includes('-w')) return undefined
  /** Last log time per file, so duplicate fs events of one save print once. */
  const lastLogged = new Map()
  return {
    buildDelay: BUILD_DELAY,
    exclude: ['**/node_modules/**', '**/dist/**'],
    onInvalidate(id) {
      const now = Date.now()
      if (now - (lastLogged.get(id) ?? 0) < LOG_DEDUPE_WINDOW) return
      lastLogged.set(id, now)
      process.stdout.write(`[${name}] rebuild triggered by ${relative(repository, id)}\n`)
    },
  }
}
