import type { BundledLanguage } from 'shiki'
import type { Context } from '../context.js'
import { bundledLanguagesInfo, createHighlighter } from 'shiki'
import { getContextRegistry } from '../runtime/registry.js'

/** Real Shiki engine acquired by one project context. */
type Highlighter = Awaited<ReturnType<typeof createHighlighter>>
/** Canonical IDs deduplicate aliases without importing their grammar modules. */
const languageIds = new Map(bundledLanguagesInfo.flatMap(language => [language.id, ...(language.aliases ?? [])].map(alias => [alias, language.id as BundledLanguage] as const)))
/** Weak ownership preserves independent projects and independent generations. */
const services = new WeakMap<Context, ReturnType<typeof createService>>()

/** Rejects work as soon as context teardown starts, before its disposers finish. */
export function assertMarkdownActive(ctx: Context) {
  if (getContextRegistry(ctx).cleanup.isClosing) throw new Error('Project runtime closed')
}

/** Owns lazy engine acquisition and deduplicated language loads. */
function createService(ctx: Context) {
  let engine: Highlighter | undefined
  let initializing: Promise<Highlighter> | undefined
  let closed = false
  const loading = new Map<string, Promise<void>>()

  /** Fences both context shutdown and this service's asynchronous disposal. */
  function checkActive() {
    assertMarkdownActive(ctx)
    if (closed) throw new Error('Project runtime closed')
  }

  getContextRegistry(ctx).cleanup.add(async () => {
    closed = true
    // Acquisition can finish after close. Retain its result so disposal never
    // loses an engine, and drain grammar loads before disposing their registry.
    await Promise.allSettled([initializing, ...loading.values()].filter(Boolean))
    engine?.dispose()
    engine = undefined
  })

  /** Shares one pending engine and permits retry after acquisition failure. */
  async function acquire() {
    checkActive()
    if (!engine) {
      initializing ??= createHighlighter({ themes: ['github-dark'], langs: [] })
        .then((value) => {
          engine = value
          return value
        })
        .finally(() => { initializing = undefined })
      await initializing
    }
    checkActive()
    return engine
  }

  return {
    /** Loads only known requested grammars; Shiki resolves embedded dependencies. */
    async prepare(languages: Iterable<string>) {
      const names = [...new Set(languages)]
      checkActive()
      if (!names.length) return
      const highlighter = await acquire()
      const loaded = new Set(highlighter.getLoadedLanguages())
      await Promise.all([...new Set(names.map(name => languageIds.get(name)).filter(Boolean))].map((id) => {
        if (loaded.has(id)) return undefined
        let pending = loading.get(id)
        if (!pending) {
          pending = highlighter.loadLanguage(id).finally(() => {
            loading.delete(id)
          })
          loading.set(id, pending)
        }
        return pending
      }))
      checkActive()
    },
    /** Compatibility preparation for a user-supplied whole render method. */
    async prepareAll() {
      await this.prepare(bundledLanguagesInfo.map(language => language.id))
    },
    /** Highlights synchronously after the caller completed asynchronous preparation. */
    highlight(code: string, lang: string) {
      checkActive()
      if (!engine) throw new Error('Markdown syntax highlighting requires asynchronous preparation')
      return engine.codeToHtml(code, { theme: 'github-dark', lang })
    },
  }
}

/** Obtains the exact context service without acquiring a syntax engine. */
export function getMarkdownHighlighter(ctx: Context) {
  assertMarkdownActive(ctx)
  let service = services.get(ctx)
  if (!service) services.set(ctx, service = createService(ctx))
  return service
}
