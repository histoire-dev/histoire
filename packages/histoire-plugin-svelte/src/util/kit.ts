/** Small structural contract works with both Vite 7 and Vite 8 plugin types. */
interface KitMiddlewarePlugin {
  /** Final plugin name. */
  name: string
  /** Kit application SSR middleware. */
  configureServer?: unknown
  /** Kit application production preview middleware. */
  configurePreviewServer?: unknown
}

/** Keep Kit's aliases and virtual modules while Histoire owns HTML and middleware. */
export function isolateSvelteKit() {
  return {
    name: 'histoire:sveltekit-middleware',
    enforce: 'post' as const,
    config: {
      order: 'post' as const,
      /** Kit's custom app middleware is removed; restore Histoire's SPA fallback. */
      handler: (_config: unknown, environment: { command: string }) => ({
        appType: 'spa' as const,
        // Kit's removed application compiler normally injects this payload in
        // production. Histoire mounts stories without a Kit application shell.
        ...(environment.command === 'build' ? { define: { __SVELTEKIT_PAYLOAD__: '{}' } } : {}),
      }),
    },
    /** Kit 3 moved SSR middleware from compile into setup; previews need no Kit SSR. */
    configResolved(config: { readonly plugins: readonly KitMiddlewarePlugin[] }) {
      for (const plugin of config.plugins) {
        if (plugin.name !== 'vite-plugin-sveltekit-setup') continue
        plugin.configureServer = undefined
        plugin.configurePreviewServer = undefined
      }
    },
  }
}
