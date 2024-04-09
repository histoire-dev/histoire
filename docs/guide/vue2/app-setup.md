# App setup

## Global setup

You can define a setup function globally in your setup file defined by the `setupFile` option in the global configuration ([learn more](../config.md#global-js-and-css)).

For Vue 2, it must be called `setupVue2`. Histoire provides an optional `defineSetupVue2` helper to have better types in your IDE:

```ts
import { defineSetupVue2 } from '@histoire/plugin-vue2'
import Vue from 'vue'
import Vuei18n from 'vue-i18n'
import { store } from './store'
import { router } from './router'

export const setupVue2 = defineSetupVue2(({ story, variant }) => {
  // Vue plugin
  Vue.use(Vuei18n)

  // Global component
  Vue.component('GlobalComponent', MyGlobalComponent)

  // App options
  return {
    store, // Vuex Store
    router, // Vue Router
    provide: {
      key: 'meow',
    },
  }
})
```

::: tip
You can also import global CSS files or JS files in this setup file.
:::

## Local setup

Inside each story, you can define a `setupApp` prop that will be called by Histoire allowing you to configure the sandbox application as well. It will **not** override the global setup function, but will be called after it. It works the same way with the same parameters.

```vue{17}
<script setup>
import InjectDemo from './InjectDemo.vue'

function mySetupApp ({ story, variant }) {
  // App options
  return {
    provide: {
      key: 'meow',
    },
  }
}
</script>

<template>
  <Story title="Story setup">
    <Variant title="Global setup">
      <InjectDemo />
    </Variant>

    <Variant
      title="Local setup"
      :setup-app="mySetupApp"
    >
      <InjectDemo />
    </Variant>
  </Story>
</template>
```

You can put the prop on the `<Story>` component too, so that `<Variant>` will have a default value for it. Redefining the prop on a `<Variant>` will **override** the function though.

## Examples

### Vue Router

```vue{5-11,18}
<script setup>
import VueRouter from 'vue-router'

function setupApp ({ story, variant }) {
  // Router mock
  const router = new VueRouter({
    routes: [
      { path: '/', name: 'home', component: { render: () => null } },
    ],
  })
  // App options
  return {
    router,
  }
}
</script>

<template>
  <Story
    title="Vue router example"
    :setup-app="setupApp"
  >
    <pre>{{ $route }}</pre>
  </Story>
</template>
```

### Vuex

```vue{5-10,17}
<script setup>
import Vuex from 'vuex'

function setupApp ({ app, story, variant }) {
  // Store mock
  const store = new Vuex.Store({
    state: () => ({
      hello: 'meow',
    }),
  })
  // App options
  return {
    store,
  }
}
</script>

<template>
  <Story
    title="Vuex example"
    :setup-app="setupApp"
  >
    <pre>{{ $store.state }}</pre>
  </Story>
</template>
```
