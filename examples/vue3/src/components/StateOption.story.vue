<script>
export default {
  data () {
    return {
      optionApiData: 'OPTION API',
    }
  },
}
</script>

<template>
  <Story>
    <Variant>
      <h1>State</h1>
      <div>
        <pre class="state-output">{{ { optionApiData } }}</pre>
        <input
          v-model="optionApiData"
        >
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
