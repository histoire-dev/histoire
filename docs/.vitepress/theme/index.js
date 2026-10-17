import { Icon } from '@iconify/vue'
import FloatingVue from 'floating-vue'
import DefaultTheme from 'vitepress/theme'
import DemoLinks from './DemoLinks.vue'
import DemoPreview from './DemoPreview.vue'
import MeetTeam from './MeetTeam.vue'
import SponsorButton from './SponsorButton.vue'
import 'floating-vue/dist/style.css'
import './style/vars.pcss'
import './style/index.pcss'

export default {
  ...DefaultTheme,
  /** Preserve built-in components before registering Histoire's docs components. */
  enhanceApp(context) {
    DefaultTheme.enhanceApp?.(context)
    const { app } = context
    app.use(FloatingVue, {
      themes: {
        dropdown: {
          computeTransformOrigin: true,
        },
      },
    })
    app.component('Icon', Icon)
    app.component('SponsorButton', SponsorButton)
    app.component('MeetTeam', MeetTeam)
    app.component('DemoPreview', DemoPreview)
    app.component('DemoLinks', DemoLinks)
  },
}
