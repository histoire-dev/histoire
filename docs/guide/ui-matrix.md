# Props matrix

Choose **Props matrix** to display every combination of two prop axes. This arrangement is always accessible. While Histoire reads prop values, the canvas shows a loading state. If fewer than two usable axes exist, it explains the requirement, names any detected axis, and suggests a custom axis or values declared in `Story matrix.axes`. **Add custom axis** opens the new-axis form in Props, showing the inspector if needed. Each axis needs at least two distinct values. Histoire detects Boolean component props, complete finite `values`/`enum` runtime metadata, and top-level Boolean variant state automatically. Numeric props receive configurable samples. Free text, nested state, and nonnumeric default values do not become axes automatically.

When no frame is selected, Matrix keeps one hidden runtime for the first variant to discover props without selecting a variant or changing the URL. With a selected variant, its hidden canonical runtime supplies prop metadata and base defaults. Discovery also uses existing admitted frames in other arrangements. Source changes invalidate metadata from older executable revisions, and the canvas updates automatically when usable axes arrive.

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

## Custom axes

In Props, choose **Add axis** to supply values for a known prop without a detected domain. Choose **Custom name** to enter a prop absent from runtime metadata. Names identify literal top-level props; dots do not select nested paths.

Enter **Values** with one value per line; an axis needs 2–64 distinct values. Plain text becomes a string. Lines that are valid JSON keep their type, so numbers, booleans, null, arrays, and objects are supported. Quote a line to force a string, such as `"1"` or `"true"`:

```
primary
"10"
10
{"label":"First","count":1}
[1,2]
```

Pasting a complete JSON array also works, for example `[{"label":"First"},{"label":"Second"}]`.

**Add axis** fills an unused row or column without replacing an existing pair. Adding an existing name opens its editor. Custom axes override current numeric, story, and runtime values. They persist locally per story and prop, including across base-preset changes and reloads; URLs share only arrangement and axis names.

Each custom axis shows edit and remove actions next to its name, whether selected or not. Edit opens its values editor; **Apply** saves and closes it, **Cancel** or Escape discards the draft. Removing an override, or choosing numeric **Reset values**, restores latest defaults; a prop without defaults stops being an axis. Applying or removing an override clears that prop's subset filter.

Objects compare structurally, ignoring key order; arrays retain element order. Invalid drafts leave cells and saved values unchanged. Values must fit existing JSON transport limits, including 64 KiB payloads. Story-declared axes reserve capacity before custom axes and automatic candidates, within the 32-axis limit.

Overrides follow the first component declaring each prop. Names without component metadata write top-level state in isolated cell runtimes. Story must consume that field for rendering to change; Histoire does not add unknown attributes to every component. Story declarations remain scalar arrays or numeric ranges.

## Numeric values

Props declared exclusively as numbers and unowned finite top-level numeric variant state receive `[0, 1, 2, 5, 10]` automatically. These are samples, not a complete set of accepted prop values. Mixed Number/String declarations require explicit hints. Current prop values are not appended to samples.

Configure project samples with `ui.matrix.numericValues`:

```ts
export default defineConfig({
  ui: {
    matrix: { numericValues: [0, 10, 25, 50, 100] },
  },
})
```

Declare per-prop samples as arrays or increasing ranges:

```vue
<Story :matrix="{ axes: {
  count: { min: 0, max: 20, step: 5 },
  opacity: [0, 0.25, 0.5, 1],
} }"
>
```

Ranges include `min` and stop at `max`; an off-step endpoint is not appended. `{ min: 0, max: 10, step: 3 }` produces `[0, 3, 6, 9]`. Negative values, decimals, and scientific notation work. Require finite bounds, `min <= max`, a positive step, and at most 64 generated values. Invalid ranges contribute no hint for that prop. Svelte and React use the same range object; published catalogs contain expanded arrays.

For a selected numeric axis, choose its edit action, then use **Values** to edit a comma-separated list, or **Range** to set **Min**, **Max**, and **Step**. **Apply** replaces axis values and shows their full set immediately. Invalid input leaves matrix unchanged. Lists preserve order and deduplicate; project defaults and app edits require 2–64 distinct finite numbers.

Saved app values win over story hints, then complete runtime domains, then project samples, then built-in samples. Edits persist per story and prop across reloads, axis swaps, and base preset changes. **Reset values** restores current source defaults and shows all restored values. Numeric edits do not change canonical variant state or write story files. Custom values remain local preferences; links share axis names, not edited values.

The Base preset selects an existing variant as each cell's starting point. Changing it updates untouched base props and preserves your explicit edits. Reset clears those edits and restores the current preset's values. Selecting a cell is local to the matrix; it does not invent a variant ID or replace the URL's base variant. **Save as variant** copies a `<Variant>` snippet using the selected cell's framework source generator. Svelte snippets use `<Hst.Variant>`. No story files are written.

The canvas frame budget includes its hidden canonical preview. Remaining slots render nearby matrix cells; other cells retain selectable placeholders until admitted. Cell overrides stay inside their own preview sessions. Runtime versions without `PROPS_OVERRIDE` acknowledgment show a cell error.

Rows and columns restore from `arrange=matrix&rows=variant&cols=size`. Valid URL names win independently, followed by saved choices, explicit hint names, then the smallest domains in stable discovery order. Unknown names fall back to valid candidates. Per-story base props, filters, and explicit numeric values and custom axes persist under `_histoire-ui-matrix/<storyId>`. Passive source updates drop removed domain values from filters; an intentionally empty filter stays empty. Matrix remains available in static books through the same runtime discovery, defaults, and hints.

## Runtime prop metadata

Vue declarations whose type is exclusively Boolean supply `[false, true]`. A mixed Boolean/String declaration has no proven finite domain. Runtime prop definitions may explicitly expose complete `values` or `enum` arrays; Histoire preserves their finite scalar values in `_hPropDefs`. The first component declaring a prop owns that name, matching matrix override routing. A `String` constructor alone does not expose a TypeScript union, so use a story hint when runtime enum metadata is absent.
