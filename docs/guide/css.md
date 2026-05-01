# Styles & CSS isolation

By default, Histoire isolates its own UI ("chrome") from the CSS imported via your `histoire.setup.ts`, and keeps your CSS from leaking into chrome. Most of the time you don't need to do anything.

## How it works

Two CSS scopes:

- Your CSS, transitively imported via `histoire.setup.ts` (or directly from a story file), is wrapped in `@scope (.__histoire-render-story)`. It only reaches DOM rendered inside a story container.
- Histoire's own CSS is wrapped in `@scope (.histoire-app-root) to (.__histoire-render-story)`. It only reaches Histoire's chrome and stops at story boundaries.

`:root` selectors in your CSS are auto-rewritten to `:scope`, so design tokens like `:root { --color-primary: blue }` keep working as expected on `.__histoire-render-story`.

## Grid iframes

Grid items render inside iframes by default. This gives the variant grid the same isolation as the single-variant view, and each iframe sizes to its content.

You can opt out per story:

```vue
<Story :layout="{ type: 'grid', iframeGrid: false }">
  <Variant title="A"><MyComponent /></Variant>
</Story>
```

## Escape hatch — `isolateStyles: false`

If your project depends on chrome and stories sharing the same cascade, disable isolation entirely:

```ts
// histoire.config.ts
export default defineConfig({
  isolateStyles: false,
})
```

This restores pre-isolation behaviour: no scoping, grid items render inline.

## Globally-loaded styles — `globalStyles`

For CSS that genuinely should be available everywhere — design tokens, base typography you want to also affect Histoire's chrome — use the `globalStyles` config:

```ts
export default defineConfig({
  globalStyles: ['./src/styles/tokens.css'],
})
```

Files listed in `globalStyles` are wrapped in `@layer histoire-user-globals`, so they cannot accidentally override chrome's appearance — chrome rules are unlayered and win the cascade.

## `?global` per-import escape

To skip wrapping for a single file, append `?global` to the import:

```ts
import './tokens.css?global'
```

The file loads exactly as if you had written it without isolation — at your own risk; it can override chrome.

## Dev mode caveat

Isolation runs at build time only. `histoire dev` serves your CSS as-is so HMR stays cheap, which means story-to-chrome leakage may be visible in the dev server even though the published bundle is correctly scoped. Use `histoire build` to verify final isolation behaviour.

## Browser support

`@scope` is required. Supported in:

- Chrome 118+ (October 2023)
- Safari 17.4+ (March 2024)
- Firefox 128+ (July 2024)

There is no JavaScript fallback. If you need to support older browsers, use the `isolateStyles: false` escape hatch.
