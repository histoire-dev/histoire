import type { ServerStory } from '@histoire/shared'
import type { PreviewRuntimeStoryFile } from '../../virtual/preview-runtime/preamble.js'
import { buildPreviewRuntimeSource, buildStoryModuleLoaders } from '../../virtual/preview-runtime/index.js'

/**
 * Story id packed with every character that could break out of the string,
 * object key or template literal it is baked into: quotes, a backslash, a
 * backtick, a `${` interpolation opener, a newline and a closing script tag.
 */
// eslint-disable-next-line no-template-curly-in-string -- the `${` opener is the point of this fixture
export const HOSTILE_STORY_ID = 'ho\'st"ile`\\${alert(1)}\n</script>'

/**
 * Story files baked into the generated runtime by the specs: a plain story, a
 * story with a companion markdown docs file, and a story whose id (and module
 * id) are hostile to the emitted literals.
 */
export const previewRuntimeStubStoryFiles: PreviewRuntimeStoryFile[] = [
  {
    id: 'plain-story',
    path: ['Components', 'Button'],
    filePath: 'src/Button.story.vue',
    docsFilePath: undefined,
    supportPluginId: 'vue3',
    story: {
      id: 'plain-story',
      title: 'Button',
      variants: [{ id: 'default', title: 'Default' }],
    } satisfies ServerStory,
    moduleId: '/src/Button.story.vue',
  },
  {
    id: 'documented-story',
    path: ['Components', 'Card'],
    filePath: 'src/Card.story.vue',
    docsFilePath: 'src/Card.story.md',
    supportPluginId: 'vue3',
    story: {
      id: 'documented-story',
      title: 'Card',
      docsText: '# Card',
      variants: [{ id: 'default', title: 'Default' }],
    } satisfies ServerStory,
    moduleId: '/src/Card.story.vue',
  },
  {
    id: HOSTILE_STORY_ID,
    path: ['Hostile'],
    filePath: 'src/ho\'st"ile`.story.vue',
    docsFilePath: undefined,
    supportPluginId: 'vue3',
    story: {
      id: HOSTILE_STORY_ID,
      // eslint-disable-next-line no-template-curly-in-string -- hostile fixture value
      title: 'Hos`tile ${title}',
      variants: [{ id: 'v`1${}', title: 'D"efault' }],
    } satisfies ServerStory,
    // eslint-disable-next-line no-template-curly-in-string -- hostile fixture value
    moduleId: '/src/ho\'st"ile`${x}.story.vue',
  },
]

/**
 * Generates the preview runtime source with stub module ids and the story files
 * above, without touching the module resolver or a real `Context`.
 *
 * @param hasVitestPreview Selects the branch to generate: `true` emits the
 * Vitest mocker imports and environment bootstrap, `false` the plain runtime.
 */
export function generatePreviewRuntimeSource(hasVitestPreview = true) {
  return buildPreviewRuntimeSource({
    hasVitestPreview,
    vitestSpyId: '/stub/node_modules/@vitest/spy/dist/index.js',
    vitestMockerBrowserId: '/stub/node_modules/@vitest/mocker/dist/browser.js',
    histoireSharedId: '/stub/node_modules/@histoire/shared/dist/index.js',
    variantTestSessionId: '/stub/histoire/virtual/variant-test-session.js',
    staticMockRuntimeId: '/stub/histoire/virtual/vitest-static-mock-runtime.js',
    files: previewRuntimeStubStoryFiles,
    loaders: buildStoryModuleLoaders(previewRuntimeStubStoryFiles),
  })
}
