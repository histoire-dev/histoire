import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('./components/HomeView.vue'),
    },
    {
      path: '/story/:storyId',
      name: 'story',
      component: () => import('./components/StoryView.vue'),
    },
  ],
})
