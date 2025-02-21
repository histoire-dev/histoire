<script lang="ts">
import { Story } from '@histoire/shared'
import { getContext } from 'svelte'

let { source = null, responsiveDisabled = false, autoPropsDisabled = false, setupApp = null, implicit = false, children, controls = null } = $props()

const story: Story = getContext('__hstStory')
const index: { value: number } = getContext('__hstIndex')
const storySlots: any = getContext('__hstSlots')

const variant = story.variants[index.value]
index.value++

function updateVariant () {
  Object.assign(variant, {
    slots: () => ({
      default: true,
      controls: controls ?? storySlots.controls,
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

$effect(() => {
  updateVariant()
})
</script>

{#if false}
{@render children?.()}
{@render controls?.()}
{/if}
