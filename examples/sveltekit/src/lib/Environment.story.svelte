<script>
  import { browser, dev } from '$app/env'

  export let Hst
</script>

<Hst.Story id="kit-environment" title="Kit environment">
  <p>{browser ? 'Browser' : 'Server'} environment ({dev ? 'development' : 'production'})</p>
</Hst.Story>
