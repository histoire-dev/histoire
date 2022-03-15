<template>
  <Story
    title="No variant tag"
    :init-state="() => ({
      meow: {
        foo: 'bar',
      },
    })"
  >
    <template #default="{ state }">
      <input v-model="state.meow.foo">
    </template>

    <template #controls="{ state }">
      <HstInput v-model="state.meow.foo">
        meow.foo
      </HstInput>
    </template>
  </Story>
</template>
