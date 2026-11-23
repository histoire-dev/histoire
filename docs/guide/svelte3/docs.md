# Documentation

## Markdown

### Sibling markdown

Put `BaseButton.story.md` beside `BaseButton.story.svelte` to show Markdown in the story's **Docs** tab.

### Standalone page

Create a `.story.md` file without a matching story file to add a standalone documentation page. Histoire displays it in the Stories tree.

Use Markdown frontmatter to set these properties.

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

This is a demo book using Svelte.

---

Learn more about Histoire [here](https://histoire.dev/).
```

### Links

Link to another story by its relative file path. Add `variantId` to link to a specific variant.

```md
- [Go to Story](./BaseButton.story.svelte)
- [Go to CodeGen > Slots](./CodeGen.story.svelte?variantId=slots)
- [Go to Markdown file](./MarkdownFile.story.md)
```

## Source code

Use the `source` prop to supply copyable source for a Svelte variant.

```svelte
<script>
  export let Hst
  let count = 0

  const source = `<script>
  let count = 0
<\/script>

<h1>Counter</h1>

<input
  bind:value={count}
  type="number"
>`
</script>

<Hst.Story title="Hand-written source">
  <Hst.Variant
    title="Source prop"
    {source}
  >
    <h1>Counter</h1>

    <input
      bind:value={count}
      type="number"
    >
  </Hst.Variant>
</Hst.Story>
```
