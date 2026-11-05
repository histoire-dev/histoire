import type { FrameLeaseError, WorkbenchState } from '@histoire/plugin-kit'
import type { HistoireTarget } from '@histoire/protocol'
import type { ResolvedDesigns } from '../../designs/resolve.js'
import type { ResolvedDesign } from '../../types.js'
import { formatIssue } from '../../designs/resolve.js'
import { element } from './design-element.js'

/**
 * Whether a lease failure only means the lease was released first (view switched, selection changed).
 * @param error Rejection of `acquireFrame` or `ready`.
 */
export function isReleased(error: unknown): boolean {
  return (error as FrameLeaseError)?.name === 'FrameLeaseError' && (error as FrameLeaseError).reason === 'released'
}

/**
 * Full-view state replacing the variant and its design, or `null` when a design can be shown.
 * @param target Selected variant.
 * @param designs Its designs; `undefined` while loading.
 * @param active Its active design.
 */
export function viewState(target: HistoireTarget | null | undefined, designs: ResolvedDesigns | undefined, active: ResolvedDesign | undefined): WorkbenchState | null {
  if (!target?.variantId) return { kind: 'empty', icon: 'catalog', title: 'No variant selected' }
  if (!designs) return { kind: 'loading', title: 'Loading designs' }
  if (designs.error !== undefined) return { kind: 'error', title: 'Could not load designs', detail: designs.error }
  if (active) return null
  // Same lines as the inspector tab, so both surfaces explain invalid entries alike.
  if (designs.issues.length) return { kind: 'error', title: 'Design unavailable', detail: designs.issues.map(formatIssue).join('; ') }
  return { kind: 'empty', icon: 'color-palette', title: 'No design', detail: 'Declare meta.design on the story or variant' }
}

/**
 * Error shown in the design box when an image fails to load.
 * @param design Image design.
 */
export function imageError(design: ResolvedDesign): HTMLElement {
  const node = element('div', 'histoire-designs-canvas-error')
  node.setAttribute('role', 'alert')
  node.append(element('span', '', `Could not load ${design.name}`), element('span', 'histoire-designs-canvas-url', design.externalUrl))
  return node
}
