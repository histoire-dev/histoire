# React stories

Each story file exports a default React component containing `Story`. Import `Story` and `Variant` from `@histoire/plugin-react`.

```tsx
import { Story, Variant } from '@histoire/plugin-react'
import { Button } from './Button'

export default function ButtonStory() {
  return (
    <Story title="Button" group="components" layout={{ type: 'grid', width: 320 }}>
      <Variant title="Default"><Button>Hi</Button></Variant>
      <Variant id="disabled" title="Disabled"><Button disabled>Hi</Button></Variant>
    </Story>
  )
}
```

Without `Variant` children, Histoire creates an implicit `_default` variant. Explicit variants default to `${storyId}-${index}` ids. Supply stable `id` values when changing order should preserve links.

Declare variants directly inside `Story`, optionally inside fragments or elements. Collection reads declarations without rendering their preview content. Components that dynamically create variant declarations are unsupported.

`Story` accepts `id`, `title`, `group`, `layout`, `icon`, `iconColor`, `docsOnly`, `initState`, `setupApp`, `source`, `responsiveDisabled`, `autoPropsDisabled`, and `controls`. `Variant` accepts the same props except `group`, `layout`, and `docsOnly`. Variant props override story defaults.

`source` displays explicit source text. Automatic React source generation and automatic prop controls are unavailable. Add `Button.story.md` beside `Button.story.tsx` for Markdown documentation.

## Setup providers

Set `setupFile: './src/histoire.setup.tsx'` in Histoire config. Export a `setupReact` callback:

```tsx
import { defineSetupReact } from '@histoire/plugin-react'
import { ThemeProvider } from './theme'

export const setupReact = defineSetupReact(({ app, story, variant, addWrapper }) => {
  addWrapper(({ children }) => <ThemeProvider>{children}</ThemeProvider>)
})
```

Payload includes React `Root` as `app`, plus story and selected variant. Story and variant are `null` during collection; variant is `null` during hidden configuration. Setup may return a wrapper component instead of calling `addWrapper`. First registered wrapper is outermost. Story and variant `setupApp` callbacks run after global setup, for preview and controls roots.

Histoire supplies `isActive()` on the setup payload. Check it after awaited work before changing state or using `app`; switching stories can dispose the captured root. Histoire stops remaining setup callbacks when that root is disposed.

## Browser tests

Use [`onTest`](../testing.md) from `histoire/client` at module scope. Registering tests inside a React component body repeats registration whenever React renders. Shared state changes update rendered content during tests.
