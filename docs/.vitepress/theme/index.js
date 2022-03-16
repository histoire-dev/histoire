import DefaultTheme from 'vitepress/dist/client/theme-default'
import FloatingVue from 'floating-vue'
import { Icon } from '@iconify/vue'
import 'floating-vue/dist/style.css'
import './vars.css'
import './index.css'
import SponsorButton from './SponsorButton.vue'
import MeetTeam from './MeetTeam.vue'
import DemoPreview from './DemoPreview.vue'

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
  },
}
