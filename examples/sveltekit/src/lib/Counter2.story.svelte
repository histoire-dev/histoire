<script>
  import Counter from './Counter.svelte'

  export let Hst;
</script>

<Hst.Story>
  <Hst.Select options={["Yuh", "Nah"]} title="Test"/>
  <Counter />
</Hst.Story>