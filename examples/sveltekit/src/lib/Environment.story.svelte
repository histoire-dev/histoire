<script>
  import { browser, dev } from '$app/env'

  export let Hst
</script>

<Hst.Story id="kit-environment" title="Kit environment">
  <div class="example-stage">{browser ? 'Browser' : 'Server'} environment ({dev ? 'development' : 'production'})</div>
</Hst.Story>
