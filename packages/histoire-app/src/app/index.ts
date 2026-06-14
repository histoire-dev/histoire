import FloatingVue from 'floating-vue'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { setupPluginApi } from './plugin.js'
import { router } from './router'
import 'virtual:$histoire-theme'

export async function mountMainApp() {
  const app = createApp(App)
  app.use(createPinia())
  app.use(FloatingVue, {
    // Anchor poppers inside the chrome scope so the @scope-wrapped chrome CSS
    // reaches them. The default <body> teleport target is outside the scope.
    container: '.histoire-app-root',
    overflowPadding: 4,
    arrowPadding: 8,
    themes: {
      tooltip: {
        distance: 8,
      },
      dropdown: {
        computeTransformOrigin: true,
        distance: 8,
      },
    },
  })
  app.use(router)
  app.mount('#app')

  if (import.meta.hot) {
    import.meta.hot.send('histoire:mount', {})

    /* #__PURE__ */ setupPluginApi()
  }
}
