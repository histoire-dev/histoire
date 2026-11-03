// Shared workbench state and pane layout components for workbench Vue plugin views. Each one
// renders the implementation its host provides under `WORKBENCH_COMPONENTS_KEY` (the standalone
// workbench's own components, or a native host's), so plugin views match built-in panels without
// importing the host. Outside any host they render plain, unstyled, accessible markup.
import type { Component, PropType, SlotsType, VNode } from 'vue'
import type { WorkbenchComponents } from '../render/workbench-components.js'
import { createLoadingDelay } from '@histoire/shared/loading-delay'
import { defineComponent, h, inject, onScopeDispose, ref } from 'vue'
import { WORKBENCH_COMPONENTS_KEY } from '../render/workbench-components.js'

/** Optional slot render function. */
type Slot = (() => VNode[]) | undefined

/** Slots of the state components. */
interface StateSlots {
  /** Optional detail line. */
  default?: () => VNode[]
  /** Optional follow-up or recovery buttons (empty and error states only). */
  actions?: () => VNode[]
}

/**
 * Host implementation of one component, read once in setup.
 * @param name Exported component name.
 */
function useImplementation(name: keyof WorkbenchComponents): Component | undefined {
  return inject<WorkbenchComponents | null>(WORKBENCH_COMPONENTS_KEY, null)?.[name] as Component | undefined
}

/**
 * Props without `undefined` entries, so host defaults (such as the error icon) apply.
 * @param props Wrapper props.
 */
function definedProps(props: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(props).filter(([, value]) => value !== undefined))
}

/**
 * Plain state fallback: headline, detail and actions in a `status` or `alert` region.
 * @param role Live region role.
 * @param title Headline.
 * @param detail Detail slot.
 * @param actions Actions slot.
 */
function plainState(role: 'status' | 'alert', title: string, detail: Slot, actions?: Slot) {
  return h('div', { role }, [
    h('strong', title),
    detail ? h('p', detail()) : null,
    actions ? h('div', actions()) : null,
  ])
}

/** Empty area (no results, no selection), rendered with the host's empty state. */
export const WorkbenchEmptyState = defineComponent({
  name: 'WorkbenchEmptyState',
  props: {
    /** Offline Carbon glyph name. */
    icon: { type: String, required: true },
    /** Short headline, no trailing period. */
    title: { type: String, required: true },
    /** Badge color: `accent` (default) or `neutral` for areas that are empty by default. */
    tone: { type: String as PropType<'accent' | 'neutral'>, default: undefined },
  },
  slots: Object as SlotsType<StateSlots>,
  setup(props, { slots }) {
    const implementation = useImplementation('WorkbenchEmptyState')
    return () => implementation ? h(implementation, definedProps(props), slots) : plainState('status', props.title, slots.default, slots.actions)
  },
})

/** Panel loading placeholder, rendered with the host's loading state. */
export const WorkbenchLoadingState = defineComponent({
  name: 'WorkbenchLoadingState',
  props: {
    /** Short headline naming the operation in progress. */
    title: { type: String, required: true },
  },
  slots: Object as SlotsType<Pick<StateSlots, 'default'>>,
  setup(props, { slots }) {
    const implementation = useImplementation('WorkbenchLoadingState')
    const visible = ref(false)
    const delay = createLoadingDelay(value => visible.value = value)
    if (!implementation) delay.setPending(true)
    onScopeDispose(delay.dispose)
    return () => implementation ? h(implementation, definedProps(props), slots) : visible.value ? plainState('status', props.title, slots.default) : null
  },
})

/** Panel failure announced as an alert, rendered with the host's error state. */
export const WorkbenchErrorState = defineComponent({
  name: 'WorkbenchErrorState',
  props: {
    /** Offline Carbon glyph name; the host defaults to an error glyph. */
    icon: { type: String, default: undefined },
    /** Short headline naming the failed operation, no trailing period. */
    title: { type: String, required: true },
  },
  slots: Object as SlotsType<StateSlots>,
  setup(props, { slots }) {
    const implementation = useImplementation('WorkbenchErrorState')
    return () => implementation ? h(implementation, definedProps(props), slots) : plainState('alert', props.title, slots.default, slots.actions)
  },
})

/** Fixed-height pane header with a title and trailing actions. */
export const WorkbenchPaneHeader = defineComponent({
  name: 'WorkbenchPaneHeader',
  props: {
    /** Pane title. */
    title: { type: String, required: true },
  },
  slots: Object as SlotsType<{ default?: () => VNode[] }>,
  setup(props, { slots }) {
    const implementation = useImplementation('WorkbenchPaneHeader')
    return () => implementation ? h(implementation, definedProps(props), slots) : h('header', [h('h2', props.title), slots.default?.()])
  },
})

/** Filter or section switch row of a pane; a button group fills it. */
export const WorkbenchPaneToolbar = defineComponent({
  name: 'WorkbenchPaneToolbar',
  slots: Object as SlotsType<{ default?: () => VNode[] }>,
  setup(_props, { slots }) {
    const implementation = useImplementation('WorkbenchPaneToolbar')
    return () => implementation ? h(implementation, null, slots) : h('div', slots.default?.())
  },
})

/** Scrolling list body inset by the pane gutter; rows pad their content by the row inset. */
export const WorkbenchPaneList = defineComponent({
  name: 'WorkbenchPaneList',
  slots: Object as SlotsType<{ default?: () => VNode[] }>,
  setup(_props, { slots }) {
    const implementation = useImplementation('WorkbenchPaneList')
    return () => implementation ? h(implementation, null, slots) : h('div', slots.default?.())
  },
})
