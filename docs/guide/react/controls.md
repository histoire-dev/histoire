# State and controls

Initialize state on `Story` or `Variant`. Render callbacks receive the variant's Vue reactive `state`. Mutating it updates both React preview and Histoire controls.

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

Builtin controls wrap the same Vue components used by other Histoire plugins. Pass `value` and receive changes through `onChange`. Other control props and listeners pass through to Vue. Available exports: `HstText`, `HstTextarea`, `HstNumber`, `HstSlider`, `HstCheckbox`, `HstSwitch`, `HstCheckboxList`, `HstSelect`, `HstRadio`, `HstJson`, `HstButton`, `HstButtonGroup`, `HstColorSelect`, `HstColorShades`, `HstTokenGrid`, `HstTokenList`, and `HstCopyIcon`.

React hooks such as `useState` remain available for local component state. Use variant `state` for values that must stay synchronized between preview and controls roots.
