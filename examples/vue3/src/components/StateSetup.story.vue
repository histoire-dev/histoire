<script lang="ts" setup>
import { reactive, ref } from 'vue'

const state = reactive({
  count: 0,
  text: 'Meow',
})

const notSynced = ref(42)
</script>

<template>
  <Story>
    <Variant
      title="default"
    >
      <h1>State</h1>
      <div>
        <pre>{{ state }}</pre>
        <pre>{{ { notSynced } }}</pre>
        <input
          v-model.number="state.count"
          type="number"
        >
        <input
          v-model="state.text"
        >
        <input
          v-model.number="notSynced"
          type="number"
        >
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
