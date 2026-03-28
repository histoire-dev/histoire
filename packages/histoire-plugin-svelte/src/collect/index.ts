import type { ServerRunPayload } from '@histoire/shared'
import type { SvelteStorySetupApi } from '../helpers.js'
import { tick } from 'svelte'
// @ts-expect-error virtual module id
import * as generatedSetup from 'virtual:$histoire-generated-global-setup'
// @ts-expect-error virtual module id
import * as setup from 'virtual:$histoire-setup'
import {
  callSetupFunctions,
  mountSvelteComponent,
} from '../util/svelte.js'
import Story from './Story.svelte'
import Variant from './Variant.svelte'

export async function run({ file, el, storyData }: ServerRunPayload) {
  const { default: Comp } = await import(/* @vite-ignore */ file.moduleId)

  const mountedApp = await mountSvelteComponent(Comp, {
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
  }, 'client')
  const app = mountedApp.app

  const setupApi: SvelteStorySetupApi = {
    app,
    story: null,
    variant: null,
  }

  await callSetupFunctions(generatedSetup, setup, setupApi)

  await tick()

  if (!storyData[0]?.variants.length) {
    storyData[0].variants.push({
      id: '_default',
      title: 'default',
    })
  }

  mountedApp.destroy()
}
