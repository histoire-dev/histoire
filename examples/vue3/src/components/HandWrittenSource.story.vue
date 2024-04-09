<script lang="ts" setup>
function initState() {
  return {
    count: 0,
  }
}

const source = `<h1>Toto</h1>

<input
  v-model.number="count"
  type="number"
>

<p>{{ count }}</p>

<template #named="{ shown, hide }">
  <MyComponent
    v-if="shown"
    :item="{ foo: 'bar' }"
    @close="hide()"
  />
</template>`
</script>

<template>
  <Story title="Hand-written source">
    <Variant
      title="Source prop"
      :init-state="initState"
      :source="source"
    >
      <template #default="{ state }">
        <h1>Toto</h1>

        <input
          v-model.number="state.count"
          type="number"
        >
      </template>
    </Variant>
    <Variant
      title="Source template"
      :init-state="initState"
    >
      <template #default="{ state }">
        <h1>Toto</h1>

        <input
          v-model.number="state.count"
          type="number"
        >
      </template>

      <template #source>
        <textarea v-pre>
          <h1>Toto</h1>

          <input
            v-model.number="count"
            type="number"
          >

          <p>{{ count }}</p>

          <template #named="{ shown, hide }">
            <MyComponent
              v-if="shown"
              :item="{ foo: 'bar' }"
              @close="hide()"
            />
          </template>
        </textarea>
      </template>
    </Variant>
  </Story>
</template>
