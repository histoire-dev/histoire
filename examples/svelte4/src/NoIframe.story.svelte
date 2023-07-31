<script>
  export let Hst

  let content = 'Some content'
</script>

<Hst.Story
  layout={{ type: 'single', iframe: false }}
>
  No iframe story content

  <div>{content}</div>
  <div>
    <input bind:value={content} />
  </div>

  <svelte:fragment slot="controls">
    <Hst.Text
      bind:value={content}
      title="Content"
    />
  </svelte:fragment>
</Hst.Story>

<style>
  div {
    margin-top: 8px;
  }

  input {
    margin-top: 8px;
    padding: 6px;
    border: #f97316 1px solid;
    border-radius: 4px;
  }
</style>
