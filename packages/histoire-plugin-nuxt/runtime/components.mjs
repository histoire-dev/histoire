import { defineComponent, h } from 'vue'

export const NuxtLink = defineComponent({
  name: 'NuxtLink',
  props: {
    to: [String, Object],
  },
  setup(props, ctx) {
    return () => h('a', {
      href: typeof props.to === 'string' ? props.to : '#',
      ...ctx.attrs,
    }, [ctx.slots.default?.()])
  },
})
