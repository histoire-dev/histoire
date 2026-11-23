# Events

Call `logEvent(name, payload)` from `histoire/client` in an event handler. Select the event in the inspector’s **Events** tab to inspect its payload.

```svelte{3,11-12}
<script>
  import EventButton from './EventButton.svelte'
  import { logEvent } from 'histoire/client'

  export let Hst
</script>

<Hst.Story
  title="events/EventButton"
>
  <EventButton on:myEvent={arg => logEvent('My event', arg)} /><br>
  <button on:click={event => logEvent('Click', event)}>
    Click
  </button>
</Hst.Story>
```
