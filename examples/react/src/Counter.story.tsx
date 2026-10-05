import { HstNumber, Story } from '@histoire/plugin-react'
import { onTest } from 'histoire/client'
import { expect, it } from 'vitest'

/** Register browser tests at module scope so React rerenders never duplicate them. */
onTest(({ canvas }) => {
  it('increments shared state', async () => {
    const button = canvas.querySelector('button')!
    expect(button.textContent).toBe('Count 0')
    button.click()
    await expect.poll(() => button.textContent).toBe('Count 1')
  })
})

/** Implicit variant with mutable shared state and story-level controls. */
export default function CounterStory() {
  return (
    <Story title="Counter" initState={() => ({ count: 0 })} controls={({ state }) => <HstNumber title="Count" value={state.count} onChange={value => state.count = value} />}>
      {({ state }) => (
        <button type="button" onClick={() => state.count++}>
          {`Count ${state.count}`}
        </button>
      )}
    </Story>
  )
}
