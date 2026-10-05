# Props matrix

Choose **Arrange → Matrix** to preview every combination of two finite prop axes. Histoire detects Boolean component props, complete finite `values`/`enum` runtime metadata, and top-level Boolean variant state automatically. Two usable domains enable Matrix without a story declaration. Free text, numeric samples, nested state, and default values do not become axes automatically.

When no frame is selected, detection uses the first variant's existing admitted preview. It does not mount extra previews or select a variant. Discovery survives entering Matrix, and source changes invalidate metadata from older executable revisions. A selected variant's current runtime supplies its own base defaults.

Use explicit hints for domains absent from runtime metadata, or to replace an automatically detected domain:

```vue
<Story
  title="Button"
  :matrix="{
    axes: {
      variant: ['primary', 'secondary', 'ghost', 'danger'],
      size: ['sm', 'md', 'lg'],
    },
  }"
>
  <Variant title="Primary">
    <Button variant="primary" size="md" label="Continue" />
  </Variant>
</Story>
```

Svelte uses the same `matrix` object on `<Hst.Story>`. React accepts it as <code v-pre>matrix={{ axes: { ... } }}</code> on `<Story>`. Their top-level Boolean variant state also supplies automatic domains. Hints contain string, finite number, Boolean, or null values. They override automatic values for the same prop name. Detection does not execute validators or evaluate source code. At most 32 candidate axes and 64 values per axis are advertised; automatic metadata containing invalid members or more than 64 values is rejected. Each selected axis needs at least two distinct values.

Choose Rows and Columns in the canvas axis bar. Swap reverses them while preserving their value filters. In Props, toggle values under Axes to show a subset; disabling every value produces an empty matrix. Edit Base props to apply the same override to every live cell. Axis values always take precedence over base props.

The Base preset selects an existing variant as each cell's starting point. Changing it updates untouched base props and preserves your explicit edits. Reset clears those edits and restores the current preset's values. Selecting a cell is local to the matrix; it does not invent a variant ID or replace the URL's base variant. **Save as variant** copies a `<Variant>` snippet using the selected cell's framework source generator. Svelte snippets use `<Hst.Variant>`. No story files are written.

The canvas frame budget includes its hidden canonical preview. Remaining slots render nearby matrix cells; other cells retain selectable placeholders until admitted. Cell overrides stay inside their own preview sessions. Runtime versions without `PROPS_OVERRIDE` acknowledgment show a cell error.

Rows and columns restore from `arrange=matrix&rows=variant&cols=size`. Valid URL names win independently, followed by saved choices, explicit hint names, then the smallest finite domains in stable discovery order. Unknown names fall back to valid candidates. Per-story base props and filters persist under `_histoire-ui-matrix/<storyId>`. Removed domain values are dropped from filters; an intentionally empty filter stays empty. Matrix remains available in static books through the same runtime discovery and hints.

## Runtime prop metadata

Vue declarations whose type is exclusively Boolean supply `[false, true]`. A mixed Boolean/String declaration has no proven finite domain. Runtime prop definitions may explicitly expose complete `values` or `enum` arrays; Histoire preserves their finite scalar values in `_hPropDefs`. The first component declaring a prop owns that name, matching matrix override routing. A `String` constructor alone does not expose a TypeScript union, so use a story hint when runtime enum metadata is absent.
