<script lang="ts">
import { setContext } from 'svelte';

let index = { value: 0 }
setContext('__hstIndex', index)
</script>

<slot />
