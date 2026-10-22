/** Emits measure-only DOM helpers: keyboard navigation targets and sibling layout. */
export function previewMeasureInspection() {
  return `// Bounded sibling window keeps long lists cheap to measure and serialize every hover.
const MEASURE_SIBLING_LIMIT = 64

/** Zero-size elements (hidden, empty) are never measure targets. */
function isMeasurable(element) {
  const rect = element.getBoundingClientRect()
  return rect.width > 0 || rect.height > 0
}

/** Walk element siblings in one direction until a measurable one. */
function measurableSibling(element, key) {
  let current = element[key]
  while (current && !isMeasurable(current)) current = current[key]
  return current
}

// Measured nodes are remembered by token so navigation follows the node itself, even after
// a re-render reorders siblings (a selector could then point at another element).
const MEASURE_ELEMENT_LIMIT = 256
const measuredElements = new Map()
const measuredTokens = new WeakMap()
let measuredSequence = 0

/** Remember a measured node under a stable token; collected nodes go first, then the oldest. */
function rememberMeasured(element) {
  let token = measuredTokens.get(element)
  if (token && measuredElements.has(token)) return token
  token = 'measured-' + (++measuredSequence)
  measuredTokens.set(element, token)
  measuredElements.set(token, new WeakRef(element))
  if (measuredElements.size > MEASURE_ELEMENT_LIMIT) {
    for (const [key, ref] of measuredElements) if (!ref.deref()) measuredElements.delete(key)
    if (measuredElements.size > MEASURE_ELEMENT_LIMIT) measuredElements.delete(measuredElements.keys().next().value)
  }
  return token
}

/** Histoire mount wrappers around story content; measuring never climbs into them. */
function isMeasureBoundary(element) {
  return element === document.body || element === document.documentElement || (element.id === 'app' && element.parentElement === document.body)
    || Boolean(element.matches?.('.__histoire-preview-canvas, .__histoire-render-story, [data-histoire-runtime-content]'))
}

/** Nearest measurable ancestor inside story content; zero-size wrappers (display: contents) are skipped. */
function measurableParent(element) {
  let parent = element.parentElement
  while (parent && !isMeasureBoundary(parent) && !isMeasurable(parent)) parent = parent.parentElement
  return parent && !isMeasureBoundary(parent) ? parent : null
}

/** Resolve a measured token and optional relation: undefined when the node is gone, null when nothing is related. */
function measureRelatedElement(token, relation, depth) {
  const element = typeof token === 'string' ? measuredElements.get(token)?.deref() : undefined
  if (!element || !element.isConnected) return undefined
  if (relation === undefined) return element
  if (relation === 'parent') {
    // Depth jumps straight to a breadcrumb ancestor.
    let parent = element
    const steps = Number.isInteger(depth) && depth > 0 && depth <= MEASURE_PATH_LIMIT ? depth : 1
    for (let step = 0; parent && step < steps; step++) parent = measurableParent(parent)
    return parent
  }
  if (relation === 'child') return Array.from(element.children).find(isMeasurable) ?? null
  if (relation === 'next') return measurableSibling(element, 'nextElementSibling')
  if (relation === 'previous') return measurableSibling(element, 'previousElementSibling')
  return null
}

// Breadcrumb keeps the closest ancestors only.
const MEASURE_PATH_LIMIT = 8

/** Short element label: tag plus id, else first class. */
function measureLabel(element) {
  const id = element.getAttribute('id')
  const className = typeof element.className === 'string' ? element.className.trim().split(/\\s+/)[0] : ''
  return (element.localName + (id ? '#' + id : className ? '.' + className : '')).slice(0, 64)
}

/** Measurable ancestors and the element itself, outermost first, for the breadcrumb. */
function measurePath(element) {
  const path = [measureLabel(element)]
  for (let current = measurableParent(element); current && path.length < MEASURE_PATH_LIMIT; current = measurableParent(current)) {
    path.unshift(measureLabel(current))
  }
  return path
}

/** Measurable parent children around the element, for repeated gap detection. */
function measureSiblings(element) {
  // Long lists only send a window around the element, so layout reads stay bounded on every hover.
  const all = element.parentElement ? Array.from(element.parentElement.children) : [element]
  const position = all.indexOf(element)
  const half = MEASURE_SIBLING_LIMIT / 2
  const from = Math.max(0, Math.min(position - half, all.length - MEASURE_SIBLING_LIMIT))
  const children = all.slice(from, from + MEASURE_SIBLING_LIMIT).filter(isMeasurable)
  const index = children.indexOf(element)
  if (index < 0) return {}
  return { siblings: children.map(child => inspectionRect(child.getBoundingClientRect())), index }
}`
}
