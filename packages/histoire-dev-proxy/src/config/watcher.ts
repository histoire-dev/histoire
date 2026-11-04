import type { Buffer } from 'node:buffer'
import type { WatchInput } from '../protocol.js'
import path from 'node:path'
import chokidar from 'chokidar'
import { readFileSnapshot } from './snapshots.js'

/** Owns byte-aware directory watches, retaining dependencies through failed loads. */
export async function watchConfiguration(inputs: readonly WatchInput[], changed: (source: string, file: string) => void, onError: (error: unknown) => void = console.error) {
  const files = new Map<string, WatchInput>()
  let stopped = false
  let changes = Promise.resolve()
  const watchers = new Map<ReturnType<typeof chokidar.watch>, Set<string>>()
  const directories = new Set<string>()
  /** Serial reads suppress duplicate add/change events without dropping later bytes. */
  function inspect(file: string) {
    file = path.resolve(file)
    if (stopped || !files.has(file)) return
    changes = changes.then(async () => {
      const previous = files.get(file)
      if (stopped || !previous) return
      const next = (await readFileSnapshot(file))?.toString('base64') ?? null
      if (stopped || next === previous.bytes) return
      files.set(file, { ...previous, bytes: next })
      changed(previous.source, file)
    }).catch((error) => {
      if (!stopped) onError(error)
    })
  }
  /** Merge evaluation snapshots, subscribe new directories, then reconcile missed edits. */
  async function update(next: readonly WatchInput[], isCurrent = () => true) {
    if (stopped || !isCurrent()) return
    const added = new Set<string>()
    for (const input of next) {
      const file = path.resolve(input.file)
      files.set(file, { ...input, file })
      const directory = path.dirname(file)
      if (!directories.has(directory)) {
        directories.add(directory)
        added.add(directory)
      }
    }
    if (added.size) {
      const watcher = chokidar.watch([...added], { ignoreInitial: true, depth: 0 })
      watchers.set(watcher, added)
      watcher.on('add', inspect).on('change', inspect).on('unlink', inspect).on('error', onError)
      // Every new dependency directory gets a scan barrier before reconciliation;
      // otherwise edits between its first stat and subscription could disappear.
      await new Promise<void>((resolve, reject) => {
        watcher.once('ready', resolve)
        watcher.once('error', reject)
      })
    }
    if (stopped || !isCurrent()) return
    for (const input of next) inspect(input.file)
    await changes
  }
  try {
    await update(inputs)
  }
  catch (error) {
    await Promise.all([...watchers.keys()].map(watcher => watcher.close()))
    throw error
  }
  return {
    update,
    /** A successful generation retires stale dependency paths; failures retain last known set. */
    async replace(next: readonly WatchInput[], isCurrent = () => true) {
      if (stopped || !isCurrent()) return
      const retained = new Set(next.map(input => path.resolve(input.file)))
      for (const file of files.keys()) {
        if (!retained.has(file)) files.delete(file)
      }
      const activeDirectories = new Set([...retained].map(file => path.dirname(file)))
      const closing = []
      for (const [watcher, paths] of watchers) {
        if ([...paths].some(path => activeDirectories.has(path))) continue
        watchers.delete(watcher)
        for (const directory of paths) directories.delete(directory)
        closing.push(watcher.close())
      }
      await Promise.all(closing)
      await update(next, isCurrent)
    },
    /** Stops callbacks before joining pending reads and closing filesystem handles. */
    async close() {
      stopped = true
      await Promise.all([...watchers.keys()].map(watcher => watcher.close()))
      await changes
    },
  }
}

/** Encodes captured bytes only for trusted runtime-to-parent transport. */
export function encodeWatchInputs(snapshots: ReadonlyMap<string, Buffer | undefined>, source = 'Histoire'): WatchInput[] {
  return [...snapshots].map(([file, bytes]) => ({ file, source, bytes: bytes?.toString('base64') ?? null }))
}
