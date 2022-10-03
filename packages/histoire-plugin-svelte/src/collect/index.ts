import type { ServerRunPayload } from '@histoire/shared'
// @ts-expect-error virtual module id
import * as setup from 'virtual:$histoire-setup'
// @ts-expect-error virtual module id
import * as generatedSetup from 'virtual:$histoire-generated-global-setup'
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

  // Call app setups to resolve global assets such as components

  if (typeof generatedSetup?.setupSvelte3 === 'function') {
    await generatedSetup.setupSvelte3({
      app,
      story: null,
      variant: null,
    })
  }

  if (typeof setup?.setupSvelte3 === 'function') {
    await setup.setupSvelte3({
      app,
      story: null,
      variant: null,
    })
  }

  await tick()

  if (!storyData[0]?.variants.length) {
    storyData[0].variants.push({
      id: '_default',
      title: 'default',
    })
  }

  app.$destroy()
}
