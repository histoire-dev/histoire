<script lang="ts">
  /** Whether native action is unavailable. */
  export let disabled: boolean = false
  /** Authored background color stays editable from controls. */
  export let colorselect = '#d5bebe'
</script>

<button type="button" {disabled} class:disabled class="button example-button" style="background: {colorselect}; color: white" on:click>
  <slot />
</button>
