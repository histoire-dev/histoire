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
      <HstText v-model="state.meow.foo">
        meow.foo
      </HstText>
    </template>
  </Story>
</template>
