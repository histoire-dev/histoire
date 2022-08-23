// From: https://github.com/vuejs/vue-test-utils/blob/dev/packages/test-utils/src/components/RouterLinkStub.js

import { defineComponent } from 'vue'

const toTypes = [String, Object]
const eventTypes = [String, Array]

export const RouterLinkStub = defineComponent({
  name: 'RouterLinkStub',
  props: {
    to: {
      type: toTypes,
      required: true,
    },
    tag: {
      type: String,
      default: 'a',
    },
    exact: Boolean,
    exactPath: Boolean,
    append: Boolean,
    replace: Boolean,
    activeClass: String,
    exactActiveClass: String,
    exactPathActiveClass: String,
    event: {
      type: eventTypes,
      default: 'click',
    },
  },
  render (h) {
    // @ts-ignore
    return h(this.tag, undefined, this.$slots.default)
  },
})
