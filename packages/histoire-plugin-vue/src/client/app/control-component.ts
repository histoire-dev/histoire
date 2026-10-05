import type { Component, App as ControlsApp } from '@histoire/vendors/vue'
import { configureControlsApp } from '@histoire/controls'
import { h as controlsH, createApp, reactive } from '@histoire/vendors/vue'
import { defineComponent, h, nextTick, onBeforeUnmount, onBeforeUpdate, onMounted, onUpdated, ref } from 'vue'

/** One slot invocation transported between independent Vue runtimes. */
interface SlotCall {
  /** Stable placeholder identity through independent child updates. */
  id: number
  /** Name of slot supplied by story. */
  name: string
  /** Original slot arguments remain inside owning frame. */
  props: unknown
}

/** Wrap controls without sharing VNodes between story Vue and vendor Vue. */
export function wrapControlComponent(controlComponent: Component) {
  return defineComponent({
    name: controlComponent.name,
    inheritAttrs: false,
    setup(_props, { attrs, slots, expose }) {
      const element = ref<HTMLDivElement>()
      const slotElement = ref<HTMLDivElement>()
      const state = reactive<Record<string, unknown>>({ ...attrs })
      const calls = ref<SlotCall[]>([])
      const targets = new Map<number, Element>()
      const invocations = new Map<number, SlotCall>()
      let slotId = 0
      let scheduled = false
      let active = true
      let app: ControlsApp | undefined
      let control: { focus?: () => void, select?: () => void } | undefined

      /** Removed attrs must disappear from native field as well. */
      function applyState(): void {
        for (const key of Object.keys(state)) {
          if (!(key in attrs)) delete state[key]
        }
        Object.assign(state, attrs)
      }
      /** Move rendered story slots into vendor placeholders after both updates. */
      function moveSlotContent(): void {
        calls.value.forEach((call) => {
          const rendered = slotElement.value?.querySelector(`[renderslotid="${call.id}"]`)
          const target = targets.get(call.id)
          if (rendered && target) target.replaceChildren(rendered)
        })
      }
      /** Child poppers can render independently; publish their mounted slots too. */
      function updateSlot(call: SlotCall, value: Element | null): void {
        if (value) {
          targets.set(call.id, value)
          invocations.set(call.id, call)
        }
        else {
          targets.delete(call.id)
          invocations.delete(call.id)
        }
        if (scheduled) return
        scheduled = true
        void nextTick(() => {
          scheduled = false
          if (active) calls.value = [...invocations.values()]
        })
      }
      expose({
        /** Focus real interactive control inside vendor runtime. */
        focus: () => control?.focus?.(),
        /** Select real field contents inside vendor runtime. */
        select: () => control?.select?.(),
      })
      onBeforeUpdate(applyState)
      onUpdated(moveSlotContent)
      onMounted(() => {
        app = createApp({
          render() {
            // Only supplied slots exist. A synthetic default hides field fallback
            // content and asks story runtime to call a slot that does not exist.
            const transported = Object.fromEntries(Object.keys(slots).map(name => [name, (props: unknown) => {
              const call = { id: slotId++, name, props }
              // Popper slots teleport outside component root and update without
              // rerendering that root. Track actual committed placeholders.
              return controlsH('div', { ref: value => updateSlot(call, value as Element | null) })
            }]))
            return controlsH(controlComponent, { ...state, ref: value => control = value as typeof control }, transported)
          },
        })
        configureControlsApp(app)
        app.mount(element.value!)
      })
      onBeforeUnmount(() => {
        active = false
        app?.unmount()
      })
      return { element, slotElement, calls }
    },
    render() {
      return [
        h('div', { ref: 'element' }),
        h('div', { ref: 'slotElement' }, this.calls.map(call => h('div', { key: call.id, renderSlotId: call.id }, this.$slots[call.name]?.(call.props)))),
      ]
    },
  })
}
