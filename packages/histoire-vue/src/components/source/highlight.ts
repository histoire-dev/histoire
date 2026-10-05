import type { Highlighter } from 'shiki'

/** Shared immutable highlighter; lazy UI-only dependency never enters SDK/protocol. */
let highlighter: Promise<Highlighter> | undefined

/** Highlighter escapes source text; failures retain plain safe source display. */
export async function highlightHistoireSource(body: string, language: string | undefined, dark: boolean): Promise<string | null> {
  try {
    highlighter ??= import('shiki').then(module => module.createHighlighter({ themes: ['github-light', 'github-dark'], langs: ['html', 'vue', 'svelte', 'javascript', 'typescript', 'jsx', 'tsx', 'json', 'css'] }))
    const instance = await highlighter
    const lang = language && instance.getLoadedLanguages().includes(language) ? language : 'html'
    return instance.codeToHtml(body, { lang, theme: dark ? 'github-dark' : 'github-light' })
  }
  catch {
    highlighter = undefined
    return null
  }
}
