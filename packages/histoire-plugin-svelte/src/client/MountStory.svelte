<script lang="ts">
import { Story } from '@histoire/shared'
import { getContext, setContext } from 'svelte';

const story: Story = getContext('__hstStory')
let index = { value: 0 }
setContext('__hstIndex', index)
</script>

<slot />
