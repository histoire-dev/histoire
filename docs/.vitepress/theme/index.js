import DefaultTheme from 'vitepress/theme'
import FloatingVue from 'floating-vue'
import { Icon } from '@iconify/vue'
import 'floating-vue/dist/style.css'
import './style/vars.pcss'
import './style/index.pcss'
import SponsorButton from './SponsorButton.vue'
import MeetTeam from './MeetTeam.vue'
import DemoPreview from './DemoPreview.vue'
import DemoLinks from './DemoLinks.vue'

export default {
  ...DefaultTheme,
  enhanceApp ({ app }) {
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
