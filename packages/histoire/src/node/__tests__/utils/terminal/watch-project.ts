import { rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createMcpBrowserTestProject } from '../mcp/browser-test-project.js'

/** Variants of the fixture's first story; the second is the one watch tests select. */
export const WATCH_VARIANTS = ['main', 'second'] as const

/** Helper module source: `expected` is what the stories' one assertion looks for. */
export const helperSource = (expected: string, revision = 0) => `export const expected = '${expected}'\n// revision ${revision}\n`

/**
 * Source of one story whose single browser test reports to the marker endpoint (with story and variant)
 * and then asserts the rendered text contains the helper's `expected`.
 * @param id Story ID and helper name.
 * @param endpoint Marker endpoint.
 * @param variants Variant IDs; each renders `<id>` or `<id>-<variant>` text.
 */
export function watchStorySource(id: string, endpoint: string, variants: readonly string[] = ['main']) {
  return `<script lang="ts">
import { onTest } from 'histoire/client'
import { expect, it } from 'vitest'
import { expected } from './helper-${id}'
onTest(({ canvas }) => {
  it('matches helper', async () => {
    const variant = canvas.querySelector('[data-variant]')?.getAttribute('data-variant')
    await fetch(${JSON.stringify(endpoint)} + '?story=${id}&variant=' + variant)
    expect(canvas.textContent).toContain(expected)
  })
})
</script>
<template><Story id="${id}" title="Story ${id.toUpperCase()}">
${variants.map(variant => `<Variant id="${variant}" title="${variant}"><span data-variant="${variant}">${variant === 'main' ? id : `${id}-${variant}`}</span></Variant>`).join('\n')}
</Story></template>`
}

/**
 * Project with three independent stories `a` (two variants, assertion initially failing), `b` and `c`,
 * each with its own helper module, so an edit to one helper affects exactly one story. Every test body
 * reports to `endpoint`, so tests see exactly which story/variant ran and when.
 * @param endpoint Marker endpoint (`startBodyMarker().url`).
 */
export async function createWatchProject(endpoint: string) {
  const project = await createMcpBrowserTestProject()
  for (const file of ['Book.story.vue', 'Book.story.md', 'Empty.story.vue']) await rm(resolve(project.root, file), { force: true })
  await writeFile(resolve(project.root, 'helper-a.ts'), helperSource('wrong'))
  await writeFile(resolve(project.root, 'A.story.vue'), watchStorySource('a', endpoint, WATCH_VARIANTS))
  for (const id of ['b', 'c']) {
    await writeFile(resolve(project.root, `helper-${id}.ts`), helperSource(id))
    await writeFile(resolve(project.root, `${id.toUpperCase()}.story.vue`), watchStorySource(id, endpoint))
  }
  return project
}
