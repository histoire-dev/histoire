# Documentation

## Markdown

Histoire lets you write markdown documentation for your stories. You just have to use the `docs` tag in your story file.

```vue{5-9}
<template>
  <!-- Your story goes here -->
</template>

<docs lang="md">
# My documentation

Checkout this [cool video](https://www.youtube.com/watch?v=dQw4w9WgXcQ)!
</docs>
```

## Source code

By default, Histoire will attempt to generate a copyable source code from the story, dynamically from the current state.

Currently automatic source code generation is only supported for:

- Vue 3

To document a copyable source code manually you can use either the `source` prop or the `source` slot.

```vue{31,55-74}
<script lang="ts" setup>
function initState () {
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
```

:::tip
You should use a `<textarea v-pre>` element in the `source` slot to prevent Vue from compiling the template.
:::
