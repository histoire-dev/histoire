import type { App, Ref } from 'vue'
import { useAttrs, useId } from 'vue'

/** Distinguish adapter apps sharing one document without requiring HTTPS. */
let nextControlsAppId = 0

/** Isolated framework adapters mount several Vue apps in one controls document. */
export function configureControlsApp(app: App): void {
  // Vue useId is unique inside one app. Each adapter-owned app needs its own
  // prefix so labels never resolve to a neighboring control's input.
  app.config.idPrefix = `histoire-controls-${globalThis.performance.timeOrigin}-${++nextControlsAppId}`
}

/** Separate wrapper decoration from attributes/listeners owned by actual field. */
export function useControlField(element: Ref<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement | undefined>, title: () => string | undefined) {
  const attrs = useAttrs()
  const generatedId = `histoire-control-${useId()}`
  /** Resolve current attrs during render because useAttrs is not watchable. */
  function id(): string {
    return String(attrs.id ?? generatedId)
  }
  /** Forward current native attrs once, including attrs changed by host. */
  function fieldAttrs() {
    const { class: _class, style: _style, 'data-histoire-control-type': _type, ...values } = attrs
    return { ...values, 'id': id(), 'aria-label': typeof attrs['aria-label'] === 'string' ? attrs['aria-label'] : title() }
  }
  /** Disabled fields never gain focus through wrapper activation. */
  function focus(): void {
    if (!element.value?.disabled) element.value?.focus()
  }
  /** Selection remains native, preserving input-specific browser behavior. */
  function select(): void {
    if (element.value && !element.value.disabled && 'select' in element.value) element.value.select()
  }
  return { attrs, id, fieldAttrs, focus, select }
}

/** Resolve DOM ownership when a consumer replaces a native element with a control. */
export function getControlElement(value: any): HTMLElement | undefined {
  if (value?.element) return value.element
  const root = value?.$el ?? value
  // Parent function refs can run before child exposes its native element ref.
  // DOM already exists then; resolve interactive node without focusing wrapper.
  if (root?.matches?.('input, textarea, button')) return root
  return root?.querySelector?.('input, textarea, button') ?? root ?? undefined
}
