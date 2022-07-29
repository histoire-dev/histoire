# App setup

## Global setup

You can define a setup function globally in your setup file defined by the `setupFile` option in the global configuration ([learn more](../config.md#global-js-and-css)).

For Vue 3, it must be called `setupVue3`. Histoire provides an optional `defineSetupVue3` helper to have better types in your IDE:

```ts
import { createPinia } from 'pinia'
import { defineSetupVue3 } from '@histoire/plugin-vue'

export const setupVue3 = defineSetupVue3(({ app, story, variant }) => {
  // Vue plugin
  app.use(createPinia())

  // Global component
  app.component('GlobalComponent', MyGlobalComponent)

  // Global property
  app.config.globalProperties.$t = (key) => translate(key)

  // Provide
  app.provide('key', 'meow')
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

function mySetupApp ({ app, story, variant }) {
  app.provide('demo', 'meow')
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
import { createRouter, createMemoryHistory } from 'vue-router'

function setupApp ({ app, story, variant }) {
  // Router mock
  app.use(createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { render: () => null } },
    ],
  }))
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

### Pinia

In global setup file:

```ts{6}
import { createPinia } from 'pinia'
import { defineSetupVue3 } from '@histoire/plugin-vue'

export const setupVue3 = defineSetupVue3(({ app, story, variant }) => {
  // Vue plugin
  app.use(createPinia())
})
```

In component:

```vue
<script setup>
import { useItemStore } from '../stores/item.js'

const itemStore = useItemStore()
</script>

<template>
  <pre>{{ itemStore.items }}</pre>
</template>
```

In story file:

```vue
<script setup>
import MyItems from './MyItems.vue'
</script>

<template>
  <Story
    title="Pinia example"
  >
    <MyItems />
  </Story>
</template>
```

### Vuex

```vue{5-10,17}
<script setup>
import { createStore } from 'vuex'

function setupApp ({ app, story, variant }) {
  // Store mock
  app.use(createStore({
    state: () => ({
      hello: 'meow',
    }),
  }))
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