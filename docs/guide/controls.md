# State & Controls

Controls give you the ability to interact with your components arguments.

## Defining a state

The first step is to define the state that will be share to your story. You need to create a `state` data property or reactive object that will be automatically be picked up by Histoire. Then you can proceed using it as usual:

```vue{5-8,14-15}
<script lang="ts" setup>
import { reactive } from 'vue'
import MyButton from './MyButton.vue'

const state = reactive({
  disabled: false,
  content: "Hello world"
})
</script>

<template>
  <Story>
    <Variant>
      <MyButton :disabled="state.disabled">
        {{ state.content }}
      </MyButton>
    </Variant>
  </Story>
</template>
```

::: tip
The reason you need to use the `state` name is that the preview might be rendered in a different context than the control pane, for example in an iframe. Therefore Histoire needs to handle the state and synchronize it between the different contexts. Currently, Histoire only detects the `state` property of your story component. If you use a different name, if will not be synchronized between the preview, the controls and the source code panes.
:::

In the following example, since we are not using `state` as the name of our data, it won't be handled by Histoire:

```vue{5-6}
<script lang="ts" setup>
import { ref } from 'vue'
import MyButton from './MyButton.vue'

// This is not named `state` therefore it will not be synchronized
const notSynced = ref('Meow')
</script>

<template>
  <Story>
    <Variant>
      <input v-model="notSynced">
    </Variant>
  </Story>
</template>
```

It can however be useful to declare some data that isn't going to be reactive, for example some fixture data or configuration:

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
      <MyButtons :color="colors[state.colorId]">
        {{ state.colorId }}
      </MyButtons>
    </Variant>
  </Story>
</template>
```

## Controls panel

To create the control panel, Histoire provides a `controls` slot. You are free to render any element or components inside the slot.

```vue{18-21}
<script lang="ts" setup>
import { reactive } from 'vue'
import MyButton from './MyButton.vue'

const state = reactive({
  disabled: false,
  content: "Hello world"
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

## Builtin controls

To build a control panel a bit more easily, Histoire provides builtin controls with design that fits the rest of the UI.

```vue{19-20}
<script lang="ts" setup>
import { reactive } from 'vue'
import MyButton from './MyButton.vue'

const state = reactive({
  disabled: false,
  content: "Hello world"
})
</script>

<template>
  <Story>
    <Variant>
      <MyButton :disabled="state.disabled">
        {{ state.content }}
      </MyButton>

      <template #controls>
        <HstText v-model="state.text" title="Content" />
        <HstCheckbox v-model="state.disabled" title="Disabled" />
      </template>
    </Variant>
  </Story>
</template>
```

Check out all the available controls in their book: [controls.histoire.dev](https://controls.histoire.dev/).
