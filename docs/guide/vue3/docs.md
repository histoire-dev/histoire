# Documentation

## Markdown

### Custom block

Add a `docs` block to a Vue story to show Markdown in its **Docs** tab.

```vue{5-9}
<template>
  <!-- Your story goes here -->
</template>

<docs lang="md">
# My documentation

Checkout this [cool video](https://www.youtube.com/watch?v=dQw4w9WgXcQ)!
</docs>
```

### Sibling markdown

To write docs in a separate file, put `BaseButton.story.md` beside `BaseButton.story.vue`. When both a sibling file and a `docs` block exist, Histoire uses the sibling file.

### Standalone page

Create a `.story.md` file without a matching story file to add a standalone documentation page. Histoire displays it in the Stories tree.

Use Markdown frontmatter to set these properties.

- `id` ([reference](../../reference/vue3/story.md#id))
- `title` ([reference](../../reference/vue3/story.md#title))
- `icon` ([reference](../../reference/vue3/story.md#icon))
- `iconColor` ([reference](../../reference/vue3/story.md#iconcolor))
- `group` ([reference](../../reference/vue3/story.md#group))

Example `Introduction.story.md` file:

```md
---
group: 'top'
icon: 'carbon:bookmark'
---

# Welcome

This is a demo book using Vue 3.

---

Learn more about Histoire [here](https://histoire.dev/).
```

### Links

Link to another story by its relative file path. Add `variantId` to link to a specific variant.

```md
- [Go to Story](./BaseButton.story.vue)
- [Go to CodeGen > Slots](./CodeGen.story.vue?variantId=slots)
- [Go to Markdown file](./MarkdownFile.story.md)
```

## Source code

Histoire can generate copyable source from a Vue variant's current state. Set the `source` prop or fill the `source` slot to supply your own text.

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
Wrap source text in `<textarea v-pre>` inside the `source` slot so Vue leaves the template as text.
:::
