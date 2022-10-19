# Documentation

## Markdown

### Sibling markdown

To add documentation to a story, create a file with the same name next to it, with the `.md` extension.

For example, if your story is `BaseButton.story.svelte`, create a `BaseButton.story.md` file.

### Standalone page

If you create a markdown file ending with `.story.md` that isn't related to a sibling story file, it will automatically create a virtual story that renders the markdown as a page.

You can add a frontmatter to the markdown to customize the virtual story with the following properties:

- `id` ([reference](../../reference/svelte3/story.md#id))
- `title` ([reference](../../reference/svelte3/story.md#title))
- `icon` ([reference](../../reference/svelte3/story.md#icon))
- `iconColor` ([reference](../../reference/svelte3/story.md#iconcolor))
- `group` ([reference](../../reference/svelte3/story.md#group))

Example `Introduction.story.md` file:

```md
---
group: 'top'
icon: 'carbon:bookmark'
---

# Welcome

This is a demo book using Svelte 3.

---

Learn more about Histoire [here](https://histoire.dev/).
```

### Links

You can link to other stories using a relative path to the story file:

```md
- [Go to Story](./BaseButton.story.svelte)
- [Go to CodeGen > Slots](./CodeGen.story.svelte?variantId=slots)
- [Go to Markdown file](./MarkdownFile.story.md)
```

## Source code

::: warning
Auto-CodeGen is not available for Svelte.
:::

To document a copyable source code manually you can use the `source` prop.

```svelte{31,55-74}
<script>
  export let Hst

  const source = `<h1>Toto</h1>

<input
  bind:value={count}"
  type="number"
>`
</script>

<Hst.Story title="Hand-written source">
  <Hst.Variant
    title="Source prop"
    {source}
  >
    <h1>Toto</h1>

    <input
      bind:value={count}"
      type="number"
    >
  </Hst.Variant>
</Hst.Story>
```
