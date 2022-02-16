import './histoire.css'
import { defineVue3StorySetup } from 'histoire/client'

export default defineVue3StorySetup(({ app }) => {
  app.provide('demo', 42)
})
