const storyFileRE = /\.story\.svelte$/

type DynamicCompileOptions = NonNullable<SveltePluginApi['options']>['dynamicCompileOptions']

interface SveltePluginApi {
  options?: {
    dynamicCompileOptions?: (data: {
      filename: string
      code: string
      compileOptions: Record<string, any>
    }) => Partial<Record<string, any>> | void | Promise<Partial<Record<string, any>> | void>
  }
}

interface SvelteConfigPlugin {
  name: string
  api?: SveltePluginApi
  __histoireStoryHmrPatched?: boolean
}

export function disableStoryComponentHmr() {
  return {
    name: 'histoire:svelte-story-hmr',
    apply: 'serve' as const,
    configResolved(config: { readonly plugins: readonly unknown[] }) {
      for (const plugin of config.plugins as SvelteConfigPlugin[]) {
        if (plugin.name !== 'vite-plugin-svelte:config' || plugin.__histoireStoryHmrPatched) {
          continue
        }

        const options = plugin.api?.options
        if (!options) {
          continue
        }

        const originalDynamicCompileOptions = options.dynamicCompileOptions as DynamicCompileOptions
        options.dynamicCompileOptions = async (data) => {
          const result = await originalDynamicCompileOptions?.(data)
          if (!storyFileRE.test(data.filename)) {
            return result
          }

          return {
            ...result,
            hmr: false,
          }
        }
        plugin.__histoireStoryHmrPatched = true
      }
    },
  }
}
