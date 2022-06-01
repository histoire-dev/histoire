import { createRouter, createWebHistory } from 'vue-router'

export const base = import.meta.env.BASE_URL as string

export const router = createRouter({
  history: createWebHistory(base),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('./components/HomeView.vue'),
    },
    {
      path: '/story/:storyId',
      name: 'story',
      component: () => import('./components/story/StoryView.vue'),
    },
  ],
})
