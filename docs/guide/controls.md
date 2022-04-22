# State & Controls

Controls give you the ability to interact with your components arguments.

## Defining a state

The first step is to define the state that will be share to your story. Histoire will automatically synchronize the `data` or reactive data returned in your `setup`. Then you can proceed using your state as usual.

Example with Option API:

```vue{10-17}
<script lang="ts" setup>
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
        content: "Hello world"
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
<script lang="ts" setup>
import { reactive, count } from 'vue'
import MyButton from './MyButton.vue'

export default defineComponent({
  components: {
    MyButton,
  },

  setup () {
    const state = reactive({
      disabled: false,
      content: "Hello world"
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

If you are using the `<script setup>` syntax, the component is closed by default - meaning no properties can be accessed from the outside. We need to use [defineExpose](https://vuejs.org/api/sfc-script-setup.html#defineexpose) so that Histoire is able to access your state properties.

Example with Composition API (Script Setup):

```vue{12-16}
<script lang="ts" setup>
import { reactive, count } from 'vue'
import MyButton from './MyButton.vue'

const state = reactive({
  disabled: false,
  content: "Hello world"
})

const message = ref('Meow!')

// Histoire will inspect and synchronize this
defineExpose({
  state,
  message,
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

It can also be useful to declare some data that isn't going to be reactive, for example some fixture data or configuration:

```vue{14-19}
<script lang="ts" setup>
import { reactive } from 'vue'
import MyButton from './MyButton.vue'

// Main reactive state of the stories
const state = reactive({
  colorId: 'primary',
})

defineExpose({
  state,
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

defineExpose({
  state,
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

```vue{23-24}
<script lang="ts" setup>
import { reactive } from 'vue'
import MyButton from './MyButton.vue'

const state = reactive({
  disabled: false,
  content: "Hello world"
})

defineExpose({
  state,
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
