/** Emits bounded DOM inspection services; dispatch inherits the preview host guard. */
export function previewElementInspection() {
  return `/** Escapes identifiers and attribute strings without requiring CSS.escape. */
function escapeInspectionSelector(value) {
  return Array.from(value).map((character, index) => {
    const code = character.codePointAt(0)
    return /[a-z_-]/i.test(character) || (index > 0 && /[0-9]/.test(character))
      ? character : '\\\\' + code.toString(16) + ' '
  }).join('')
}

/** Prefer a unique stable attribute; duplicate attributes fall back to structure. */
function inspectionAttributeSelector(element) {
  const testId = element.getAttribute('data-test-id')
  const id = element.getAttribute('id')
  const candidates = []
  if (testId && testId.length <= 512) candidates.push('[data-test-id="' + escapeInspectionSelector(testId) + '"]')
  if (id && id.length <= 512) candidates.push('#' + escapeInspectionSelector(id))
  for (const selector of candidates) {
    try { if (document.querySelectorAll(selector).length === 1) return selector }
    catch { /* Invalid author attributes cannot fail element inspection. */ }
  }
  return null
}

/** Build a short unique structural path rooted at the nearest stable ancestor. */
function inspectionSelector(element) {
  const parts = []
  let current = element
  for (let depth = 0; current && depth < 16; depth++, current = current.parentElement) {
    const stable = inspectionAttributeSelector(current)
    if (stable) { parts.unshift(stable); return parts.join(' > ') }
    const tag = current.localName
    if (!tag || !/^[a-z][a-z0-9-]*$/i.test(tag)) return null
    const siblings = current.parentElement
      ? Array.from(current.parentElement.children).filter(item => item.localName === tag) : [current]
    parts.unshift(tag + (siblings.length > 1 ? ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')' : ''))
    const selector = parts.join(' > ')
    if (current === document.body || current === document.documentElement) return document.querySelectorAll(selector).length === 1 ? selector : null
  }
  return null
}

/** DOMRect instances never cross the frame boundary. */
function inspectionRect(rect) {
  const result = {}
  for (const key of ['x', 'y', 'width', 'height', 'top', 'right', 'bottom', 'left']) {
    result[key] = Number.isFinite(rect[key]) ? rect[key] : 0
  }
  return result
}

/** Auto spacing resolves to zero, preserving numeric measure overlay arithmetic. */
function inspectionSpacing(style, kind) {
  const result = {}
  for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
    const value = Number.parseFloat(style[kind + side])
    result[side.toLowerCase()] = Number.isFinite(value) ? value : 0
  }
  return result
}

/** Reply with the current frame tuple and optional correlation; invalid points yield null. */
function handleElementInspection(message, target) {
  const measure = message.type === MEASURE_REQUEST
  let result = null
  const width = document.documentElement.clientWidth || window.innerWidth
  const height = document.documentElement.clientHeight || window.innerHeight
  if (Number.isFinite(message.x) && Number.isFinite(message.y) && message.x >= 0 && message.y >= 0 && message.x < width && message.y < height) {
    const element = document.elementFromPoint?.(message.x, message.y)
    if (element && element !== document.documentElement && element !== document.body) {
      const selector = inspectionSelector(element)
      if (selector) {
        result = { selector, rect: inspectionRect(element.getBoundingClientRect()) }
        if (measure) {
          const parent = element.parentElement
          result.parentRect = inspectionRect(parent?.getBoundingClientRect() ?? { x: 0, y: 0, width, height, top: 0, left: 0, right: width, bottom: height })
          const style = getComputedStyle(element)
          result.padding = inspectionSpacing(style, 'padding')
          result.margin = inspectionSpacing(style, 'margin')
        }
        else if (element.getAttribute('type') !== 'password') {
          const text = (element.textContent ?? '').replace(/\\s+/g, ' ').trim().slice(0, 1000)
          if (text) result.text = text
        }
      }
    }
  }
  postToParent({ type: measure ? MEASURE_RESULT : ELEMENT_PICK_RESULT, ...target,
    ...(typeof message.requestId === 'string' && message.requestId.length <= 200 ? { requestId: message.requestId } : {}), result })
}`
}
