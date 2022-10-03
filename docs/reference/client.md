# Client API Reference


## `hstEvent`

Logs an event in the `Events` sidepane.

```js
import { hstEvent } from 'histoire/client'

hstEvent('click', { some: 'data' })
```

## `isCollecting`

Returns `true` if the story is executing through the NodeJS server.

```js
import { isCollecting } from 'histoire/client'

if (!isCollecting()) {
  // do something only in the browser
}
```
