import { createRouter, createWebHistory } from 'vue-router';
import SpatialShell from './components/SpatialShell.vue';
import StartPage from './pages/StartPage.vue';
import SessionDetailPage from './pages/SessionDetailPage.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'shell',
      component: SpatialShell,
      children: [
        {
          path: '',
          name: 'home',
          component: StartPage,
        },
        {
          path: 'session/:id',
          name: 'session-detail',
          component: SessionDetailPage,
        },
      ],
    },
  ],
});

export default router;
