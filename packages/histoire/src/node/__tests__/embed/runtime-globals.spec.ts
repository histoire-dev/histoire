import { describe, expect, it } from 'vitest'
import { setHistoireGlobals, useHistoireGlobals, useHistoireGlobalsStore } from '../../../../../histoire-shared/src/runtime-globals.js'

describe('runtime globals readable', () => {
  it('notifies framework observers without serializing callbacks or leaking unsubscribed listeners', () => {
    setHistoireGlobals({ token: 'initial' })
    const globals = useHistoireGlobals()
    const values: unknown[] = []
    const unsubscribe = useHistoireGlobalsStore().subscribe(value => values.push({ ...value }))
    setHistoireGlobals({ token: 'changed', number: 2 })
    unsubscribe()
    setHistoireGlobals({ token: 'last' })
    expect(values).toEqual([{ token: 'initial' }, { token: 'changed', number: 2 }])
    expect(globals.token).toBe('last')
    expect(JSON.stringify(globals)).toBe('{"token":"last"}')
    expect(Object.keys(globals)).toEqual(['token'])
    setHistoireGlobals({ subscribe: 'valid-map-key' })
    expect(globals.subscribe).toBe('valid-map-key')
  })
})
