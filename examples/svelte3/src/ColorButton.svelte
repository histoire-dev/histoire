<script lang="ts">
    export let disabled: boolean = false
    export let colorselect = "#d5bebe"
  </script>
  
  <button class:disabled class={"button"} style="background: {colorselect}" on:click>
    <slot />
  </button>
  
  <style>
  button {
    color: white;
    border-radius: 6px;
    cursor: pointer;
    transition: opacity .15s;
    padding: 7px 16px;
    font-size: 24px;
  }
  
  button.disabled {
    opacity: 0.5;
  }
  </style>
  