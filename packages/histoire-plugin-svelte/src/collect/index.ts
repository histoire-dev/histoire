import type { ServerRunPayload } from '@histoire/shared'
import type { SvelteComponent } from 'svelte'
import type { SvelteStorySetupApi } from '../helpers.js'
import { tick } from 'svelte'
// @ts-expect-error virtual module id
import * as generatedSetup from 'virtual:$histoire-generated-global-setup'
// @ts-expect-error virtual module id
import * as setup from 'virtual:$histoire-setup'
import Story from './Story.svelte'
import Variant from './Variant.svelte'

export async function run({ file, el, storyData }: ServerRunPayload) {
  const { default: Comp } = await import(/* @vite-ignore */ file.moduleId)

  const app: SvelteComponent = new Comp({
    target: el,
    props: {
      Hst: {
        Story,
        Variant,
      },
    },
    context: new Map(Object.entries({
      __hstAddStory(data) {
        storyData.push(data)
      },
      __hstStoryFile: file,
    })),
  })

  // Call app setups to resolve global assets such as components

  const setupApi: SvelteStorySetupApi = {
    app,
    story: null,
    variant: null,
  }

  if (typeof generatedSetup?.setupSvelte3 === 'function') {
    await generatedSetup.setupSvelte3(setupApi)
  }

  if (typeof setup?.setupSvelte3 === 'function') {
    await setup.setupSvelte3(setupApi)
  }

  if (typeof generatedSetup?.setupSvelte4 === 'function') {
    await generatedSetup.setupSvelte4(setupApi)
  }

  if (typeof setup?.setupSvelte4 === 'function') {
    await setup.setupSvelte4(setupApi)
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
