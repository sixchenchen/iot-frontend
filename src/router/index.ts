import { createRouter, createWebHistory } from 'vue-router'
import { routes } from './routes' // 必须引入真正的路由表
import { setupGuards } from './guards' // 引入守卫

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

// 挂载路由守卫
setupGuards(router)

export default router