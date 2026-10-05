import type { Component } from '@histoire/vendors/vue'
import type { ReactNode } from 'react'
import { configureControlsApp } from '@histoire/controls'
import { createApp, defineComponent, h, onBeforeUnmount, onMounted, ref, shallowReactive, shallowRef } from '@histoire/vendors/vue'
import { Children, createElement, Fragment, isValidElement, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/** Common control props; additional props and Vue listeners pass through. */
export interface ReactControlProps {
  /** Current value passed to Vue's modelValue. */
  value?: any
  /** Receive Vue update:modelValue events. */
  onChange?: (value: any) => void
  /** Control-specific props and event handlers. */
  [key: string]: any
}

/** Ignore empty React nodes, including fragments, so Vue can render slot fallbacks. */
function hasSlotContent(children: ReactNode): boolean {
  // React traversal handles iterable children and removes null/boolean nodes.
  // eslint-disable-next-line react/no-children-to-array
  return Children.toArray(children).some((child) => {
    if (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment) {
      return hasSlotContent(child.props.children)
    }
    return child !== ''
  })
}

/** One independently owned React portal for each Vue slot occurrence. */
interface SlotTarget {
  /** Stable portal key, preserving React state when Vue reorders or removes slots. */
  id: number
  /** Vue-owned host containing React-owned children. */
  element: HTMLElement
}

/** Mount one Vue control inside a React-owned host and mirror changing props. */
export function wrapVueControl(control: Component) {
  /** React facade for a Vue control, sharing bundled Vue with Histoire. */
  function WrappedControl(props: ReactControlProps) {
    const { children } = props
    const target = useRef<HTMLDivElement>(null)
    const [slotTargets, setSlotTargets] = useState<SlotTarget[]>([])
    const state = useRef(shallowReactive<Record<string, any>>({}))
    const slotsEnabled = useRef(shallowRef(false))
    const nextSlotId = useRef(0)
    useLayoutEffect(() => {
      const { value, onChange, children, ...rest } = props
      // Remove omitted props so toggling a control option restores its default.
      for (const key of Object.keys(state.current)) delete state.current[key]
      Object.assign(state.current, rest, { 'modelValue': value, 'onUpdate:modelValue': onChange })
      slotsEnabled.current.value = hasSlotContent(children)
    })
    useLayoutEffect(() => {
      let active = true
      setSlotTargets([])
      // Vue instantiates one host component per occurrence, including repeated slots.
      const SlotHost = defineComponent({
        /** Register each host without sharing a single ref across repeated slots. */
        setup() {
          const element = ref<HTMLElement>()
          const id = nextSlotId.current++
          onMounted(() => {
            if (active) setSlotTargets(targets => [...targets, { id, element: element.value! }])
          })
          onBeforeUnmount(() => {
            if (active) setSlotTargets(targets => targets.filter(target => target.id !== id))
          })
          return () => h('span', { ref: element })
        },
      })
      const app = createApp({
        render: () => h(control, state.current, slotsEnabled.current.value
          ? {
              // Vue owns slot host; React portal owns its contents and event handlers.
              default: () => h(SlotHost),
            }
          : undefined),
      })
      configureControlsApp(app)
      app.mount(target.current!)
      return () => {
        active = false
        app.unmount()
      }
    }, [])
    return createElement('div', { ref: target }, slotTargets.map(({ id, element }) => createPortal(children, element, String(id))))
  }
  return WrappedControl
}
