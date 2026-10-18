<script>
export default {
  data() {
    return {
      optionApiData: 'OPTION API',
    }
  },
}
</script>

<template>
  <Story :meta="{ wrapper: false }">
    <Variant>
      <div class="example-stage example-stack">
        <h1 class="example-heading">
          State
        </h1>
        <div class="example-stack">
          <pre class="state-output example-output">{{ { optionApiData } }}</pre>
          <label class="example-field">
            <span>optionApiData</span>
            <input
              v-model="optionApiData"
              class="example-input"
              aria-label="optionApiData"
            >
          </label>
        </div>
      </div>

      <template #controls>
        <HstText
          v-model="optionApiData"
          title="optionApiData"
        />
      </template>
    </Variant>
  </Story>
</template>
