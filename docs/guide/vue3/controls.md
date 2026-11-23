# State & Controls

Use controls to change a variant’s state while it runs on the canvas.

## Controls sandbox <Badge type="tip" text="1.0-beta.2+" />

Custom `#controls` slots run in a dedicated sandbox. Their background, typography and color scheme follow the Histoire panel. Built-in dropdowns and tooltips render in the host window, so they can extend beyond the controls form.

## Shared component contracts <Badge type="tip" text="1.0-beta.2+" />

Built-in `Hst*` controls use the workbench style with bundled Manrope and JetBrains Mono fonts. Appearance and density follow their provider. Standalone controls use the workbench defaults.

Wrapped fields accept `layout="stacked"`, `layout="horizontal"`, or `layout="inline"`. Text, number, textarea, select, JSON and button groups default to stacked labels; checkbox and switch rows default to horizontal. Inline fields fit toolbars and external labels without reserving label space. Prop type metadata uses `data-histoire-control-type` in normal label flow.

`HstText` accepts native `type`, including `search` and `password`. Native input attributes/listeners reach the field once. Interactive controls expose `focus()`; text, textarea, number and color text fields also expose `select()`.

`HstSwitch` edits Boolean state with native switch semantics. `HstCheckbox` retains Boolean and string Boolean compatibility. `HstSelect` and `HstButtonGroup` accept string/numeric arrays, records and `{ value, label, disabled? }` options. Values retain their types and local object identity. Select adds `disabled`, `placeholder`, selected-label default slot and `option` slot. Rich slots stay local; host menus receive labels and opaque IDs only. Disabled options remain visible and cannot be selected.

Native Vue hosts import `@histoire/controls/vue` and its provider-scoped stylesheet. Import both to apply the controls styles in your host. Story components keep their own styles.

## Custom overlays <Badge type="tip" text="1.0-beta.2+" />

Use `getControlsHost()` inside a custom controls component to display a text tooltip or a dropdown in the host. The adapter is available only in the controls sandbox. Keep option values in your component and pass string IDs and labels to the host.

```vue
<script setup lang="ts">
import type { HistoireControlsOverlayHandle } from 'histoire/client'
import { getControlsHost } from 'histoire/client'
import { onBeforeUnmount, ref } from 'vue'

const anchor = ref<HTMLButtonElement>()
let overlay: HistoireControlsOverlayHandle | undefined

function showTooltip() {
  if (!anchor.value) return
  overlay?.close()
  overlay = getControlsHost()?.open(anchor.value, {
    kind: 'tooltip',
    content: 'Custom control',
    placement: 'top',
  }, () => { overlay = undefined })
}

function hideTooltip() {
  overlay?.close()
  overlay = undefined
}

onBeforeUnmount(hideTooltip)
</script>

<template>
  <button ref="anchor" @mouseenter="showTooltip" @mouseleave="hideTooltip">
    Custom control
  </button>
</template>
```

Call `handle.update(overlay)` when content changes and `handle.close()` on unmount. Dropdown overlays use `{ kind: 'select', label, items: [{ id, label }], selectedId }`; the callback receives `itemId` on selection. Content is plain text. Third-party popovers rendering their own DOM remain inside the sandbox unless adapted to this API.

## Defining a state

Define the state your story and controls share. Histoire synchronizes Options API `data` and reactive data returned from `setup`.

Top-level `<script setup>` refs to component instances stay in the story. Use Vue's `markRaw()` to keep another top-level object out of shared state.

Options API example:

```vue{11-18}
<script lang="ts">
import { defineComponent } from 'vue'
import MyButton from './MyButton.vue'

export default defineComponent({
  components: {
    MyButton,
  },

  data () {
    // Histoire will inspect and synchronize this
    return {
      state: {
        disabled: false,
        content: 'Hello world',
      },
      message: 'Meow!',
    }
  },
})
</script>

<template>
  <Story>
    <Variant>
      <MyButton :disabled="state.disabled">
        {{ state.content }}
      </MyButton>

      <input v-model.number="message">
    </Variant>
  </Story>
</template>
```

Example with Composition API:

```vue{18-22}
<script lang="ts">
import { reactive, ref, defineComponent } from 'vue'
import MyButton from './MyButton.vue'

export default defineComponent({
  components: {
    MyButton,
  },

  setup () {
    const state = reactive({
      disabled: false,
      content: 'Hello world',
    })

    const message = ref('Meow!')

    // Histoire will inspect and synchronize this
    return {
      state,
      message,
    }
  }
})
</script>

<template>
  <Story>
    <Variant>
      <MyButton :disabled="state.disabled">
        {{ state.content }}
      </MyButton>

      <input v-model.number="message">
    </Variant>
  </Story>
</template>
```

Example with Composition API (Script Setup):

```vue
<script lang="ts" setup>
import { reactive, ref } from 'vue'
import MyButton from './MyButton.vue'

const state = reactive({
  disabled: false,
  content: 'Hello world',
})

const message = ref('Meow!')
</script>

<template>
  <Story>
    <Variant>
      <MyButton :disabled="state.disabled">
        {{ state.content }}
      </MyButton>

      <input v-model.number="message">
    </Variant>
  </Story>
</template>
```

It can also be useful to declare some data that isn't going to be reactive, for example some fixture data or configuration:

```vue{10-15}
<script lang="ts" setup>
import { reactive } from 'vue'
import MyButton from './MyButton.vue'

// Main reactive state of the stories
const state = reactive({
  colorId: 'primary',
})

// Some fixture/configuration data
const colors = {
  primary: '#f00',
  secondary: '#0f0',
  // ...
}
</script>

<template>
  <Story>
    <Variant>
      <MyButton :color="colors[state.colorId]">
        {{ state.colorId }}
      </MyButton>
    </Variant>
  </Story>
</template>
```

## Controls panel

Add inputs or components to the `controls` slot to build a custom control panel.

```vue{18-21}
<script lang="ts" setup>
import { reactive } from 'vue'
import MyButton from './MyButton.vue'

const state = reactive({
  disabled: false,
  content: 'Hello world',
})
</script>

<template>
  <Story>
    <Variant>
      <MyButton :disabled="state.disabled">
        {{ state.content }}
      </MyButton>

      <template #controls>
        Content: <input type="text" v-model="state.content" />
        Disabled: <input type="checkbox" v-model="state.disabled" />
      </template>
    </Variant>
  </Story>
</template>
```

You can also share the same default controls for all variants by putting the slot directly under the `<Story>` component:

```vue{3-6}
<template>
  <Story>
    <template #controls>
      Content: <input type="text" v-model="state.content" />
      Disabled: <input type="checkbox" v-model="state.disabled" />
    </template>

    <Variant>
      <MyButton :disabled="state.disabled">
        {{ state.content }}
      </MyButton>
      <!-- Reusing controls -->
    </Variant>

    <Variant>
      <MyButton :disabled="state.disabled">
        {{ state.content }}
      </MyButton>
      <!-- Reusing controls -->
    </Variant>
  </Story>
</template>
```

A variant can then override the slot if needed.

## Built-in controls {#builtin-controls}

Use built-in fields and buttons when you want controls that match the workbench.

```vue{19-20}
<script lang="ts" setup>
import { reactive } from 'vue'
import MyButton from './MyButton.vue'

const state = reactive({
  disabled: false,
  content: 'Hello world',
})
</script>

<template>
  <Story>
    <Variant>
      <MyButton :disabled="state.disabled">
        {{ state.content }}
      </MyButton>

      <template #controls>
        <HstText v-model="state.content" title="Content" />
        <HstCheckbox v-model="state.disabled" title="Disabled" />
      </template>
    </Variant>
  </Story>
</template>
```

Browse the [built-in controls book](https://controls.histoire.dev/) for examples.

## Init state

As an alternative to the above, you can pass an `initState` prop to the Story or Variant, which should be a function returning a state object. It's useful to have different states for variants in the same story and to be a bit more explicit at the expense of being more verbose.

You can then use the `state` slot props on the `<Variant>` slots to access the state.

Example:

```vue{24,26,40,60,62,66}
<script lang="ts" setup>
function initState () {
  return {
    count: 0,
    text: '',
  }
}

function initState2 () {
  return {
    meow: {
      foo: 'bar',
    },
  }
}
</script>

<template>
  <Story
    title="State"
  >
    <Variant
      title="default"
      :init-state="initState"
    >
      <template #default="{ state }">
        <h1>State</h1>
        <div>
          <pre>{{ state }}</pre>
          <input
            v-model.number="state.count"
            type="number"
          >
          <input
            v-model="state.text"
          >
        </div>
      </template>

      <template #controls="{ state }">
        <div class="controls">
          <button @click="state.count--">
            -1
          </button>
          <button @click="state.count++">
            +1
          </button>
          <span>{{ state.count }}</span>
        </div>

        <HstText
          v-model="state.text"
          title="Text"
        />
      </template>
    </Variant>

    <Variant
      title="Nested state object"
      :init-state="initState2"
    >
      <template #default="{ state }">
        <input v-model="state.meow.foo">
      </template>

      <template #controls="{ state }">
        <HstText
          v-model="state.meow.foo"
          title="meow.foo"
        />
      </template>
    </Variant>
  </Story>
</template>
```

`HstButton` supports `color="flat" tone="accent"` for accent-text actions, or `tone="danger"` for danger-text actions. `HstButtonGroup` and `HstWrapper` accept `block` for full-width layouts. See [Native panel styling](../../reference/panel-styling.md) for root class/style forwarding and sizing hooks.
