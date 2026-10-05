/**
 * Read an ancestor frame only when positioning needs traversal and parent is same-origin.
 * Backport follows Floating UI's current getFrameElement WindowProxy guard:
 * https://github.com/floating-ui/floating-ui/blob/master/packages/utils/src/dom.ts
 * @param {Window} window Source window owning measured element.
 * @param {boolean} needed False for reference/offset-parent coordinates in one document.
 * @returns {Element | null} Permitted containing frame, otherwise no ancestor traversal.
 */
export function getFloatingUiFrame(window, needed = true) {
  return needed && window.parent && Object.getPrototypeOf(window.parent) ? window.frameElement : null
}

/**
 * Patch pinned Floating UI 1.1.1 during vendor build; source dependencies stay untouched.
 * Fail on upstream changes rather than silently shipping an obsolete backport.
 * @param {string} code Resolved dependency module source.
 * @param {string} id Rollup module identity.
 * @returns {string | null} Guarded dependency code or no transform for unrelated modules.
 */
export function guardFloatingUiFrameReads(code, id) {
  if (!/\/@floating-ui\/dom\/dist\/floating-ui\.dom\.(?:mjs|esm\.js)$/.test(id.replaceAll('\\', '/'))) return null
  const first = 'let currentIFrame = win.frameElement;'
  const next = 'currentIFrame = getWindow(currentIFrame).frameElement;'
  if (!code.includes(first) || !code.includes(next)) throw new Error('Floating UI frame backport requires review')
  return `${getFloatingUiFrame.toString()}\n${code
    .replace(first, 'let currentIFrame = getFloatingUiFrame(win, Boolean(offsetParent && offsetWin !== win));')
    .replace(next, 'currentIFrame = getFloatingUiFrame(getWindow(currentIFrame));')}`
}
