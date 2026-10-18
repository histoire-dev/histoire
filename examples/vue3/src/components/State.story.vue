<script lang="ts" setup>
/** Creates independent editable values for each variant. */
function initState() {
  return {
    count: 0,
    text: '',
  }
}

/** Creates nested state used by dedicated variant. */
function initState2() {
  return {
    meow: {
      foo: 'bar',
    },
  }
}
</script>

<template>
  <Story
    :meta="{ wrapper: false }"
    title="State"
  >
    <Variant
      title="default"
      :init-state="initState"
    >
      <template #default="{ state }">
        <div class="example-stage example-stack">
          <h1 class="example-heading">
            State
          </h1>
          <div class="example-stack">
            <pre class="example-output">{{ state }}</pre>
            <label class="example-field">
              <span>Count</span>
              <input
                v-model.number="state.count"
                class="example-input"
                aria-label="Count"
                type="number"
              >
            </label>
            <label class="example-field">
              <span>Text</span>
              <input
                v-model="state.text"
                class="example-input"
                aria-label="Text"
              >
            </label>
          </div>
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
        <div class="example-stage example-stack">
          <label class="example-field">
            <span>meow.foo</span>
            <input
              v-model="state.meow.foo" class="example-input"
              aria-label="meow.foo"
            >
          </label>
        </div>
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

<style scoped>
.controls {
  margin: 12px;
  display: flex;
  align-items: center;
}

.controls > :not(:first-child) {
  margin-left: 12px;
}

button {
  padding: 6px;
  border-radius: 4px;
  cursor: pointer;
}
</style>
