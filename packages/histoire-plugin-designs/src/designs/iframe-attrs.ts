import type { ResolvedEmbedDesign } from '../types.js'

/** Sandbox tokens of every embedded design: scripts, popups (open in tool) and forms (sign-in). */
const SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms'

/**
 * Iframe attributes of an embedded design, shared by the inspector tab and canvas view.
 * Design tools run scripts and need their own origin (cookies for sign-in, live viewer); that
 * origin is distinct from the workbench, so they still cannot reach it nor navigate it. A
 * design served from the workbench origin keeps an opaque origin instead: with both
 * `allow-scripts` and `allow-same-origin`, it could script the workbench and lift its sandbox.
 * @param design Embedded design.
 * @param origin Workbench origin; defaults to the current document's.
 */
export function iframeAttributes(design: ResolvedEmbedDesign, origin: string | undefined = globalThis.location?.origin): Record<string, string> {
  const sameOrigin = new URL(design.src).origin === origin
  return {
    src: design.src,
    title: design.name,
    sandbox: sameOrigin ? SANDBOX : `${SANDBOX} allow-same-origin`,
    referrerpolicy: 'strict-origin-when-cross-origin',
    loading: 'lazy',
    ...(design.allowFullscreen ? { allow: 'fullscreen', allowfullscreen: '' } : {}),
  }
}
