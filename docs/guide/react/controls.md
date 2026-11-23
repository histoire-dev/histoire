# State and controls <Badge type="tip" text="1.0-beta.2+" />

Set `initState` on `Story` or `Variant` to share state between the canvas and controls. Render callbacks receive the variant's reactive `state`. Changing it updates both surfaces.

```tsx
import { HstCheckbox, HstText, Story, Variant } from '@histoire/plugin-react'
import { Button } from './Button'

export default function ButtonStory() {
  return (
    <Story initState={() => ({ label: 'Hi', disabled: false })}>
      <Variant
        title="Default"
        controls={({ state }) => (
          <>
            <HstText title="Label" value={state.label} onChange={value => state.label = value} />
            <HstCheckbox title="Disabled" value={state.disabled} onChange={value => state.disabled = value} />
          </>
        )}
      >
        {({ state }) => <Button disabled={state.disabled}>{state.label}</Button>}
      </Variant>
    </Story>
  )
}
```

Each variant receives independent initial state. `initState` may return a promise. Story-level `controls` supplies a default; variant-level `controls` replaces it. Implicit variants support both render callbacks and controls.

Built-in controls wrap the same Vue components used by other Histoire plugins. Pass `value` and receive changes through `onChange`. Other props and listeners pass through to Vue.

The plugin exports `HstText`, `HstTextarea`, `HstNumber`, `HstSlider`, `HstCheckbox`, `HstSwitch`, `HstCheckboxList`, `HstSelect`, `HstRadio`, `HstJson`, `HstButton`, `HstButtonGroup`, `HstColorSelect`, `HstColorShades`, `HstTokenGrid`, `HstTokenList`, and `HstCopyIcon`.

Use React hooks such as `useState` for local component state. Keep values shared between the canvas and controls in the variant's `state`.
