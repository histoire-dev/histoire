// From: https://github.com/vuejs/test-utils/blob/main/src/components/RouterLinkStub.ts

import type { App, Component } from 'vue'
import { computed, defineComponent, h } from 'vue'

// match return type of router.resolve: RouteLocation & { href: string }
const defaultRoute = {
  path: '/',
  name: undefined as string | undefined,
  redirectedFrom: undefined as object | undefined,
  params: {},
  query: {},
  hash: '',
  fullPath: '/',
  matched: [] as object[],
  meta: {},
  href: '/',
}

// TODO: Borrow typings from vue-router-next
export const RouterLinkStub = defineComponent({
  name: 'RouterLinkStub',

  compatConfig: { MODE: 3 },

  props: {
    to: {
      type: [String, Object],
      required: true,
    },
    custom: {
      type: Boolean,
      default: false,
    },
  },

  render() {
    const route = computed(() => defaultRoute)
    // mock reasonable return values to mimic vue-router's useLink
    const children = this.$slots?.default?.({
      route,
      href: computed(() => route.value.href),
      isActive: computed(() => false),
      isExactActive: computed(() => false),
      navigate: async () => {},
    })
    return this.custom ? children : h('a', undefined, children)
  },
})

/** Make RouterLink available to every story pass until a user plugin registers its own. */
export function installRouterLinkFallback(app: App) {
  const name = 'RouterLink'
  const register = app.component
  register(name, RouterLinkStub)

  /** Release only the fallback so Vue still diagnoses duplicates of real components. */
  function registerComponent(componentName: string): Component | undefined
  function registerComponent(componentName: string, component: Component): App
  function registerComponent(componentName: string, component?: Component) {
    if (!component) return register(componentName)
    if (componentName === name && component !== RouterLinkStub) {
      // Vue checks the registry for duplicates before assigning the component.
      if (register(name) === RouterLinkStub) delete app._context.components[name]
      if (app.component === registerComponent) app.component = register
    }
    return register(componentName, component)
  }

  app.component = registerComponent
}
