<script>
import { afterUpdate, getContext } from 'svelte'

export let source = null
export let responsiveDisabled = false
export let autoPropsDisabled = false
export let setupApp = null
export let implicit = false

const story = getContext('__hstStory')
const index = getContext('__hstIndex')
const storySlots = getContext('__hstSlots')

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
