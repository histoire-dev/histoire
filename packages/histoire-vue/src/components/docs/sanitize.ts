/** Lazy HTML-only sanitizer belongs to UI; core SDK/protocol never import it or access DOM. */
export async function sanitizeDocsHtml(html: string, document: Document): Promise<string> {
  const window = document.defaultView
  if (!window) throw new Error('Documentation sanitizer requires mounted document')
  const { default: createDOMPurify } = await import('dompurify')
  const purifier = createDOMPurify(window)
  // Resolve URLs before this final pass. Never alter sanitized HTML afterwards.
  return purifier.sanitize(html, {
    USE_PROFILES: { html: true },
    // Normalizer restricts every retained target to _blank and sets noopener.
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form'],
    FORBID_ATTR: ['style', 'srcdoc', 'action', 'formaction', 'autofocus'],
  })
}
