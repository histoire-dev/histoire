#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/** Stable repository paths stay usable while package dist directories are replaced. */
const repository = resolve(fileURLToPath(new URL('../', import.meta.url)))
/** Resolve supervisor from root development dependencies, never from rebuilt Histoire. */
const require = createRequire(import.meta.url)
/** Forward arguments as separate values so config paths containing spaces stay intact. */
const arguments_ = process.argv.slice(2)
// pnpm run may forward its own separator; launcher arguments follow it.
if (arguments_[0] === '--') arguments_.shift()
/** Only launcher consumes source mode; Histoire receives every remaining argument unchanged. */
const sourceIndex = arguments_.indexOf('--source')
if (sourceIndex !== -1) {
  arguments_.splice(sourceIndex, 1)
  process.env.HISTOIRE_DEV = 'true'
}

/** Exit status requested by a termination signal, recorded before Nodemon starts its own shutdown. */
let requestedCode
/** Processes below the launcher when termination was requested; they must be gone before exit. */
let draining = []

/**
 * Lists every process below this launcher (POSIX `ps`). Nodemon signals the whole
 * tree but stops waiting once its direct child exits, which can leave the runtime
 * behind for a moment. Unsupported platforms and `ps` failures report nothing.
 * @returns {number[]} Descendant process ids.
 */
function listDescendants() {
  try {
    const children = new Map()
    for (const line of execFileSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8' }).split('\n')) {
      const [pid, parent] = line.trim().split(/\s+/).map(Number)
      if (!pid) continue
      children.set(parent, [...(children.get(parent) ?? []), pid])
    }
    const found = []
    for (const queue = [process.pid]; queue.length;) {
      for (const pid of children.get(queue.pop()) ?? []) {
        found.push(pid)
        queue.push(pid)
      }
    }
    return found
  }
  catch {
    return []
  }
}

/**
 * Resolves once none of `pids` exists, or after `timeout` ms (Nodemon gives up after the same bound).
 * @param {number[]} pids Processes to wait for.
 * @param {number} timeout Upper bound in milliseconds.
 */
async function untilGone(pids, timeout) {
  const deadline = Date.now() + timeout
  const exists = (pid) => {
    try {
      process.kill(pid, 0)
      return true
    }
    catch (error) {
      // EPERM means the process exists but is not ours to signal.
      return error.code === 'EPERM'
    }
  }
  while (pids.some(exists) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25))
}

// Registered before Nodemon boots so these run first: Nodemon may emit its final
// `exit` synchronously from its own handler when no child is running, and its
// handler starts killing the tree, so the snapshot has to come first.
process.once('SIGINT', () => {
  requestedCode = 130
  draining = listDescendants()
})
process.once('SIGTERM', () => {
  requestedCode = 143
  draining = listDescendants()
})

/** Nodemon is used as a library: it never exits the process or echoes output on its own. */
const nodemon = require('nodemon')

// Globs anchor watches at stable packages ancestry. Watching existing dist
// directories alone can lose their replacement after a clean package build.
// A fresh child replaces Node's module cache and any quarantined execution lane.
nodemon({
  script: `${repository}/packages/histoire/bin.mjs`,
  // Everything after the script is passed to Histoire, which owns its flags.
  args: ['dev', ...arguments_],
  exec: 'node',
  watch: [
    `${repository}/packages/*/dist/**/*`,
    `${repository}/packages/*/package.json`,
    `${repository}/packages/histoire/bin.mjs`,
  ],
  ignore: [
    '**/node_modules/**',
    '**/*.d.ts',
    '**/*.d.mts',
    '**/*.d.cts',
    '**/*.map',
    '**/.histoire/**',
    '**/.cache/**',
    '**/.vite/**',
    '**/*.histoire.spec.*',
    // Browser-only outputs are served through Vite `/@fs/`, whose watcher already
    // reloads the page. Restarting Node for them only drops connections. App
    // embed output and plugin bundles stay watched: Node imports or collects them.
    `${repository}/packages/histoire-app/dist/bundled/**`,
    `${repository}/packages/histoire-app/dist/app/**`,
    `${repository}/packages/histoire-app/dist/fonts/**`,
    `${repository}/packages/histoire-app/dist/bundle-*.js`,
    `${repository}/packages/histoire-app/dist/style.css`,
  ],
  // Include CSS, JSON, fonts and other runtime assets without maintaining an extension list.
  ext: '*',
  // Coalesce emitter bursts; incomplete startup stays supervised until more outputs arrive.
  delay: 1500,
  signal: 'SIGTERM',
  // The child inherits the real terminal: one input owner, no stdin piping through Nodemon.
  stdin: false,
  // No `rs` command: it would need Nodemon to read the terminal.
  restartable: false,
  colours: false,
})

// Nodemon resets its listeners while booting, so handlers attach after the call.
// Nodemon reports through events here, so supervisor lines never fight with the
// terminal UI owned by the child. Failures always show; routine status only
// when output is not an interactive terminal.
nodemon.on('log', ({ type, message }) => {
  if (type === 'fail' || type === 'error') process.stderr.write(`[nodemon] ${message}\n`)
  else if (!process.stdout.isTTY && type !== 'detail') process.stdout.write(`[nodemon] ${message}\n`)
})

/** True once the launcher decided to stop, so teardown runs exactly once. */
let finishing = false

/**
 * Closes build watchers, waits for the terminated tree to drain, then exits with
 * `code`. `reset` stops the watchers and any child still running.
 * @param {number} code Exit status.
 */
function finish(code) {
  if (finishing) return
  finishing = true
  nodemon.reset(() => void untilGone(draining, 10_000).then(() => process.exit(code)))
}

// `exit` arrives for three different reasons, told apart by its argument:
// - `'SIGTERM'`: Nodemon (or someone else) terminated the child; Nodemon restarts it.
// - `null`: the child quit by itself with status 0 (`q`, `quit`): intentional, end the launcher.
// - `undefined`: Nodemon's own shutdown after SIGINT/SIGTERM, once the child drained.
// Crashes emit `crash` instead and keep waiting for rebuilds.
nodemon.on('exit', (signal) => {
  if (signal === undefined) finish(requestedCode ?? 0)
  // Wait a tick: Nodemon clears its child reference after emitting, and resetting
  // earlier would try to kill the process that already ended.
  else if (signal === null) setImmediate(() => finish(0))
})

process.stdout.write('Watching repository package builds; Histoire restarts automatically after output changes.\n')
