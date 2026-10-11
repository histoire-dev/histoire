import { expect, it } from 'vitest'
import { createVisualRefresh } from '../../../../histoire-app/src/app/stores/visual-refresh.js'

it('shares concurrent startup refresh while allowing independent replacement generation', async () => {
  let generation = 0
  const started: number[] = []
  const releases: (() => void)[] = []
  const refresh = createVisualRefresh(() => {
    started.push(generation)
    return new Promise<void>(resolve => releases.push(resolve))
  }, () => generation)
  const initial = refresh()
  expect(refresh()).toBe(initial)
  expect(started).toEqual([0])
  generation++
  const replacement = refresh()
  expect(replacement).not.toBe(initial)
  expect(refresh()).toBe(replacement)
  expect(started).toEqual([0, 1])
  releases[0]()
  await initial
  expect(refresh()).toBe(replacement)
  releases[1]()
  await replacement
  const next = refresh()
  expect(started).toEqual([0, 1, 1])
  releases[2]()
  await next
})
