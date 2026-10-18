<script lang="ts" setup>
import { reactive, ref } from 'vue'

const state = reactive({
  count: 0,
  text: 'Meow',
})

const synced = ref('hello')
</script>

<template>
  <Story :meta="{ wrapper: false }">
    <Variant
      title="default"
    >
      <div class="example-stage example-stack">
        <h1 class="example-heading">
          State
        </h1>
        <div class="example-stack">
          <pre class="example-output">{{ state }}</pre>
          <div>{{ { synced } }}</div>
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
          <label class="example-field">
            <span>Synced</span>
            <input
              v-model="synced"
              class="example-input"
              aria-label="Synced"
            >
          </label>
        </div>
      </div>

      <template #controls>
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

        <HstText
          v-model="synced"
          title="synced"
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
