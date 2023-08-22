<script lang="ts">
import { Story } from '@histoire/shared'
import { afterUpdate, getContext } from 'svelte'

export let source: string = null
export let responsiveDisabled: boolean = false
export let autoPropsDisabled: boolean = false
export let setupApp: Function = null
export let implicit: boolean = false

const story: Story = getContext('__hstStory')
const index: { value: number } = getContext('__hstIndex')
const storySlots: any = getContext('__hstSlots')

const variant = story.variants[index.value]
index.value++

function updateVariant () {
  Object.assign(variant, {
    slots: () => ({
      default: true,
      controls: $$slots.controls ?? storySlots.controls,
    }),
    source,
    responsiveDisabled,
    autoPropsDisabled,
    setupApp,
    configReady: true,
  })

  if (!implicit && !story.meta?.hasVariantChildComponents) {
    story.meta = story.meta || {}
    Object.assign(story.meta, {
      hasVariantChildComponents: true,
    })
  }
}
updateVariant()

afterUpdate(() => {
  updateVariant()
})
</script>

{#if false}
<slot />
<slot name="controls" />
{/if}
