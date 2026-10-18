<script lang="ts">
  /** Whether native action is unavailable. */
  export let disabled: boolean = false
  /** Component size controlled by story. */
  export let size: 'small' | 'medium' | 'large' = 'medium'
</script>

<button type="button" {disabled} class:disabled class="example-button {size}" on:click>
  <slot />
</button>
