# Documentation

## Markdown

::: warning
Not available for Svelte yet.
:::

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
