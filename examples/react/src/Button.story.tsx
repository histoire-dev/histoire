import { HstCheckbox, HstText, Story, Variant } from '@histoire/plugin-react'
import { Button } from './Button'

/** Multiple variants share declarations while retaining independent state. */
export default function ButtonStory() {
  return (
    <Story title="Button" initState={() => ({ label: 'Hi', disabled: false })}>
      <Variant
        title="Default"
        controls={({ state }) => (
          <>
            <HstText title="Label" value={state.label} onChange={value => state.label = value} />
            <HstCheckbox title="Disabled" value={state.disabled} onChange={value => state.disabled = value} />
          </>
        )}
        source="<Button>Hi</Button>"
      >
        {({ state }) => <Button disabled={state.disabled}>{state.label}</Button>}
      </Variant>
      <Variant title="Disabled"><Button disabled>Disabled</Button></Variant>
    </Story>
  )
}
