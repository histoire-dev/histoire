#!/usr/bin/env node
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Stable repository paths stay usable while package dist directories are replaced. */
const repository = resolve(fileURLToPath(new URL('../', import.meta.url)))
/** Resolve supervisor from root development dependencies, never from rebuilt Histoire. */
const require = createRequire(import.meta.url)
/** Nodemon CLI owns signals, child shutdown and filesystem watcher lifetime. */
const supervisor = require.resolve('nodemon/bin/nodemon.js')
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

// Globs anchor watches at stable packages ancestry. Watching existing dist
// directories alone can lose their replacement after a clean package build.
// A fresh child replaces Node's module cache and any quarantined execution lane.
process.argv = [
  process.execPath,
  supervisor,
  '--watch',
  `${repository}/packages/*/dist/**/*`,
  '--watch',
  `${repository}/packages/*/package.json`,
  '--watch',
  `${repository}/packages/histoire/bin.mjs`,
  '--ignore',
  '**/node_modules/**',
  '--ignore',
  '**/*.d.ts',
  '--ignore',
  '**/*.d.mts',
  '--ignore',
  '**/*.d.cts',
  '--ignore',
  '**/*.map',
  '--ignore',
  '**/.histoire/**',
  '--ignore',
  '**/.cache/**',
  '--ignore',
  '**/.vite/**',
  '--ignore',
  '**/*.histoire.spec.*',
  // Include CSS, JSON, fonts and other runtime assets without maintaining an extension list.
  '--ext',
  '*',
  // Coalesce emitter bursts; incomplete startup stays supervised until more outputs arrive.
  '--delay',
  '1500ms',
  '--signal',
  'SIGTERM',
  '--exec',
  'node',
  '--no-update-notifier',
  // Nodemon also accepts --config; separate child arguments so Histoire owns its flags.
  '--',
  `${repository}/packages/histoire/bin.mjs`,
  'dev',
  ...arguments_,
]

process.stdout.write('Watching repository package builds; Histoire restarts automatically after output changes.\n')
// Import only stable supervisor. Compiled Histoire code runs exclusively in its child.
await import(supervisor)
