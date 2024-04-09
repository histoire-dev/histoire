# State & Controls

Controls give you the ability to interact with your components arguments.

## Defining a state

The first step is to define the state that will be shared to your story. Histoire will automatically synchronize the `data` or reactive data returned in your `setup`. Then you can proceed using your state as usual.

Example with Option API:

```vue{10-17}
<script lang="ts">
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
import { reactive, count } from 'vue'
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
import { count, reactive } from 'vue'
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

## Builtin controls

To build a control panel a bit more easily, Histoire provides builtin controls with design that fits the rest of the UI.

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
        <HstText v-model="state.text" title="Content" />
        <HstCheckbox v-model="state.disabled" title="Disabled" />
      </template>
    </Variant>
  </Story>
</template>
```

Check out all the available controls in their book: [controls.histoire.dev](https://controls.histoire.dev/).

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
