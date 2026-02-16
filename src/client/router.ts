import { createRouter, createWebHistory } from 'vue-router';
import LandingPage from './pages/LandingPage.vue';
import SessionDetailPage from './pages/SessionDetailPage.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'landing',
      component: LandingPage,
    },
    {
      path: '/session/:id',
      name: 'session-detail',
      component: SessionDetailPage,
    },
  ],
});

export default router;
