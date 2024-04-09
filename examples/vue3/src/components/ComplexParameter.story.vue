<script lang="ts" setup>
import ComplexParameter from './ComplexParameter.vue'

const parent = { name: 'hello' } as { name: string } & Record<string, unknown>
const child = {} as Record<string, unknown>

parent.child = child
child.parent = parent

const myParameter = [
  { action: () => { console.log('Hello world!') } },
]
</script>

<template>
  <Story
    title="ComplexParameter"
    :layout="{ type: 'single', iframe: false }"
  >
    <ComplexParameter
      :complex-parameter="myParameter"
      :recursive-parameter="parent"
    />
  </Story>
</template>
