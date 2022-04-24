import '$histoire-theme'
import '../../style.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import FloatingVue from 'floating-vue'
import App from './App.vue'
import { registerGlobalComponents } from './global-components.js'
import { router } from './router'

const app = createApp(App)
app.use(createPinia())
app.use(FloatingVue, {
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
registerGlobalComponents(app)
app.mount('#app')
