import type { Story, Variant } from '@histoire/shared'
import type { PropType } from '@histoire/vendors/vue'
import { defineComponent, h } from '@histoire/vendors/vue'
import { createReactAdapter } from './host.js'

/** Preview adapter rendering selected default or controls slot. */
export default defineComponent({
  name: 'RenderStory',
  props: {
    story: { type: Object as PropType<Story>, required: true },
    variant: { type: Object as PropType<Variant>, required: true },
    slotName: { type: String, default: 'default' },
  },
  emits: { ready: () => true },
  setup: (props, { emit }) => ({ el: createReactAdapter(props, 'render', emit) }),
  render() { return h('div', { ref: 'el' }) },
})
