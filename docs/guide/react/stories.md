# React stories <Badge type="tip" text="1.0-beta.2+" />

Each story file exports a default React component containing `Story`. Import `Story` and `Variant` from `@histoire/plugin-react`.

```tsx
import { Story, Variant } from '@histoire/plugin-react'
import { Button } from './Button'

export default function ButtonStory() {
  return (
    <Story title="Button" group="components" layout={{ type: 'grid' }}>
      <Variant title="Default"><Button>Hi</Button></Variant>
      <Variant id="disabled" title="Disabled"><Button disabled>Hi</Button></Variant>
    </Story>
  )
}
```

Without `Variant` children, Histoire creates an implicit `_default` variant. Explicit variants default to `${storyId}-${index}` IDs. Set `id` to keep links working when you reorder variants.

Declare `Variant` inside `Story`, optionally inside fragments or elements. Histoire reads these declarations during collection without rendering their contents. Keep the declarations in the story component so Histoire can find them.

Set `group`, `layout`, `docsOnly`, and `matrix` on `Story`. Use the story's `initState` and `controls` as defaults for every variant, or override them on an individual `Variant`.

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

The callback receives the React `Root` as `app`, along with the story and selected variant. Both story and variant are `null` during collection. The variant is also `null` during hidden configuration.

Return a wrapper component or register one with `addWrapper`. The first registered wrapper is outermost. For both the canvas and custom controls, Histoire runs global setup first, then the story's `setupApp`, then the variant's `setupApp`.

Histoire supplies `isActive()` on the setup payload. Check it after awaited work before changing state or using `app`; switching stories can dispose the captured root. Histoire stops remaining setup callbacks when that root is disposed.

## Browser tests

Use [`onTest`](../testing.md) from `histoire/client` at module scope. Registering tests inside a React component body repeats registration whenever React renders. Shared state changes update rendered content during tests.
