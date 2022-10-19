# Documentation

## Markdown

### Custom block

Histoire lets you write markdown documentation for your stories using Vue custom blocks. Add a `docs` tag in your story file:

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

To add documentation to a story, you can also create a file with the same name next to it, with the `.md` extension.

For example, if your story is `BaseButton.story.vue`, create a `BaseButton.story.md` file.

Sibling markdown files are higher priority than custom blocks.

### Standalone page

If you create a markdown file ending with `.story.md` that isn't related to a sibling story file, it will automatically create a virtual story that renders the markdown as a page.

You can add a frontmatter to the markdown to customize the virtual story with the following properties:

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

This is a demo book using Vue 2.

---

Learn more about Histoire [here](https://histoire.dev/).
```

### Links

You can link to other stories using a relative path to the story file:

```md
- [Go to Story](./BaseButton.story.vue)
- [Go to CodeGen > Slots](./CodeGen.story.vue?variantId=slots)
- [Go to Markdown file](./MarkdownFile.story.md)
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
