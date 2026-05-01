import type { OutputBundle } from 'rollup'
import type { Plugin as VitePlugin } from 'vite'
import { STORY_SCOPE_ROOT } from './selectors.js'
import { wrapUserCss } from './transforms.js'
import { USER_CSS_MARK_END, USER_CSS_MARK_START } from './vite-plugin.js'

export interface EntryCssMergerOptions {
  isolateStyles: boolean
  scopeRoot?: string
  mainEntryName?: string
}

export function entryCssMergerPlugin(opts: EntryCssMergerOptions = { isolateStyles: false }): VitePlugin {
  const scopeRoot = opts.scopeRoot ?? STORY_SCOPE_ROOT
  const mainEntryName = opts.mainEntryName ?? 'bundle-main'
  return {
    name: 'histoire:style-isolation:entry-css-merger',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle: OutputBundle) {
      function collectChunkCss(entryFileName: string, entryName: string, acc: Map<string, string[]>) {
        const seen = new Set<string>()
        const queue = [entryFileName]
        let head = 0
        while (head < queue.length) {
          const cur = queue[head++]
          if (seen.has(cur)) continue
          seen.add(cur)
          const c = bundle[cur]
          if (!c || c.type !== 'chunk') continue
          const meta = (c as any).viteMetadata
          if (meta?.importedCss) {
            for (const cssName of meta.importedCss as Set<string>) {
              const list = acc.get(cssName) ?? []
              if (!list.includes(entryName)) list.push(entryName)
              acc.set(cssName, list)
            }
          }
          for (const imp of c.imports ?? []) queue.push(imp)
          for (const imp of c.dynamicImports ?? []) queue.push(imp)
        }
      }

      const cssAssetUsedBy = new Map<string, string[]>()
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk' || !chunk.isEntry) continue
        collectChunkCss(fileName, chunk.name, cssAssetUsedBy)
      }

      const mergedByEntry = new Map<string, string[]>()
      for (const [cssName, entries] of cssAssetUsedBy) {
        const asset = bundle[cssName]
        if (!asset || asset.type !== 'asset') continue
        const source = typeof asset.source === 'string'
          ? asset.source
          : new TextDecoder().decode(asset.source as Uint8Array)
        for (const entryName of entries) {
          const list = mergedByEntry.get(entryName) ?? []
          list.push(source)
          mergedByEntry.set(entryName, list)
        }
        delete bundle[cssName]
      }

      for (const [entryName, sources] of mergedByEntry) {
        const fileName = `${entryName}.css`
        const merged = sources.join('\n')
        const finalSource = entryName === mainEntryName && opts.isolateStyles
          ? wrapMarkedUserCss(merged, scopeRoot)
          : stripMarkers(merged)
        bundle[fileName] = {
          type: 'asset',
          fileName,
          name: fileName,
          source: finalSource,
          needsCodeReference: false,
        } as any
      }

      for (const [, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk' || !chunk.isEntry) continue
        const meta = (chunk as any).viteMetadata
        if (!meta?.importedCss) continue
        meta.importedCss = new Set([`${chunk.name}.css`])
      }
    },
  }
}

function stripMarkers(css: string): string {
  return css.split(USER_CSS_MARK_START).join('').split(USER_CSS_MARK_END).join('')
}

export function wrapMarkedUserCss(css: string, scopeRoot: string): string {
  let out = ''
  let cursor = 0
  while (cursor < css.length) {
    const start = css.indexOf(USER_CSS_MARK_START, cursor)
    if (start === -1) {
      out += css.slice(cursor)
      break
    }
    out += css.slice(cursor, start)
    const end = css.indexOf(USER_CSS_MARK_END, start + USER_CSS_MARK_START.length)
    if (end === -1) {
      out += css.slice(start + USER_CSS_MARK_START.length)
      break
    }
    const inner = css.slice(start + USER_CSS_MARK_START.length, end).trim()
    if (inner.length > 0) {
      out += `${wrapUserCss(inner, { scopeRoot })}\n`
    }
    cursor = end + USER_CSS_MARK_END.length
  }
  return out
}
