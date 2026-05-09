import { createRouter, createWebHashHistory } from 'vue-router';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('../views/Dashboard.vue'),
    },
    {
      path: '/brain',
      name: 'brain',
      component: () => import('../views/AiBrain.vue'),
    },
    {
      path: '/projects',
      name: 'projects',
      component: () => import('../views/ProjectList.vue'),
    },
    {
      path: '/projects/:id',
      name: 'project-detail',
      component: () => import('../views/ProjectDetail.vue'),
      props: true,
    },
    {
      path: '/global',
      name: 'global',
      component: () => import('../views/GlobalMemories.vue'),
    },
    {
      path: '/logs',
      name: 'logs',
      component: () => import('../views/OperationLogs.vue'),
    },
    {
      path: '/mcp',
      name: 'mcp',
      component: () => import('../views/McpTools.vue'),
    },
    {
      path: '/memory/global/:id',
      name: 'global-memory-detail',
      component: () => import('../views/MemoryDetail.vue'),
      props: true,
    },
    {
      path: '/memory/:projectId/:id',
      name: 'project-memory-detail',
      component: () => import('../views/MemoryDetail.vue'),
      props: true,
    },
  ],
});

export default router;
