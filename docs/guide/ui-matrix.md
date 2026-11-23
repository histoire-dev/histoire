# Props matrix <Badge type="tip" text="1.0-beta.2+" />

Choose **Props matrix**, then select **Rows** and **Columns** in the canvas toolbar. The matrix renders each combination of the two props. Use **Swap** to switch the axes, **Axes** in the inspector to filter values, and **Base props** to apply shared overrides. Each cell's axis values take precedence over base props.

Each axis needs at least two distinct values. Histoire detects Boolean props, complete finite `values` or `enum` metadata, and top-level Boolean state. Numeric props use configurable samples. Use **Add custom axis** if Histoire detects too few usable axes, or declare values in the story.

Histoire reads prop metadata and base defaults from the selected variant. With no selection, it uses the first variant in a hidden frame without changing the URL. It can also reuse metadata from mounted frames. The matrix updates when story edits change the available props.

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

Swapping axes preserves value filters. Turn off every value for an axis to show an empty matrix.

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

Use **Base preset** to pick an existing variant as the starting point for each cell. Changing the preset preserves your explicit base prop edits. Reset clears those edits. Selecting a cell stays local to the matrix and leaves the base variant URL in place. **Save as variant** copies a snippet you can paste into your story. Svelte snippets use `<Hst.Variant>`.

The hidden story frame counts toward the canvas frame budget. Histoire uses the remaining slots to render nearby cells and shows selectable placeholders for the others. Overrides apply only to the cell. If a cell cannot apply its overrides, it shows an error.

Rows and columns restore from `arrange=matrix&rows=variant&cols=size`. Valid URL names win independently, followed by saved choices, explicit hints, then the axes with the fewest values. Unknown names fall back to valid candidates. Your browser saves base props, filters, numeric overrides, and custom axes per story. If the available values change, filters drop the removed values. An intentionally empty filter stays empty. Static books use the same defaults and hints.

## Runtime prop metadata

Vue declarations whose type is exclusively Boolean supply `[false, true]`. A mixed Boolean/String declaration needs explicit values. Histoire uses complete `values` or `enum` arrays exposed by runtime prop definitions. If several components declare the same prop, the matrix uses the first declaration. For string unions without runtime enum metadata, supply the values in a story hint.

See [Visual testing](./visual-testing.md) for tracked baselines, Matrix cases, image review, and CI comparisons.
