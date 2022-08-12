# Events

Histoire can display a list of events emitted from your story. To register new events, use the `hstEvent` function from `histoire/client`.

The first parameter is the name of the event, and the second one is a data object you want to display when clicking on the event.

```svelte{3,11-12}
<script>
  import EventButton from './EventButton.svelte'
  import { hstEvent } from 'histoire/client'

  export let Hst
</script>

<Hst.Story
  title="events/EventButton"
>
  <EventButton on:myEvent={arg => hstEvent('My event', arg)} /><br>
  <button on:click={event => hstEvent('Click', event)}>
    Click
  </button>
</Hst.Story>
```
