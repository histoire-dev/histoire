import type { ServerRunPayload } from '@histoire/shared'
import { tick } from 'svelte'
import { SvelteComponent } from 'svelte/internal'
import Story from './Story.svelte'
import Variant from './Variant.svelte'

export async function run ({ file, el, storyData }: ServerRunPayload) {
  const { default: Comp } = await import(/* @vite-ignore */ file.moduleId)

  const app: SvelteComponent = new Comp({
    target: el,
    props: {
      Hst: {
        // @ts-ignore
        Story,
        // @ts-ignore
        Variant,
      },
    },
    context: new Map(Object.entries({
      __hstAddStory (data) {
        storyData.push(data)
      },
      __hstStoryFile: file,
    })),
  })

  await tick()

  if (!storyData[0]?.variants.length) {
    storyData[0].variants.push({
      id: '_default',
      title: 'default',
    })
  }

  app.$destroy()
}
