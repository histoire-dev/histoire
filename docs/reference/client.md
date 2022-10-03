# Client API Reference

You can access various APIs meant to be used inside stories from the `histoire/client` module.

## `logEvent`

Logs an event in the `Events` sidepane.

```js
import { logEvent } from 'histoire/client'

logEvent('click', { some: 'data' })
```

## `isCollecting`

Returns `true` if the story is executing through the NodeJS server.

```js
import { isCollecting } from 'histoire/client'

if (!isCollecting()) {
  // do something only in the browser
}
```
