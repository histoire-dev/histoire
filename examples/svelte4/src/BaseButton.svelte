<script lang="ts">
  export let disabled: boolean = false
  export let size: 'small' | 'medium' | 'large' = 'medium'
</script>

<button class:disabled class={size} on:click>
  <slot />
</button>

<style>
button {
  background: #ff3e00;
  color: white;
  border-radius: 6px;
  cursor: pointer;
  transition: opacity .15s;
}

button.small {
  padding: 6px;
}

button.medium {
  padding: 12px;
}

button.large {
  padding: 24px;
}

button.disabled {
  opacity: 0.5;
}
</style>
