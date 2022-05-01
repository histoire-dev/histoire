import { EVENT_SEND } from './const'

export function hstEvent (name: string, argument) {
  console.log('[histoire] Event fired', { name, argument })
  window.parent?.postMessage({
    type: EVENT_SEND,
    event: {
      name,
      argument: JSON.parse(JSON.stringify(argument)), // Needed for HTMLEvent that can't be cloned
    },
  })
}
