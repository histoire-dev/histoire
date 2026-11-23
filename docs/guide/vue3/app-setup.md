# App setup

## Global setup

Set [`setupFile`](../config.md#global-js-and-css) in your Histoire config to share Vue setup across stories. Export a function named `setupVue3`. Use `defineSetupVue3` to type its parameters in your editor.

```ts
import { defineSetupVue3 } from '@histoire/plugin-vue'
import { createPinia } from 'pinia'

export const setupVue3 = defineSetupVue3(({ app, story, variant }) => {
  // Vue plugin
  app.use(createPinia())

  // Global component
  app.component('GlobalComponent', MyGlobalComponent)

  // Global property
  app.config.globalProperties.$t = key => translate(key)

  // Provide
  app.provide('key', 'meow')
})
```

::: tip
Import any shared CSS or JavaScript in the same file.
:::

## Local setup

Use `setupApp` to configure the Vue app for a story or variant. It receives the same parameters as `setupVue3` and runs after global setup.

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

Set `setupApp` on `<Story>` to share a default. A `<Variant>` with its own `setupApp` uses that callback in place of the story default.

## Dark mode <Badge type="tip" text="1.0-beta.2+" />

`onDarkChange` calls your listener with Histoire's current dark mode, then again each time it changes. The listener stops when the story app is unmounted. Use it to sync the theme of a UI library:

```ts
import { defineSetupVue3 } from '@histoire/plugin-vue'
import { createVuetify } from 'vuetify'

export const setupVue3 = defineSetupVue3(({ app, onDarkChange }) => {
  const vuetify = createVuetify()
  app.use(vuetify)

  onDarkChange((dark) => {
    vuetify.theme.change(dark ? 'dark' : 'light')
  })
})
```

Outside of setup functions, use [`onDarkChange` from `histoire/client`](../../reference/client.md#ondarkchange).

## Lifecycle hooks <Badge type="tip" text="1.0-beta.2+" />

Each variant renders in its own Vue app. `hooks` lets setup code (and framework plugins) follow that app's lifecycle:

| Hook | Called |
| --- | --- |
| `onBeforeMount(cb)` | After all setup functions, right before the app mounts. |
| `onMounted(cb)` | Once the story finished rendering, including async setup. |
| `onReady(cb)` | After `onMounted` callbacks, before the variant is reported ready. |
| `onCleanup(cb)` | Once, when the app is unmounted or its setup failed. Use it to release resources. |
| `setRunWithContext(runner)` | Wraps the next setup functions (setup file, `setupApp`) in a context, for example an injection context. Several runners compose. |

Stage callbacks can be async. Histoire waits for them in order. Register `onCleanup` right after acquiring a resource: if the story is closed while setup is still running, cleanup callbacks registered later still run once setup finishes. After that, `onCleanup` runs the callback right away.

While Histoire collects stories (on Node.js), setup functions run but stage hooks don't, and `onDarkChange` listeners are never called.

```ts
import { defineSetupVue3 } from '@histoire/plugin-vue'

export const setupVue3 = defineSetupVue3(({ hooks }) => {
  const socket = new WebSocket('ws://localhost:1234')
  hooks.onCleanup(() => socket.close())
})
```

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
