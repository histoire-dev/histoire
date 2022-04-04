# State & Controls

Controls give you the ability to interact with your components arguments.

## Defining a state

The first step is to define the state that will be share to your story. You need to write a function that return the state as an object and put it in the `init-state` attribute of your variant.

State is then provided to your component by using the `state` slot prop.

```vue{4-9,16,18-22}
<script lang="ts" setup>
import MyButton from './MyButton.vue'

function initState () {
  return {
    disabled: false,
    content: "Hello world"
  }
}
</script>

<template>
  <Story title="My button">
    <Variant
      title="default"
      :init-state="initState"
    >
      <template #default="{ state }">
        <MyButton :disabled="state.disabled">
          {{ state.content }}
        </MyButton>
      </template>
    </Variant>
  </Story>
</template>
```

## Creating a panel

To create the control panel, Histoire provides a `controls` slot. You can create your panel however you like in it.

```vue{23-26}
<script lang="ts" setup>
import MyButton from './MyButton.vue'

function initState () {
  return {
    disabled: false,
    content: "Hello world"
  }
}
</script>

<template>
  <Story title="My button">
    <Variant
      title="default"
      :init-state="initState"
    >
      <template #default="{ state }">
        <MyButton :disabled="state.disabled">
          {{ state.content }}
        </MyButton>
      </template>
      <template #controls="{ state }">
        Content: <input type="text" v-model="state.content" />
        Disabled: <input type="checkbox" v-model="state.disabled" />
      </template>
    </Variant>
  </Story>
</template>
```

## Builtin controls

To build a control panel a bit more easily, Histoire provides builtin controls specifically designed for this.

```vue{24-25}
<script lang="ts" setup>
import MyButton from './MyButton.vue'

function initState () {
  return {
    disabled: false,
    content: "Hello world"
  }
}
</script>

<template>
  <Story title="My button">
    <Variant
      title="default"
      :init-state="initState"
    >
      <template #default="{ state }">
        <MyButton :disabled="state.disabled">
          {{ state.content }}
        </MyButton>
      </template>
      <template #controls="{ state }">
        <HstText v-model="state.text" title="Content" />
        <HstCheckbox v-model="state.disabled" title="Disabled" />
      </template>
    </Variant>
  </Story>
</template>
```

Check out the available controls in their book: [controls.histoire.dev](https://controls.histoire.dev/).
