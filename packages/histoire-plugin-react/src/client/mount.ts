import type { Story } from '@histoire/shared'
import type { PropType } from '@histoire/vendors/vue'
import { defineComponent, h } from '@histoire/vendors/vue'
import { createReactAdapter } from './host.js'

/** Hidden configuration adapter matching Histoire's MountStory contract. */
export default defineComponent({
  name: 'MountStory',
  props: { story: { type: Object as PropType<Story>, required: true } },
  emits: { ready: () => true },
  setup: (props, { emit }) => ({ el: createReactAdapter(props, 'mount', emit) }),
  render() { return h('div', { ref: 'el' }) },
})
