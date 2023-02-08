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

## `isDark`

Returns `true` if dark mode is enabled.

```js
import { isDark } from 'histoire/client'

if (isDark()) {
  // do something only in dark mode
}
```

## `toggleDark`

`toggleDark(value?: boolean): boolean`

Toggles dark mode. If `value` is provided, it will be used instead of toggling. Returns the new value.

```js
import { toggleDark } from 'histoire/client'

toggleDark(true)
```
