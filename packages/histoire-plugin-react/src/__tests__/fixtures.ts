import type { ServerRunPayload, Story } from '@histoire/shared'
import type { Component } from '@histoire/vendors/vue'
import type { ComponentType } from 'react'
import { createApp, h, reactive } from '@histoire/vendors/vue'

/** DOM-backed collection payload with deterministic file metadata. */
export function collectionPayload(): ServerRunPayload {
  return {
    file: { id: 'button', fileName: 'Button', moduleId: '', path: '', relativePath: '', supportPluginId: 'react' },
    storyData: [],
    el: document.createElement('div'),
  }
}

/** Runtime story with independent reactive state per variant. */
export function runtimeStory(component: ComponentType, ids = ['button-0', 'button-1']): Story {
  const story = reactive({
    id: 'button',
    title: 'Button',
    variants: ids.map(id => ({ id, title: id, state: {} })),
  }) as Story
  story.file = { id: story.id, supportPluginId: 'react', component, story, path: [], filePath: '', source: async () => ({ default: '' }) }
  return story
}

/** Owned Vue adapter host with explicit readiness and cleanup. */
export function mountAdapter(component: Component, props: Record<string, unknown>, onReady = () => {}) {
  const target = document.createElement('div')
  document.body.append(target)
  let resolveReady!: () => void
  const ready = new Promise<void>(resolve => resolveReady = resolve)
  const app = createApp({
    render: () => h(component, {
      ...props,
      /** Resolve public readiness and expose event count to lifecycle tests. */
      onReady() {
        onReady()
        resolveReady()
      },
    }),
  })
  app.mount(target)
  return {
    target,
    ready,
    /** Unmount framework roots before removing DOM ownership. */
    close() {
      app.unmount()
      target.remove()
    },
  }
}
