<template>
  <Story
    :meta="{ wrapper: false }"
    title="No variant tag"
    :init-state="() => ({
      meow: {
        foo: 'bar',
      },
    })"
  >
    <template #default="{ state }">
      <div class="example-stage">
        <label class="example-field">
          <span>meow.foo</span>
          <input v-model="state.meow.foo" class="example-input" aria-label="meow.foo">
        </label>
      </div>
    </template>

    <template #controls="{ state }">
      <HstText v-model="state.meow.foo">
        meow.foo
      </HstText>
    </template>
  </Story>
</template>
