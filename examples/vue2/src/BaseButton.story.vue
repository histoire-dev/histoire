<script lang="ts" setup>
import { reactive } from 'vue'
import BaseButton from './BaseButton.vue'

const state = reactive({
  disabled: false,
  color: undefined,
  size: undefined,
})
</script>

<template>
  <Story
    title="BaseButton"
    :layout="{
      type: 'grid',
      width: 200,
    }"
  >
    <Variant
      title="playground"
    >
      <template #default>
        <BaseButton
          :disabled="state.disabled"
          :color="state.color"
          :size="state.size"
        >
          Click me
        </BaseButton>
      </template>

      <template #controls>
        <HstCheckbox
          v-model="state.disabled"
          title="Disabled"
        />
        <HstSelect
          v-model="state.color"
          title="Color"
          :options="[
            { value: undefined, label: 'Default' },
            { value: 'green', label: 'Green' },
            { value: 'red', label: 'Red' },
          ]"
        />
        <HstSelect
          v-model="state.size"
          title="Size"
          :options="[
            { value: undefined, label: 'Default' },
            { value: 'small', label: 'Small' },
            { value: 'big', label: 'Big' },
          ]"
        />
      </template>
    </Variant>

    <Variant
      title="big green button"
      icon="el:resize-full"
    >
      <BaseButton
        color="green"
        size="big"
      >
        Click me
      </BaseButton>
    </Variant>

    <Variant
      title="small red button"
      icon-color="#F43F5E"
    >
      <BaseButton
        color="red"
        size="small"
      >
        Click me!
      </BaseButton>
    </Variant>
    <!-- <Variant
      title="button inside div"
      icon-color="#F43F5E"
    >
      <div>
        <BaseButton>
          Click me!
        </BaseButton>
      </div>
    </Variant> -->
  </Story>
</template>

<docs lang="md">
# Title

## Subtitle

> Hello

Deserunt nihil nam qui. :cat2: Accusamus ea a voluptatem. Vel veniam non temporibus pariatur cumque aperiam tempora tempora. Assumenda aspernatur qui cum aut tempora rerum. Quisquam quibusdam dignissimos magni et.

[Learn more](https://histoire.dev)

```vue
<script lang="ts" setup>
defineProps<{
  foo: string
}>()
</script>

<template>
  <div>Hello {{ world }}</div>
</template>
```

Ratione vero beatae corrupti quia. Tenetur temporibus ipsa qui qui tempora. Quae harum velit odit quo animi maxime officiis. Dolores ea iusto et.

- Meow
- Waf
- Purr

1. Meow
2. Waf
3. Purr

[Go home](/)
</docs>
